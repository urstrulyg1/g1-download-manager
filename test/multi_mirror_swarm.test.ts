import { MultiMirrorSwarmEngine } from '../src/main/engine/MultiMirrorSwarmEngine';

describe('MultiMirrorSwarmEngine Suite', () => {
  it('should initialize with primary mirror and allow adding auxiliary mirrors', () => {
    const swarm = new MultiMirrorSwarmEngine('https://primary.example.com/file.iso', [
      'https://mirror1.example.org/file.iso',
      'https://mirror2.example.net/file.iso',
    ]);

    const mirrors = swarm.getMirrors();
    expect(mirrors.length).toBe(3);
    expect(mirrors.some((m) => m.url.includes('primary'))).toBe(true);
    expect(mirrors.some((m) => m.url.includes('mirror1'))).toBe(true);
    expect(mirrors.some((m) => m.url.includes('mirror2'))).toBe(true);
  });

  it('should balance worker distribution across available mirrors', () => {
    const swarm = new MultiMirrorSwarmEngine('https://primary.example.com/file.iso', [
      'https://mirror1.example.org/file.iso',
    ]);

    const m1 = swarm.selectBestMirror();
    const m2 = swarm.selectBestMirror();

    // After picking m1, m2 should pick the other mirror because activeWorkers increased
    expect(m1).not.toBe(m2);

    swarm.releaseWorker(m1, 1024, 500000);
    const m3 = swarm.selectBestMirror();
    expect(m3).toBe(m1); // m1 was released so its worker load dropped
  });

  it('should failover when a mirror records multiple failures', () => {
    const swarm = new MultiMirrorSwarmEngine('https://primary.example.com/file.iso', [
      'https://broken.example.org/file.iso',
    ]);

    swarm.recordFailure('https://broken.example.org/file.iso');
    swarm.recordFailure('https://broken.example.org/file.iso');
    swarm.recordFailure('https://broken.example.org/file.iso');

    const chosen = swarm.selectBestMirror();
    expect(chosen).toBe('https://primary.example.com/file.iso');
  });
});
