import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { DownloadQueue } from '../../shared/types';

export class SchedulerService {
  private db: AppDatabase;
  private engine: DownloadEngine;
  private interval: NodeJS.Timeout | null = null;

  constructor(db: AppDatabase, engine: DownloadEngine) {
    this.db = db;
    this.engine = engine;
  }

  public start(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.tick();
    }, 15000); // Check every 15s
    this.tick();
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    const settings = this.db.getSettings();
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sun
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // 1. Working Hours Bandwidth Limits
    if (settings.scheduler.workingHoursEnabled) {
      const isWorkingHour = this.isTimeInRange(
        currentTimeStr,
        settings.scheduler.workingHoursStart,
        settings.scheduler.workingHoursEnd
      );

      if (isWorkingHour) {
        if (this.engine.getGlobalRateLimit() !== settings.scheduler.workingHoursSpeedLimit) {
          this.engine.setGlobalSpeedLimit(settings.scheduler.workingHoursSpeedLimit);
        }
      } else if (settings.scheduler.offHoursUnlimited) {
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
