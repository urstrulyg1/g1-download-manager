import { FairnessScheduler } from '../src/main/queue/FairnessScheduler';
import { DeadlineManager } from '../src/main/engine/DeadlineManager';

describe('Fairness Scheduler & Deadline Mode Suite', () => {
  describe('FairnessScheduler', () => {
    it('should proportionally distribute socket allocations based on queue priority weights', () => {
      const queues: any[] = [
        { id: 'q_urgent', name: 'Urgent Queue' },
        { id: 'q_normal', name: 'Normal Queue' },
      ];

      const downloads: any[] = [
        { id: 'd1', queueId: 'q_urgent', priority: 'urgent', status: 'downloading' },
        { id: 'd2', queueId: 'q_normal', priority: 'normal', status: 'downloading' },
      ];

      const allocations = FairnessScheduler.calculateAllocations(queues, downloads, 10 * 1024 * 1024, 24);
      expect(allocations.size).toBe(2);

      const urgentAlloc = allocations.get('q_urgent');
      const normalAlloc = allocations.get('q_normal');

      expect(urgentAlloc?.allocatedConnections).toBeGreaterThan(normalAlloc?.allocatedConnections || 0);
      expect(urgentAlloc?.allocatedBandwidthBytesPerSec).toBeGreaterThan(normalAlloc?.allocatedBandwidthBytesPerSec || 0);
    });
  });

  describe('DeadlineManager', () => {
    it('should evaluate whether a download will complete on time and calculate margins', () => {
      const mockItem: any = {
        id: 'dl_deadline_1',
        totalBytes: 600 * 1024 * 1024, // 600 MB
        downloadedBytes: 0,
        speed: 10 * 1024 * 1024, // 10 MB/s -> 60 seconds to finish
        avgSpeed: 10 * 1024 * 1024,
        status: 'downloading',
      };

      const deadline = Date.now() + 300 * 1000; // 5 minutes in future (deadline = 300s)
      const evaluation = DeadlineManager.evaluateDeadline(mockItem, deadline);

      expect(evaluation.status).toBe('ON_TRACK');
      expect(evaluation.marginMinutes).toBeGreaterThanOrEqual(3);
      expect(evaluation.advice).toContain('On track');
    });

    it('should flag CRITICAL_MISSED when speed is insufficient for deadline', () => {
      const mockItem: any = {
        id: 'dl_deadline_2',
        totalBytes: 1000 * 1024 * 1024, // 1000 MB
        downloadedBytes: 0,
        speed: 100 * 1024, // 100 KB/s -> 10,000 seconds
        avgSpeed: 100 * 1024,
        status: 'downloading',
      };

      const deadline = Date.now() + 60 * 1000; // 1 minute in future
      const evaluation = DeadlineManager.evaluateDeadline(mockItem, deadline);

      expect(evaluation.status).toBe('CRITICAL_MISSED');
      expect(evaluation.advice).toContain('Deadline deficit');
    });
  });
});
