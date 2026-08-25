import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { DownloadQueue } from '../../shared/types';

export interface SchedulerPolicyStatus {
  isWorkingHours: boolean;
  activeRateLimit: number;
  currentDay: number;
  timeString: string;
  activeQueues: string[];
  powerSource: 'AC' | 'Battery';
  networkType: 'WiFi' | 'Ethernet' | 'Metered';
}

export class SchedulerService {
  private db: AppDatabase;
  private engine: DownloadEngine;
  private interval: NodeJS.Timeout | null = null;
  private powerSource: 'AC' | 'Battery' = 'AC';
  private networkType: 'WiFi' | 'Ethernet' | 'Metered' = 'WiFi';

  constructor(db: AppDatabase, engine: DownloadEngine) {
    this.db = db;
    this.engine = engine;
  }

  public start(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.tick();
    }, 15000); // Check every 15s
    if (this.interval && typeof this.interval.unref === 'function') {
      this.interval.unref();
    }
    this.tick();
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  public setPowerSource(source: 'AC' | 'Battery'): void {
    this.powerSource = source;
    this.tick();
  }

  public setNetworkType(type: 'WiFi' | 'Ethernet' | 'Metered'): void {
    this.networkType = type;
    this.tick();
  }

  public getStatus(): SchedulerPolicyStatus {
    const settings = this.db.getSettings();
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    const isWorkingHour = settings.scheduler.workingHoursEnabled
      ? this.isTimeInRange(
          currentTimeStr,
          settings.scheduler.workingHoursStart,
          settings.scheduler.workingHoursEnd
        )
      : false;

    const activeQueues = this.db
      .getQueues()
      .filter((q) => q.status === 'active')
      .map((q) => q.id);

    return {
      isWorkingHours: isWorkingHour,
      activeRateLimit: this.engine.getGlobalRateLimit(),
      currentDay,
      timeString: currentTimeStr,
      activeQueues,
      powerSource: this.powerSource,
      networkType: this.networkType,
    };
  }

  private tick(): void {
    const settings = this.db.getSettings();
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const isWeekend = currentDay === 0 || currentDay === 6;
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // 1. Working Hours & Weekend Bandwidth Limits
    if (settings.scheduler.workingHoursEnabled) {
      const isWorkingHour = this.isTimeInRange(
        currentTimeStr,
        settings.scheduler.workingHoursStart,
        settings.scheduler.workingHoursEnd
      );

      if (isWorkingHour && !isWeekend) {
        if (this.engine.getGlobalRateLimit() !== settings.scheduler.workingHoursSpeedLimit) {
          this.engine.setGlobalSpeedLimit(settings.scheduler.workingHoursSpeedLimit);
        }
      } else if (settings.scheduler.offHoursUnlimited || isWeekend) {
        if (this.engine.getGlobalRateLimit() !== 0) {
          this.engine.setGlobalSpeedLimit(0);
        }
      }
    }

    // 2. Queue Specific Schedules
    const queues = this.db.getQueues();
    for (const queue of queues) {
      if (!queue.schedule || !queue.schedule.enabled) continue;

      const matchesDay = !queue.schedule.daysOfWeek || queue.schedule.daysOfWeek.includes(currentDay);
      if (!matchesDay) continue;

      const inScheduleWindow = this.isTimeInRange(
        currentTimeStr,
        queue.schedule.startTime,
        queue.schedule.stopTime
      );

      if (inScheduleWindow && queue.status === 'stopped') {
        queue.status = 'active';
        this.db.saveQueue(queue);
        this.engine.emit('queue_updated', queue);
      } else if (!inScheduleWindow && queue.status === 'active') {
        queue.status = 'stopped';
        this.db.saveQueue(queue);
        this.engine.emit('queue_updated', queue);
      }
    }
  }

  private isTimeInRange(current: string, start: string, end: string): boolean {
    if (start <= end) {
      return current >= start && current <= end;
    }
    // Overnight window (e.g. 22:00 to 06:00)
    return current >= start || current <= end;
  }
}
