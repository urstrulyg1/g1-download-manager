import { EventEmitter } from 'events';
import { SegmentInfo } from '../../shared/types';

export interface DetailedSegmentState extends SegmentInfo {
  throughput: number; // bytes/sec
  rttMs: number;
  retryCount: number;
  lastActivity: number;
  failureReason?: string;
  stolenFromSegmentId?: number;
}

export interface WorkStealEvent {
  stolenFromSegmentId: number;
  newSegmentId: number;
  stolenRange: { start: number; end: number; bytes: number };
  connectionId: number;
  timestamp: number;
}

export class DynamicSegmentScheduler extends EventEmitter {
  private segments: Map<number, DetailedSegmentState> = new Map();
  private nextSegmentId = 1;
  private totalFileBytes: number;
  private minWorkStealThresholdBytes = 256 * 1024; // 256 KB minimum remaining to steal

  constructor(totalFileBytes: number, initialSegments: SegmentInfo[] = []) {
    super();
    this.totalFileBytes = totalFileBytes;

    if (initialSegments.length > 0) {
      for (const s of initialSegments) {
        this.segments.set(s.id, {
          ...s,
          throughput: s.speed || 0,
          rttMs: 50,
          retryCount: 0,
          lastActivity: Date.now(),
        });
      }
      this.nextSegmentId = Math.max(...initialSegments.map((s) => s.id), 0) + 1;
    }
  }

  public initializeSegments(concurrency: number): DetailedSegmentState[] {
    this.segments.clear();

    if (this.totalFileBytes <= 0 || concurrency <= 1) {
      const seg: DetailedSegmentState = {
        id: 1,
        startOffset: 0,
        endOffset: this.totalFileBytes > 0 ? this.totalFileBytes - 1 : -1,
        downloadedBytes: 0,
        currentOffset: 0,
        status: 'pending',
        connectionId: 1,
        speed: 0,
        throughput: 0,
        rttMs: 50,
        retryCount: 0,
        lastActivity: Date.now(),
      };
      this.segments.set(1, seg);
      this.nextSegmentId = 2;
      return [seg];
    }

    const chunkSize = Math.floor(this.totalFileBytes / concurrency);
    const initialList: DetailedSegmentState[] = [];

    for (let i = 0; i < concurrency; i++) {
      const start = i * chunkSize;
      const end = i === concurrency - 1 ? this.totalFileBytes - 1 : (i + 1) * chunkSize - 1;
      const seg: DetailedSegmentState = {
        id: i + 1,
        startOffset: start,
        endOffset: end,
        downloadedBytes: 0,
        currentOffset: start,
        status: 'pending',
        connectionId: i + 1,
        speed: 0,
        throughput: 0,
        rttMs: 50,
        retryCount: 0,
        lastActivity: Date.now(),
      };
      this.segments.set(seg.id, seg);
      initialList.push(seg);
    }

    this.nextSegmentId = concurrency + 1;
    return initialList;
  }

  public getSegments(): DetailedSegmentState[] {
    return Array.from(this.segments.values()).sort((a, b) => a.startOffset - b.startOffset);
  }

  public getSegment(id: number): DetailedSegmentState | undefined {
    return this.segments.get(id);
  }

  public updateSegmentProgress(
    id: number,
    bytesDownloaded: number,
    throughput: number,
    rttMs: number = 50
  ): void {
    const seg = this.segments.get(id);
    if (!seg) return;

    seg.currentOffset += bytesDownloaded;
    seg.downloadedBytes += bytesDownloaded;
    seg.throughput = throughput;
    seg.speed = throughput;
    seg.rttMs = rttMs;
    seg.lastActivity = Date.now();

    if (seg.endOffset !== -1 && seg.currentOffset > seg.endOffset) {
      seg.status = 'completed';
    }
  }

  public markSegmentCompleted(id: number): void {
    const seg = this.segments.get(id);
    if (seg) {
      seg.status = 'completed';
      seg.speed = 0;
      seg.throughput = 0;
      seg.lastActivity = Date.now();
    }
  }

  public markSegmentFailed(id: number, reason: string): void {
    const seg = this.segments.get(id);
    if (seg) {
      seg.status = 'failed';
      seg.failureReason = reason;
      seg.retryCount++;
      seg.speed = 0;
      seg.throughput = 0;
      seg.lastActivity = Date.now();
    }
  }

  public attemptWorkSteal(idleConnectionId: number): DetailedSegmentState | null {
    if (this.totalFileBytes <= 0) return null;

    // Find the active segment with the largest remaining unfinished byte range
    let bestCandidate: DetailedSegmentState | null = null;
    let maxRemaining = 0;

    for (const seg of this.segments.values()) {
      if (seg.status === 'downloading' && seg.endOffset > seg.currentOffset) {
        const remaining = seg.endOffset - seg.currentOffset;
        if (remaining > maxRemaining && remaining >= this.minWorkStealThresholdBytes) {
          maxRemaining = remaining;
          bestCandidate = seg;
        }
      }
    }

    if (!bestCandidate || maxRemaining < this.minWorkStealThresholdBytes) {
      return null;
    }

    // Split the remaining range in half
    const half = Math.floor(maxRemaining / 2);
    const originalEnd = bestCandidate.endOffset;
    const splitPoint = bestCandidate.currentOffset + half;

    // Donor segment shrinks its end boundary
    bestCandidate.endOffset = splitPoint;

    // New stolen segment takes the upper half
    const newSegment: DetailedSegmentState = {
      id: this.nextSegmentId++,
      startOffset: splitPoint + 1,
      endOffset: originalEnd,
      downloadedBytes: 0,
      currentOffset: splitPoint + 1,
      status: 'pending',
      connectionId: idleConnectionId,
      speed: 0,
      throughput: 0,
      rttMs: 50,
      retryCount: 0,
      lastActivity: Date.now(),
      stolenFromSegmentId: bestCandidate.id,
    };

    this.segments.set(newSegment.id, newSegment);

    const event: WorkStealEvent = {
      stolenFromSegmentId: bestCandidate.id,
      newSegmentId: newSegment.id,
      stolenRange: { start: splitPoint + 1, end: originalEnd, bytes: originalEnd - splitPoint },
      connectionId: idleConnectionId,
      timestamp: Date.now(),
    };

    this.emit('work_stolen', event);
    return newSegment;
  }

  public isAllCompleted(): boolean {
    if (this.segments.size === 0) return false;
    for (const s of this.segments.values()) {
      if (s.status !== 'completed') return false;
    }
    return true;
  }
}
