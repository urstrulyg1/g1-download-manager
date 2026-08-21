import { PowerGovernor } from '../src/main/platform/PowerGovernor';

function makeFixtures(action: string, items: any[], enabled = true) {
  const engine = {
    getAllDownloads: jest.fn(() => items),
  } as any;
  const db = {
    getSettings: jest.fn(() => ({
      power: { governorEnabled: enabled, actionOnQueueDrained: action, graceSeconds: 5 },
    })),
  } as any;
  return { engine, db };
}

describe('PowerGovernor — auto sleep/shutdown on queue drained', () => {
  afterEach(() => {
    PowerGovernor.stop();
    jest.useRealTimers();
  });

  it('reports disabled status when the governor is off', () => {
    const { engine, db } = makeFixtures('none', [], false);
    PowerGovernor.start(engine, db);
    const status = PowerGovernor.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.pendingActionAt).toBeUndefined();
  });

  it('does not arm a countdown when the machine was idle at launch (no prior work)', () => {
    jest.useFakeTimers();
    const { engine, db } = makeFixtures('shutdown', []); // queue empty from the start
    PowerGovernor.start(engine, db);
    jest.advanceTimersByTime(20000);
    expect(PowerGovernor.getStatus().pendingActionAt).toBeUndefined();
  });

  it('arms a countdown after work drains, and cancels it when new work arrives', () => {
    jest.useFakeTimers();
    const items: any[] = [{ id: '1', status: 'downloading' }];
    const notifications: string[] = [];
    const engine = { getAllDownloads: jest.fn(() => items) } as any;
    const db = {
      getSettings: jest.fn(() => ({
        power: { governorEnabled: true, actionOnQueueDrained: 'notify', graceSeconds: 30 },
      })),
    } as any;

    PowerGovernor.start(engine, db, (m) => notifications.push(m));

    // Active work observed
    jest.advanceTimersByTime(6000);
    expect(PowerGovernor.getStatus().pendingActionAt).toBeUndefined();

    // Queue drains → countdown armed
    items.length = 0;
    jest.advanceTimersByTime(6000);
    expect(PowerGovernor.getStatus().pendingActionAt).toBeDefined();
    expect(notifications.some((n) => n.includes('will execute'))).toBe(true);

    // New download arrives → countdown cancelled
    items.push({ id: '2', status: 'queued' });
    jest.advanceTimersByTime(6000);
    expect(PowerGovernor.getStatus().pendingActionAt).toBeUndefined();
  });

  it('fires the notify action after the grace period elapses', () => {
    jest.useFakeTimers();
    const items: any[] = [{ id: '1', status: 'downloading' }];
    const notifications: string[] = [];
    const engine = { getAllDownloads: jest.fn(() => items) } as any;
    const db = {
      getSettings: jest.fn(() => ({
        power: { governorEnabled: true, actionOnQueueDrained: 'notify', graceSeconds: 10 },
      })),
    } as any;

    PowerGovernor.start(engine, db, (m) => notifications.push(m));
    jest.advanceTimersByTime(6000); // sees active work
    items.length = 0; // drained
    jest.advanceTimersByTime(6000); // arms countdown (10s grace)
    jest.advanceTimersByTime(11000); // grace elapses

    expect(notifications.some((n) => n.includes('queue drained'))).toBe(true);
    expect(PowerGovernor.getStatus().lastActionResult).toBe('notified');
  });

  it('cancelPending clears an armed countdown', () => {
    jest.useFakeTimers();
    const items: any[] = [{ id: '1', status: 'downloading' }];
    const engine = { getAllDownloads: jest.fn(() => items) } as any;
    const db = {
      getSettings: jest.fn(() => ({
        power: { governorEnabled: true, actionOnQueueDrained: 'sleep', graceSeconds: 60 },
      })),
    } as any;

    PowerGovernor.start(engine, db);
    jest.advanceTimersByTime(6000);
    items.length = 0;
    jest.advanceTimersByTime(6000);
    expect(PowerGovernor.getStatus().pendingActionAt).toBeDefined();

    PowerGovernor.cancelPending();
    expect(PowerGovernor.getStatus().pendingActionAt).toBeUndefined();
  });
});
