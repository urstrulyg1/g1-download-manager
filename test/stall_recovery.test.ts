import { StallDetector, StallEvent } from '../src/main/engine/StallDetector';

describe('Stall Detector & Auto-Recovery', () => {
  it('should detect when connection throughput drops to 0 KB/s past threshold', async () => {
    const detector = new StallDetector(30, 20); // 30ms threshold, 20ms check interval
    detector.start();

    let capturedStall: any = null;
    detector.on('stall', (event: StallEvent) => {
      capturedStall = event;
    });

    detector.recordActivity('dl_stall_1:1', 1024);

    // Wait 100ms without recording activity
    await new Promise((r) => setTimeout(r, 120));

    expect(capturedStall).not.toBeNull();
    expect(capturedStall?.downloadId).toBe('dl_stall_1');
    expect(capturedStall?.segmentId).toBe(1);
    expect(capturedStall?.stallType).toBe('CONNECTION_STALL');

    detector.stop();
  });
});
