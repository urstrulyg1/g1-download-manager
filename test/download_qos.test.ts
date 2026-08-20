import { DownloadQoSEngine } from '../src/main/qos/DownloadQoSEngine';
import { ConnectionWarmup } from '../src/main/engine/ConnectionWarmup';

describe('Quality of Service (QoS) & Connection Warm-Up Suite', () => {
  describe('DownloadQoSEngine', () => {
    it('should assign appropriate QoS tiers and weights', () => {
      const qos = new DownloadQoSEngine();

      const urgentItem: any = { priority: 'urgent', category: 'document', totalBytes: 1000 };
      const normalItem: any = { priority: 'normal', category: 'other', totalBytes: 1000 };
      const lowItem: any = { priority: 'low', category: 'other', totalBytes: 1000 };

      expect(qos.evaluateQoSTier(urgentItem)).toBe('URGENT');
      expect(qos.evaluateQoSTier(normalItem)).toBe('NORMAL');
      expect(qos.evaluateQoSTier(lowItem)).toBe('LOW');

      expect(qos.getTierWeight('CRITICAL')).toBe(10);
      expect(qos.getTierWeight('URGENT')).toBe(8);
      expect(qos.getTierWeight('HIGH')).toBe(4);
      expect(qos.getTierWeight('NORMAL')).toBe(2);
      expect(qos.getTierWeight('LOW')).toBe(1);
      expect(qos.getTierWeight('BACKGROUND')).toBe(0.5);
    });

    it('should assign Background tier to multi-gigabyte low priority files', () => {
      const qos = new DownloadQoSEngine();
      const hugeLow: any = { priority: 'low', category: 'other', totalBytes: 20 * 1024 * 1024 * 1024 };
      expect(qos.evaluateQoSTier(hugeLow)).toBe('BACKGROUND');
    });
  });

  describe('ConnectionWarmup', () => {
    it('should progressively scale connections and detect diminishing returns', () => {
      const warmup = new ConnectionWarmup(5.0); // 5% minimum gain threshold

      // Step 1: 1 worker @ 10 MB/s
      const step1 = warmup.recordStep(1, 10 * 1024 * 1024);
      expect(step1.shouldContinueExpansion).toBe(true);

      // Step 2: 2 workers @ 18 MB/s (80% gain)
      const step2 = warmup.recordStep(2, 18 * 1024 * 1024);
      expect(step2.shouldContinueExpansion).toBe(true);

      // Step 3: 4 workers @ 24 MB/s (33% gain)
      const step3 = warmup.recordStep(4, 24 * 1024 * 1024);
      expect(step3.shouldContinueExpansion).toBe(true);

      // Step 4: 8 workers @ 24.2 MB/s (< 1% gain -> Diminishing returns!)
      const step4 = warmup.recordStep(8, 24.2 * 1024 * 1024);
      expect(step4.shouldContinueExpansion).toBe(false);

      expect(warmup.getOptimalWorkers()).toBe(8);
    });
  });
});
