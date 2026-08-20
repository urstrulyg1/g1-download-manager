import { AutonomousDownloadPlanner } from '../src/main/intelligence/AutonomousDownloadPlanner';
import { KnowledgeEngine } from '../src/main/intelligence/KnowledgeEngine';

describe('Autonomous Download Planner & Plan-vs-Actual Suite', () => {
  it('should generate execution plans with predicted speeds, worker counts, and storage checks', async () => {
    const knowledge = new KnowledgeEngine();
    const mockItem: any = {
      id: 'dl_plan_test',
      url: 'https://cdn.example.com/movie.mp4',
      totalBytes: 500 * 1024 * 1024,
      downloadedBytes: 0,
      maxConnections: 8,
      serverCapabilities: { supportsRange: true, protocol: 'https' },
    };

    const plan = await AutonomousDownloadPlanner.createExecutionPlan(
      mockItem,
      knowledge,
      100 * 1024 * 1024 * 1024 // 100GB
    );

    expect(plan.allocatedWorkers).toBeGreaterThanOrEqual(2);
    expect(plan.predictedDurationSeconds).toBeGreaterThan(0);
    expect(plan.storageCheck.fits).toBe(true);
    expect(plan.planSummary).toContain('Autonomous Plan');
  });

  it('should accurately compare plan vs actual performance and explain variances', () => {
    const plan: any = {
      downloadId: 'dl_plan_1',
      predictedThroughputBytesPerSec: 10 * 1024 * 1024,
      predictedDurationSeconds: 60,
      allocatedWorkers: 8,
    };

    const actualItem: any = {
      id: 'dl_plan_1',
      avgSpeed: 15 * 1024 * 1024, // 50% faster
      durationMs: 40000,
      activeConnections: 8,
    };

    const report = AutonomousDownloadPlanner.comparePlanVsActual(plan, actualItem);
    expect(report.throughputDeltaPct).toBe(50);
    expect(report.varianceExplanation).toContain('faster than predicted');
  });

  it('should report slower actual throughput variance when throttled', () => {
    const plan: any = {
      downloadId: 'dl_plan_2',
      predictedThroughputBytesPerSec: 20 * 1024 * 1024,
      predictedDurationSeconds: 30,
      allocatedWorkers: 8,
    };

    const actualItem: any = {
      id: 'dl_plan_2',
      avgSpeed: 5 * 1024 * 1024, // 75% slower
      durationMs: 120000,
      activeConnections: 4,
    };

    const report = AutonomousDownloadPlanner.comparePlanVsActual(plan, actualItem);
    expect(report.throughputDeltaPct).toBe(-75);
    expect(report.varianceExplanation).toContain('slower than predicted');
  });

  it('should handle single stream fallback in execution plan', async () => {
    const knowledge = new KnowledgeEngine();
    const mockItem: any = {
      id: 'dl_plan_single',
      url: 'http://cdn.example.com/stream.bin',
      totalBytes: 0,
      downloadedBytes: 0,
      serverCapabilities: { supportsRange: false, protocol: 'http' },
    };

    const plan = await AutonomousDownloadPlanner.createExecutionPlan(mockItem, knowledge, 1024 * 1024 * 1024);
    expect(plan.allocatedWorkers).toBe(1);
    expect(plan.selectedProtocol).toBe('HTTP/1.1');
  });
});
