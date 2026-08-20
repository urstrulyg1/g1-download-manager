export class MonotonicClock {
  public static nowNanoseconds(): bigint {
    return process.hrtime.bigint();
  }

  public static nowMilliseconds(): number {
    return Number(process.hrtime.bigint() / BigInt(1_000_000));
  }

  public static elapsedSeconds(startNanoseconds: bigint): number {
    const elapsed = process.hrtime.bigint() - startNanoseconds;
    return Number(elapsed) / 1_000_000_000;
  }

  public static safeByteOffset(offset: number | bigint): bigint {
    if (typeof offset === 'bigint') return offset;
    if (offset < 0 || isNaN(offset)) return BigInt(0);
    return BigInt(Math.floor(offset));
  }
}
