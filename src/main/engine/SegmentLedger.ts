import { EventEmitter } from 'events';

export type LedgerSegmentStatus =
  | 'AVAILABLE'
  | 'CLAIMED'
  | 'DOWNLOADING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'ABANDONED';

export interface LedgerSegment {
  segmentId: number;
  downloadId: string;
  startOffset: number;
  endOffset: number; // inclusive
  currentOffset: number;
  claimedBy?: string; // workerId
  status: LedgerSegmentStatus;
  bytesCompleted: number;
  version: number;
  checksum?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  stolenFromSegmentId?: number;
}

export class SegmentLedger extends EventEmitter {
  private downloadId: string;
  private totalBytes: number;
  private segments: Map<number, LedgerSegment> = new Map();
  private nextSegmentId = 1;

  constructor(downloadId: string, totalBytes: number, initialSegments: LedgerSegment[] = []) {
    super();
    this.downloadId = downloadId;
    this.totalBytes = totalBytes;

    if (initialSegments.length > 0) {
      for (const seg of initialSegments) {
        this.segments.set(seg.segmentId, { ...seg });
      }
      this.nextSegmentId = Math.max(...initialSegments.map((s) => s.segmentId), 0) + 1;
    }
  }

  public initialize(initialCount: number): LedgerSegment[] {
    this.segments.clear();

    if (this.totalBytes <= 0 || initialCount <= 1) {
      const seg: LedgerSegment = {
        segmentId: 1,
        downloadId: this.downloadId,
        startOffset: 0,
        endOffset: this.totalBytes > 0 ? this.totalBytes - 1 : -1,
        currentOffset: 0,
        status: 'AVAILABLE',
        bytesCompleted: 0,
        version: 1,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.segments.set(1, seg);
      this.nextSegmentId = 2;
      return [seg];
    }

    const count = Math.max(1, Math.min(initialCount, 64));
    const chunkSize = Math.floor(this.totalBytes / count);
    const result: LedgerSegment[] = [];

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? this.totalBytes - 1 : (i + 1) * chunkSize - 1;
      const seg: LedgerSegment = {
        segmentId: i + 1,
        downloadId: this.downloadId,
        startOffset: start,
        endOffset: end,
        currentOffset: start,
        status: 'AVAILABLE',
        bytesCompleted: 0,
        version: 1,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.segments.set(seg.segmentId, seg);
      result.push(seg);
    }

    this.nextSegmentId = count + 1;
    return result;
  }

  public claimNextAvailable(workerId: string): LedgerSegment | null {
    for (const seg of this.segments.values()) {
      if (seg.status === 'AVAILABLE' || (seg.status === 'FAILED' && seg.retryCount < 5)) {
        seg.status = 'CLAIMED';
        seg.claimedBy = workerId;
        seg.version++;
        seg.updatedAt = Date.now();
        this.emit('segment_claimed', { segmentId: seg.segmentId, workerId });
        return { ...seg };
      }
    }
    return null;
  }

  public claimWorkSteal(
    donorSegmentId: number,
    thiefWorkerId: string,
    minThresholdBytes = 256 * 1024
  ): LedgerSegment | null {
    const donor = this.segments.get(donorSegmentId);
    if (!donor) return null;

    if (donor.status !== 'DOWNLOADING' || donor.endOffset === -1) {
      return null;
    }

    const remaining = donor.endOffset - donor.currentOffset + 1;
    if (remaining < minThresholdBytes) {
      return null;
    }

    // Atomic split calculation
    const half = Math.floor(remaining / 2);
    const originalEnd = donor.endOffset;
    const splitPoint = donor.currentOffset + half;

    // Shrink donor segment boundary atomically
    donor.endOffset = splitPoint;
    donor.version++;
    donor.updatedAt = Date.now();

    // Create new stolen segment
    const stolenSegment: LedgerSegment = {
      segmentId: this.nextSegmentId++,
      downloadId: this.downloadId,
      startOffset: splitPoint + 1,
      endOffset: originalEnd,
      currentOffset: splitPoint + 1,
      claimedBy: thiefWorkerId,
      status: 'CLAIMED',
      bytesCompleted: 0,
      version: 1,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stolenFromSegmentId: donor.segmentId,
    };

    this.segments.set(stolenSegment.segmentId, stolenSegment);
    this.emit('work_stolen', {
      stolenFromSegmentId: donor.segmentId,
      newSegmentId: stolenSegment.segmentId,
      thiefWorkerId,
      stolenRange: [splitPoint + 1, originalEnd],
    });

    return { ...stolenSegment };
  }

  public updateProgress(segmentId: number, bytesDelta: number): void {
    const seg = this.segments.get(segmentId);
    if (!seg) return;

    seg.currentOffset += bytesDelta;
    seg.bytesCompleted += bytesDelta;
    seg.status = 'DOWNLOADING';
    seg.updatedAt = Date.now();

    if (seg.endOffset !== -1 && seg.currentOffset > seg.endOffset) {
      seg.status = 'COMPLETED';
    }
  }

  public markCompleted(segmentId: number): void {
    const seg = this.segments.get(segmentId);
    if (seg) {
      seg.status = 'COMPLETED';
      seg.version++;
      seg.updatedAt = Date.now();
      this.emit('segment_completed', { segmentId });
    }
  }

  public markFailed(segmentId: number, reason: string): void {
    const seg = this.segments.get(segmentId);
    if (seg) {
      seg.status = 'FAILED';
      seg.retryCount++;
      seg.claimedBy = undefined;
      seg.version++;
      seg.updatedAt = Date.now();
      this.emit('segment_failed', { segmentId, reason });
    }
  }

  public releaseClaim(segmentId: number): void {
    const seg = this.segments.get(segmentId);
    if (seg && (seg.status === 'CLAIMED' || seg.status === 'DOWNLOADING')) {
      seg.status = 'AVAILABLE';
      seg.claimedBy = undefined;
      seg.version++;
      seg.updatedAt = Date.now();
    }
  }

  public validateZeroOverlap(): boolean {
    const list = Array.from(this.segments.values())
      .filter((s) => s.status !== 'ABANDONED')
      .sort((a, b) => a.startOffset - b.startOffset);

    for (let i = 0; i < list.length - 1; i++) {
      const current = list[i];
      const next = list[i + 1];

      if (current.endOffset >= next.startOffset) {
        return false; // Overlap detected!
      }
    }
    return true;
  }

  public validateZeroGap(): { valid: boolean; missingBytes?: number; error?: string } {
    if (this.totalBytes <= 0) return { valid: true };

    const list = Array.from(this.segments.values())
      .filter((s) => s.status === 'COMPLETED')
      .sort((a, b) => a.startOffset - b.startOffset);

    let expectedStart = 0;
    for (const seg of list) {
      if (seg.startOffset !== expectedStart) {
        return {
          valid: false,
          missingBytes: seg.startOffset - expectedStart,
          error: `Missing byte gap between ${expectedStart} and ${seg.startOffset - 1}.`,
        };
      }
      expectedStart = seg.endOffset + 1;
    }

    if (expectedStart !== this.totalBytes) {
      return {
        valid: false,
        missingBytes: this.totalBytes - expectedStart,
        error: `Incomplete range: Covered ${expectedStart} of ${this.totalBytes} bytes.`,
      };
    }

    return { valid: true };
  }

  public getSegments(): LedgerSegment[] {
    return Array.from(this.segments.values()).sort((a, b) => a.startOffset - b.startOffset);
  }

  public isAllCompleted(): boolean {
    if (this.segments.size === 0) return false;
    for (const s of this.segments.values()) {
      if (s.status !== 'COMPLETED') return false;
    }
    return true;
  }
}
