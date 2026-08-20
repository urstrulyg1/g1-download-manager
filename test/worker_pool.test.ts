import { TransferWorkerPool } from '../src/main/engine/TransferWorkerPool';
import { WorkScheduler } from '../src/main/engine/WorkScheduler';

describe('Worker Pool & Adaptive Concurrency Scheduler Suite', () => {
  describe('TransferWorkerPool', () => {
    it('should manage worker lifecycles, states, and productivity metrics', () => {
      const pool = new TransferWorkerPool(16);
      const worker = pool.registerWorker('worker_1', 1, 'dl_test_101', 'HTTP/2');

      expect(worker.status).toBe('IDLE');
      expect(worker.workerId).toBe('worker_1');

      pool.updateWorkerState('worker_1', 'ACTIVE');
      expect(pool.getWorker('worker_1')?.status).toBe('ACTIVE');

      pool.recordWorkerBytes('worker_1', 1024 * 1024, 2 * 1024 * 1024); // 2 MB/s
      expect(pool.getWorker('worker_1')?.bytesDownloaded).toBe(1024 * 1024);
      expect(pool.getWorker('worker_1')?.productivityScore).toBe(100);

      pool.removeWorker('worker_1');
      expect(pool.getWorker('worker_1')).toBeUndefined();
    });
  });

  describe('WorkScheduler', () => {
    it('should calculate benchmark-driven optimal concurrency for payload sizes', () => {
      const small = WorkScheduler.calculateOptimalWorkers({
        totalBytes: 500 * 1024, // 500 KB
        rangeSupport: true,
        protocol: 'HTTP/2',
      });
      expect(small.optimalWorkers).toBe(1);

      const large = WorkScheduler.calculateOptimalWorkers({
        totalBytes: 50 * 1024 * 1024, // 50 MB
        rangeSupport: true,
        protocol: 'HTTP/2',
        userMaxConnections: 8,
      });
      expect(large.optimalWorkers).toBe(8);

      const throttled = WorkScheduler.calculateOptimalWorkers({
        totalBytes: 50 * 1024 * 1024,
        rangeSupport: true,
        protocol: 'HTTP/2',
        serverThrottled: true,
      });
      expect(throttled.optimalWorkers).toBe(2);
    });
  });
});
