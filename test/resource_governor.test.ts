import { ResourceGovernor } from '../src/main/intelligence/ResourceGovernor';

describe('Resource Governor & Hard Safety Limits', () => {
  it('should take real system snapshots and enforce safety limits', () => {
    const governor = new ResourceGovernor();
    const snapshot = governor.getSnapshot(8, 12);

    expect(typeof snapshot.cpuLoadPct).toBe('number');
    expect(typeof snapshot.memoryUsedBytes).toBe('number');
    expect(snapshot.activeSocketsCount).toBe(8);
    expect(snapshot.openFdCount).toBe(12);

    const limits = governor.getLimits();
    expect(limits.maxGlobalSockets).toBe(64);
    expect(limits.maxMemoryBufferBytes).toBe(64 * 1024 * 1024);
  });
});
