import { SegmentLedger, LedgerSegment } from '../src/main/engine/SegmentLedger';

describe('SegmentLedger Formal Invariants & Property-Based Verification', () => {
  test('Initializes segment ranges with zero gaps and zero overlaps', () => {
    const totalBytes = 10 * 1024 * 1024; // 10MB
    const ledger = new SegmentLedger('test-dl-1', totalBytes);
    const segments = ledger.initialize(8);

    expect(segments.length).toBe(8);
    expect(ledger.validateZeroOverlap()).toBe(true);

    const inv = ledger.validateInvariants();
    expect(inv.valid).toBe(true);
    expect(inv.errors).toHaveLength(0);

    // Verify first and last offsets
    expect(segments[0].startOffset).toBe(0);
    expect(segments[segments.length - 1].endOffset).toBe(totalBytes - 1);
  });

  test('Work stealing preserves range continuity without overlaps or missing bytes', () => {
    const totalBytes = 4 * 1024 * 1024; // 4MB
    const ledger = new SegmentLedger('test-dl-2', totalBytes);
    ledger.initialize(2);

    // Claim and start downloading segment 1
    const seg1 = ledger.claimNextAvailable('worker-1');
    expect(seg1).not.toBeNull();

    // Advance segment 1 by 512KB
    ledger.updateProgress(1, 512 * 1024);

    // Worker 2 steals work from segment 1
    const stolen = ledger.claimWorkSteal(1, 'worker-2', 256 * 1024);
    expect(stolen).not.toBeNull();

    // Check invariants
    expect(ledger.validateZeroOverlap()).toBe(true);
    const inv = ledger.validateInvariants();
    expect(inv.valid).toBe(true);

    // Mark all segments completed
    for (const s of ledger.getSegments()) {
      ledger.markCompleted(s.segmentId);
    }

    const gapResult = ledger.validateZeroGap();
    expect(gapResult.valid).toBe(true);

    const check = ledger.isCompleteAndConsistent();
    expect(check.consistent).toBe(true);
    expect(ledger.getTotalCompletedBytes()).toBe(totalBytes);
  });

  test('Randomized Property Test: 10,000 randomized segment layouts maintain formal invariants', () => {
    for (let iteration = 0; iteration < 10000; iteration++) {
      const fileSize = Math.floor(Math.random() * 50_000_000) + 1024 * 1024; // 1MB to 51MB
      const segmentCount = Math.floor(Math.random() * 16) + 1; // 1 to 16

      const ledger = new SegmentLedger(`random-dl-${iteration}`, fileSize);
      ledger.initialize(segmentCount);

      // Perform random operations (progress updates, work steals, fails, retries)
      const opCount = Math.floor(Math.random() * 8) + 2;
      for (let op = 0; op < opCount; op++) {
        const segs = ledger.getSegments();
        const randSeg = segs[Math.floor(Math.random() * segs.length)];

        const action = Math.random();
        if (action < 0.4) {
          // Progress update
          const remaining = randSeg.endOffset - randSeg.currentOffset + 1;
          if (remaining > 0) {
            const delta = Math.floor(Math.random() * Math.min(remaining, 64 * 1024));
            ledger.updateProgress(randSeg.segmentId, delta);
          }
        } else if (action < 0.6) {
          // Work steal
          ledger.claimWorkSteal(randSeg.segmentId, `thief-${op}`, 128 * 1024);
        } else if (action < 0.8) {
          // Fail
          ledger.markFailed(randSeg.segmentId, 'Random simulated failure');
        } else {
          // Release
          ledger.releaseClaim(randSeg.segmentId);
        }
      }

      // Range invariants must strictly hold at every stage
      const inv = ledger.validateInvariants();
      expect(inv.valid).toBe(true);
      expect(ledger.validateZeroOverlap()).toBe(true);

      // Finally, complete all segments and verify sum === fileSize
      for (const s of ledger.getSegments()) {
        ledger.markCompleted(s.segmentId);
      }

      const consistency = ledger.isCompleteAndConsistent();
      expect(consistency.consistent).toBe(true);
      expect(ledger.getTotalCompletedBytes()).toBe(fileSize);
    }
  });
});
