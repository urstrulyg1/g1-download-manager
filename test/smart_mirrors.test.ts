import { MirrorManager } from '../src/main/engine/MirrorManager';
import { PredictiveRiskEngine } from '../src/main/intelligence/PredictiveRiskEngine';

describe('Smart Mirror Manager & Predictive Risk Engine 3.0 Suite', () => {
  describe('MirrorManager', () => {
    it('should register multiple mirrors and choose the highest reliability candidate', () => {
      const manager = new MirrorManager();
      manager.registerMirrors('linux_iso', [
        'https://mirror1.example.org/ubuntu.iso',
        'https://mirror2.example.org/ubuntu.iso',
      ]);

      const best = manager.selectBestMirror('linux_iso');
      expect(best).toBeDefined();
      expect(best?.reliabilityScore).toBeGreaterThanOrEqual(80);

      // Record failure on mirror1 -> drops score
      manager.recordMirrorFailure('linux_iso', 'https://mirror1.example.org/ubuntu.iso');
      const failover = manager.selectBestMirror('linux_iso');
      expect(failover?.url).toBe('https://mirror2.example.org/ubuntu.iso');
    });

    it('should return undefined when resource key has no registered mirrors', () => {
      const manager = new MirrorManager();
      expect(manager.selectBestMirror('non_existent')).toBeUndefined();
    });

    it('should maintain reliability scores across multiple failure reports', () => {
      const manager = new MirrorManager();
      manager.registerMirrors('data', ['https://m1.com/d', 'https://m2.com/d']);

      manager.recordMirrorFailure('data', 'https://m1.com/d');
      manager.recordMirrorFailure('data', 'https://m1.com/d');
      manager.recordMirrorFailure('data', 'https://m1.com/d');

      const best = manager.selectBestMirror('data');
      expect(best?.url).toBe('https://m2.com/d');
    });
  });

  describe('PredictiveRiskEngine', () => {
    it('should compute risk trends and trigger pre-emptive mitigation', () => {
      const riskEngine = new PredictiveRiskEngine();

      const sample1 = riskEngine.evaluateRisk('dl_risk_1', 0, false, false, 50000);
      expect(sample1.riskScorePct).toBeLessThan(20);
      expect(sample1.preventionTriggered).toBe(false);

      const sample2 = riskEngine.evaluateRisk('dl_risk_1', 3, true, true, 500);
      expect(sample2.riskScorePct).toBeGreaterThan(50);
      expect(sample2.preventionTriggered).toBe(true);

      const trend = riskEngine.getRiskTrend('dl_risk_1');
      expect(trend.length).toBe(2);
    });

    it('should return empty trend array for unseen downloads', () => {
      const riskEngine = new PredictiveRiskEngine();
      expect(riskEngine.getRiskTrend('unseen_dl').length).toBe(0);
    });
  });
});
