import { MonotonicClock } from '../src/main/engine/MonotonicClock';

describe('Monotonic Clock & 64-Bit Offset Safety Suite', () => {
  it('should measure monotonic elapsed time unaffected by wall-clock changes', async () => {
    const startNano = MonotonicClock.nowNanoseconds();
    await new Promise((r) => setTimeout(r, 40));
    const elapsed = MonotonicClock.elapsedSeconds(startNano);

    expect(elapsed).toBeGreaterThanOrEqual(0.03);
    expect(elapsed).toBeLessThan(0.5);
  });

  it('should safely convert large byte offsets beyond 4GB (64-bit safe)', () => {
    const hugeOffset = 50 * 1024 * 1024 * 1024; // 50 GB
    const safeBig = MonotonicClock.safeByteOffset(hugeOffset);

    expect(safeBig.toString()).toBe('53687091200');
    expect(MonotonicClock.safeByteOffset(-100).toString()).toBe('0');
  });
});
