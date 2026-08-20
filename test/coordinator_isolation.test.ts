import { TransferCoordinator } from '../src/main/engine/TransferCoordinator';
import { SegmentLedger } from '../src/main/engine/SegmentLedger';
import { TransferWorkerPool } from '../src/main/engine/TransferWorkerPool';
import { ParallelFileWriter } from '../src/main/storage/ParallelFileWriter';
import { TokenBucketRateLimiter } from '../src/main/engine/RateLimiter';
import * as path from 'path';
import * as fs from 'fs';

describe('Transfer Coordinator & Failure Isolation Suite', () => {
  const testDir = path.join(__dirname, 'tmp_coordinator_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should isolate worker failure and release segment claim without failing the entire download', () => {
    const ledger = new SegmentLedger('dl_iso_1', 1000);
    ledger.initialize(2);
    const pool = new TransferWorkerPool();
    const writer = new ParallelFileWriter(path.join(testDir, 'iso.bin'));
    const limiter = new TokenBucketRateLimiter(0);

    const coordinator = new TransferCoordinator('dl_iso_1', ledger, pool, writer, limiter);

    let isolatedEventFired = false;
    coordinator.on('worker_failed_isolated', () => {
      isolatedEventFired = true;
    });

    pool.registerWorker('w1', 1, 'dl_iso_1');
    ledger.claimNextAvailable('w1');

    coordinator.handleWorkerFailure('w1', 1, new Error('Socket reset'));

    expect(isolatedEventFired).toBe(true);
    expect(pool.getWorker('w1')?.status).toBe('FAILED');

    // Segment should now be available again
    const reclaimed = ledger.claimNextAvailable('w2');
    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.segmentId).toBe(1);
  });
});
