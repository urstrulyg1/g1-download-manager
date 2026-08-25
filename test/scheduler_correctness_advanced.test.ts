import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { SchedulerService } from '../src/main/scheduler/SchedulerService';

describe('Scheduler Service Advanced Midnight Crossover & Correctness', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;
  let scheduler: SchedulerService;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
    scheduler = new SchedulerService(db, engine);
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
  });

  test('isTimeInRange accurately handles overnight windows spanning midnight', () => {
    // Window: 23:00 to 07:00
    expect(scheduler.isTimeInRange('23:00', '23:00', '07:00')).toBe(true);
    expect(scheduler.isTimeInRange('23:45', '23:00', '07:00')).toBe(true);
    expect(scheduler.isTimeInRange('00:00', '23:00', '07:00')).toBe(true);
    expect(scheduler.isTimeInRange('03:30', '23:00', '07:00')).toBe(true);
    expect(scheduler.isTimeInRange('07:00', '23:00', '07:00')).toBe(true);

    // Outside window
    expect(scheduler.isTimeInRange('07:01', '23:00', '07:00')).toBe(false);
    expect(scheduler.isTimeInRange('12:00', '23:00', '07:00')).toBe(false);
    expect(scheduler.isTimeInRange('22:59', '23:00', '07:00')).toBe(false);
  });

  test('isQueueInWindow correctly handles day rollover across midnight', () => {
    // Schedule on Monday (day 1), starting 23:00, stopping 06:00
    const mondayOnly = [1];

    // Monday night at 23:30 -> in window
    expect(scheduler.isQueueInWindow('23:30', 1, '23:00', '06:00', mondayOnly)).toBe(true);

    // Tuesday morning at 03:00 -> in window (started Monday night)
    expect(scheduler.isQueueInWindow('03:00', 2, '23:00', '06:00', mondayOnly)).toBe(true);

    // Tuesday night at 23:30 -> NOT in window (Tuesday not in daysOfWeek)
    expect(scheduler.isQueueInWindow('23:30', 2, '23:00', '06:00', mondayOnly)).toBe(false);

    // Tuesday morning at 07:00 -> NOT in window (window closed at 06:00)
    expect(scheduler.isQueueInWindow('07:00', 2, '23:00', '06:00', mondayOnly)).toBe(false);
  });

  test('Working hours bandwidth throttling activates during designated hours', () => {
    const settings = db.getSettings();
    settings.scheduler.workingHoursEnabled = true;
    settings.scheduler.workingHoursStart = '00:00';
    settings.scheduler.workingHoursEnd = '23:59';
    settings.scheduler.workingHoursSpeedLimit = 250000;
    settings.scheduler.offHoursUnlimited = true;
    db.saveSettings(settings);

    // Force tick
    scheduler.tick();

    const status = scheduler.getStatus();
    expect(status.isWorkingHours).toBe(true);
  });
});
