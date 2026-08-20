import { SegmentLedger } from '../src/main/engine/SegmentLedger';

describe('Atomic Segment Ledger & Zero-Overlap/Gap Guarantee', () => {
  it('should initialize and claim discrete non-overlapping byte ranges', () => {
    const totalBytes = 10 * 1024 * 1024; // 10 MB
    const ledger = new SegmentLedger('dl_ledger_1', totalBytes);
    const segments = ledger.initialize(4);

    expect(segments.length).toBe(4);
    expect(ledger.validateZeroOverlap()).toBe(true);

    const claimed = ledger.claimNextAvailable('worker_1');
    expect(claimed).not.toBeNull();
    expect(claimed?.claimedBy).toBe('worker_1');
    expect(claimed?.status).toBe('CLAIMED');
  });

  it('should guarantee zero gap when all segments complete', () => {
    const totalBytes = 1000;
    const ledger = new SegmentLedger('dl_gap_test', totalBytes);
    const segments = ledger.initialize(2); // [0-499], [500-999]

    ledger.updateProgress(1, 500);
    ledger.markCompleted(1);

    ledger.updateProgress(2, 500);
    ledger.markCompleted(2);

    const gapCheck = ledger.validateZeroGap();
    expect(gapCheck.valid).toBe(true);
    expect(ledger.isAllCompleted()).toBe(true);
  });

  it('should atomically split remaining ranges during work stealing without creating gaps or overlaps', () => {
    const totalBytes = 10 * 1024 * 1024; // 10 MB
    const ledger = new SegmentLedger('dl_steal_test', totalBytes);
    const segments = ledger.initialize(1); // 1 big segment [0 - 10485759]

    const initialSeg = ledger.claimNextAvailable('worker_donor');
    expect(initialSeg).not.toBeNull();

    // Donor has downloaded 2MB so far, 8MB remaining
    ledger.updateProgress(1, 2 * 1024 * 1024);

    // Thief worker steals upper half
    const stolen = ledger.claimWorkSteal(1, 'worker_thief');
    expect(stolen).not.toBeNull();
    expect(stolen?.claimedBy).toBe('worker_thief');

    expect(ledger.validateZeroOverlap()).toBe(true);
  });
});
