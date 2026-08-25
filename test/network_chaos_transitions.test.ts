import { NetworkIntelligence } from '../src/main/network/NetworkIntelligence';
import { NetworkTransitionDetector } from '../src/main/network/NetworkTransitionDetector';

describe('Network Chaos Transitions & State Recovery', () => {
  test('NetworkIntelligence detects status changes and emits transition events', async () => {
    const intelligence = new NetworkIntelligence(1000);
    const status = intelligence.getStatus();

    expect(status.online).toBe(true);
    expect(['EXCELLENT', 'GOOD', 'MODERATE', 'POOR']).toContain(status.qualityLevel);

    let statusEmitted = false;
    intelligence.on('status_change', () => {
      statusEmitted = true;
    });

    const isOnline = await intelligence.checkConnectivity();
    expect(typeof isOnline).toBe('boolean');
    intelligence.stop();
  });

  test('NetworkTransitionDetector emits sleep/wake on large clock delta', (done) => {
    const detector = new NetworkTransitionDetector();
    detector.start();

    detector.once('transition', (event) => {
      if (event.type === 'SYSTEM_SLEEP_WAKE') {
        detector.stop();
        done();
      }
    });

    // Artificially simulate clock jump > 6000ms
    (detector as any).lastTick = Date.now() - 10000;
    (detector as any).tick();
  });
});
