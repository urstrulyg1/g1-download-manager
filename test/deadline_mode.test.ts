import { DeadlineManager } from '../src/main/engine/DeadlineManager';

describe('Download Deadline Mode & Completion Estimates', () => {
  it('should accurately calculate on-track margins', () => {
    const mockItem: any = {
      id: 'dl_dl_1',
      totalBytes: 200 * 1024 * 1024,
      downloadedBytes: 0,
      speed: 10 * 1024 * 1024, // 20 seconds needed
      avgSpeed: 10 * 1024 * 1024,
      status: 'downloading',
    };

    const deadline = Date.now() + 120 * 1000; // 2 minutes in future
    const evalResult = DeadlineManager.evaluateDeadline(mockItem, deadline);
    expect(evalResult.status).toBe('ON_TRACK');
    expect(evalResult.marginMinutes).toBeGreaterThanOrEqual(1);
  });

  it('should handle already completed downloads in deadline mode gracefully', () => {
    const mockItem: any = {
      id: 'dl_dl_comp',
      totalBytes: 100 * 1024 * 1024,
      downloadedBytes: 100 * 1024 * 1024,
      speed: 0,
      avgSpeed: 5 * 1024 * 1024,
      status: 'completed',
      completedAt: Date.now() - 5000,
    };

    const evalResult = DeadlineManager.evaluateDeadline(mockItem, Date.now() + 60000);
    expect(evalResult.status).toBe('COMPLETED');
    expect(evalResult.advice).toContain('completed');
  });

  it('should detect deficit when download speed cannot meet target time', () => {
    const mockItem: any = {
      id: 'dl_dl_deficit',
      totalBytes: 5000 * 1024 * 1024, // 5 GB
      downloadedBytes: 0,
      speed: 100 * 1024, // 100 KB/s
      avgSpeed: 100 * 1024,
      status: 'downloading',
    };

    const deadline = Date.now() + 60 * 1000; // 1 minute in future
    const evalResult = DeadlineManager.evaluateDeadline(mockItem, deadline);
    expect(evalResult.status).toBe('CRITICAL_MISSED');
    expect(evalResult.requiredSpeedBytesPerSec).toBeGreaterThan(50 * 1024 * 1024);
  });
});
