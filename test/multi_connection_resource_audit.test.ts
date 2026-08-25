import { ResourceGovernor } from '../src/main/intelligence/ResourceGovernor';
import { TransferWorkerPool } from '../src/main/engine/TransferWorkerPool';

describe('Multi-Connection Resource Audit & Safety Bounding', () => {
  test('ResourceGovernor enforces global socket limits and reports throttling conditions', () => {
    const governor = new ResourceGovernor();
    const limits = governor.getLimits();

    expect(limits.maxGlobalSockets).toBe(64);
    expect(limits.maxActiveWorkers).toBe(32);

    // Normal load
    const normalSnap = governor.getSnapshot(16, 20);
    expect(normalSnap.isThrottlingRequired).toBe(false);

    // Sockets at limit
    const saturatedSnap = governor.getSnapshot(64, 70);
    expect(saturatedSnap.isThrottlingRequired).toBe(true);
    expect(saturatedSnap.throttleReason).toContain('Global socket pool limit reached');
  });

  test('TransferWorkerPool manages worker states without unbounded socket creation', () => {
    const pool = new TransferWorkerPool(32);

    for (let i = 0; i < 20; i++) {
      pool.registerWorker(`worker-${i}`, i + 1, 'dl-test', 'HTTP/2');
    }

    expect(pool.getAllWorkers('dl-test').length).toBe(20);
    expect(pool.getIdleWorkers('dl-test').length).toBe(20);

    // Update state to ACTIVE
    pool.recordWorkerBytes('worker-0', 1024 * 1024, 500 * 1024);
    const w0 = pool.getWorker('worker-0');
    expect(w0?.status).toBe('ACTIVE');
    expect(w0?.productivityScore).toBe(100);

    pool.clear();
    expect(pool.getAllWorkers().length).toBe(0);
  });
});
