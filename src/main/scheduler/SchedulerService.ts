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
  timezoneOffsetMinutes: number;
}

export class SchedulerService {
  private db: AppDatabase;
  private engine: DownloadEngine;
  private interval: NodeJS.Timeout | null = null;
  private powerSource: 'AC' | 'Battery' = 'AC';
  private networkType: 'WiFi' | 'Ethernet' | 'Metered' = 'WiFi';
  private customTimezoneOffsetMinutes: number | null = null;

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

  public setCustomTimezoneOffset(offsetMinutes: number | null): void {
    this.customTimezoneOffsetMinutes = offsetMinutes;
    this.tick();
  }

  private getCurrentDate(): Date {
    const now = new Date();
    if (this.customTimezoneOffsetMinutes !== null) {
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      return new Date(utc + this.customTimezoneOffsetMinutes * 60000);
    }
    return now;
  }

  public getStatus(): SchedulerPolicyStatus {
    const settings = this.db.getSettings();
    const now = this.getCurrentDate();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    const isWorkingHour = settings.scheduler?.workingHoursEnabled
      ? this.isTimeInRange(
          currentTimeStr,
          settings.scheduler.workingHoursStart || '09:00',
          settings.scheduler.workingHoursEnd || '18:00'
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
      timezoneOffsetMinutes: this.customTimezoneOffsetMinutes ?? -now.getTimezoneOffset(),
    };
  }

  public tick(): void {
    const settings = this.db.getSettings();
    const now = this.getCurrentDate();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const isWeekend = currentDay === 0 || currentDay === 6;
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // 1. Working Hours & Weekend Bandwidth Limits
    if (settings.scheduler?.workingHoursEnabled) {
      const isWorkingHour = this.isTimeInRange(
        currentTimeStr,
        settings.scheduler.workingHoursStart || '09:00',
        settings.scheduler.workingHoursEnd || '18:00'
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

    // 2. Queue Specific Schedules with Midnight Crossover & Day Rollover
    const queues = this.db.getQueues();
    for (const queue of queues) {
      if (!queue.schedule || !queue.schedule.enabled) continue;

      const startTime = queue.schedule.startTime || '00:00';
      const stopTime = queue.schedule.stopTime || '23:59';
      const daysOfWeek = queue.schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];

      const inScheduleWindow = this.isQueueInWindow(currentTimeStr, currentDay, startTime, stopTime, daysOfWeek);

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

  /**
   * Determines whether the current time and day falls into the queue schedule window,
   * properly accounting for midnight crossover (e.g. Monday 23:00 to Tuesday 07:00).
   */
  public isQueueInWindow(
    current: string,
    currentDay: number,
    start: string,
    end: string,
    daysOfWeek: number[]
  ): boolean {
    if (daysOfWeek.length === 0) return false;

    if (start <= end) {
      // Same-day window (e.g. 09:00 to 17:00)
      const dayMatches = daysOfWeek.includes(currentDay);
      return dayMatches && current >= start && current <= end;
    }

    // Midnight crossover window (e.g. 23:00 to 07:00)
    // Part 1: Evening portion (from start up to 23:59) - belongs to current day
    if (current >= start) {
      return daysOfWeek.includes(currentDay);
    }

    // Part 2: Morning portion (from 00:00 up to end) - started on previous day
    if (current <= end) {
      const prevDay = (currentDay + 6) % 7;
      return daysOfWeek.includes(prevDay);
    }

    return false;
  }

  public isTimeInRange(current: string, start: string, end: string): boolean {
    if (!current || !start || !end) return false;
    if (start <= end) {
      return current >= start && current <= end;
    }
    // Overnight window (e.g. 22:00 to 06:00)
    return current >= start || current <= end;
  }
}
