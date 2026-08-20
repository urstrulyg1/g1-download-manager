import { SegmentLedger } from '../src/main/engine/SegmentLedger';

describe('Large File 64-Bit Offset Safety Suite', () => {
  it('should handle 100GB+ file partitions without 32-bit integer overflow', () => {
    const huge100Gb = 100 * 1024 * 1024 * 1024; // 107,374,182,400 bytes (> 2^32)
    const ledger = new SegmentLedger('dl_100gb', huge100Gb);
    const segments = ledger.initialize(8);

    expect(segments.length).toBe(8);
    expect(segments[0].startOffset).toBe(0);
    expect(segments[7].endOffset).toBe(huge100Gb - 1);
    expect(ledger.validateZeroOverlap()).toBe(true);
  });
});
