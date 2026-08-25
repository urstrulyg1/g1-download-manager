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
  endOffset: number; // inclusive, -1 for unknown size single-stream
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

export interface LedgerValidationResult {
  valid: boolean;
  errors: string[];
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
    if (!seg || bytesDelta <= 0) return;

    const maxAllowed = seg.endOffset !== -1 ? seg.endOffset - seg.currentOffset + 1 : bytesDelta;
    const actualDelta = Math.min(bytesDelta, Math.max(0, maxAllowed));

    seg.currentOffset += actualDelta;
    seg.bytesCompleted += actualDelta;
    seg.status = 'DOWNLOADING';
    seg.updatedAt = Date.now();

    if (seg.endOffset !== -1 && seg.currentOffset > seg.endOffset) {
      seg.status = 'COMPLETED';
    }
  }

  public markCompleted(segmentId: number): void {
    const seg = this.segments.get(segmentId);
    if (seg) {
      if (seg.endOffset !== -1) {
        seg.currentOffset = seg.endOffset + 1;
        seg.bytesCompleted = seg.endOffset - seg.startOffset + 1;
      }
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

  public getTotalCompletedBytes(): number {
    let sum = 0;
    for (const seg of this.segments.values()) {
      if (seg.status !== 'ABANDONED') {
        sum += seg.bytesCompleted;
      }
    }
    return sum;
  }

  public validateInvariants(): LedgerValidationResult {
    const errors: string[] = [];
    const list = Array.from(this.segments.values())
      .filter((s) => s.status !== 'ABANDONED')
      .sort((a, b) => a.startOffset - b.startOffset);

    for (let i = 0; i < list.length; i++) {
      const s = list[i];

      // 1. Negative range checks
      if (s.startOffset < 0) {
        errors.push(`Segment ${s.segmentId} has negative startOffset: ${s.startOffset}`);
      }
      if (s.endOffset !== -1 && s.endOffset < s.startOffset) {
        errors.push(`Segment ${s.segmentId} has endOffset (${s.endOffset}) < startOffset (${s.startOffset})`);
      }

      // 2. Out-of-bounds checks
      if (this.totalBytes > 0 && s.endOffset >= this.totalBytes) {
        errors.push(`Segment ${s.segmentId} endOffset (${s.endOffset}) exceeds totalBytes (${this.totalBytes})`);
      }

      // 3. Impossible progress
      if (s.bytesCompleted < 0) {
        errors.push(`Segment ${s.segmentId} has negative bytesCompleted: ${s.bytesCompleted}`);
      }
      if (s.endOffset !== -1) {
        const span = s.endOffset - s.startOffset + 1;
        if (s.bytesCompleted > span) {
          errors.push(`Segment ${s.segmentId} bytesCompleted (${s.bytesCompleted}) exceeds span (${span})`);
        }
      }

      // 4. Overlap check with next segment
      if (i < list.length - 1) {
        const next = list[i + 1];
        if (s.endOffset >= next.startOffset) {
          errors.push(`Overlap between Segment ${s.segmentId} [${s.startOffset}-${s.endOffset}] and Segment ${next.segmentId} [${next.startOffset}-${next.endOffset}]`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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

  public isCompleteAndConsistent(): { consistent: boolean; reason?: string } {
    if (!this.isAllCompleted()) {
      return { consistent: false, reason: 'Not all segments are in COMPLETED status' };
    }

    const inv = this.validateInvariants();
    if (!inv.valid) {
      return { consistent: false, reason: `Invariant violations: ${inv.errors.join('; ')}` };
    }

    const gap = this.validateZeroGap();
    if (!gap.valid) {
      return { consistent: false, reason: gap.error };
    }

    if (this.totalBytes > 0) {
      const totalCompleted = this.getTotalCompletedBytes();
      if (totalCompleted !== this.totalBytes) {
        return {
          consistent: false,
          reason: `Total completed bytes mismatch: sum is ${totalCompleted}, expected ${this.totalBytes}`,
        };
      }
    }

    return { consistent: true };
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
