import { execFile } from 'child_process';
import { DownloadEngine } from '../engine/DownloadEngine';
import { AppDatabase } from '../db/Database';

export type PowerAction = 'none' | 'notify' | 'sleep' | 'shutdown' | 'hibernate';

export interface PowerGovernorStatus {
  enabled: boolean;
  action: PowerAction;
  graceSeconds: number;
  pendingActionAt?: number; // epoch ms when the action will fire
  lastActionTakenAt?: number;
  lastActionResult?: string;
}

/**
 * OS Power Governor — watches the download queue and, once every download
 * has finished (queue drained) and a grace period has elapsed with no new
 * activity, performs the configured power action (sleep / shutdown /
 * hibernate) or emits a notification event.
 *
 * The grace period is cancelled automatically if any download becomes
 * active again before it expires.
 */
export class PowerGovernor {
  private static engine: DownloadEngine | null = null;
  private static db: AppDatabase | null = null;
  private static checkInterval: NodeJS.Timeout | null = null;
  private static graceTimer: NodeJS.Timeout | null = null;
  private static pendingActionAt: number | undefined;
  private static lastActionTakenAt: number | undefined;
  private static lastActionResult: string | undefined;
  private static hadActiveWork = false;
  private static onNotify: ((message: string) => void) | null = null;

  public static start(engine: DownloadEngine, db: AppDatabase, onNotify?: (message: string) => void): void {
    this.engine = engine;
    this.db = db;
    this.onNotify = onNotify || null;

    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => this.tick(), 5000);
  }

  public static stop(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = null;
    this.cancelPending();
  }

  public static getStatus(): PowerGovernorStatus {
    const settings = this.db?.getSettings();
    return {
      enabled: settings?.power?.governorEnabled ?? false,
      action: (settings?.power?.actionOnQueueDrained as PowerAction) ?? 'none',
      graceSeconds: settings?.power?.graceSeconds ?? 60,
      pendingActionAt: this.pendingActionAt,
      lastActionTakenAt: this.lastActionTakenAt,
      lastActionResult: this.lastActionResult,
    };
  }

  public static cancelPending(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.pendingActionAt = undefined;
  }

  // ------------------------------------------------------------ internals

  private static tick(): void {
    if (!this.engine || !this.db) return;
    const settings = this.db.getSettings();
    if (!settings.power?.governorEnabled || settings.power.actionOnQueueDrained === 'none') {
      this.cancelPending();
      this.hadActiveWork = false;
      return;
    }

    const items = this.engine.getAllDownloads();
    const activeCount = items.filter((d) => d.status === 'downloading' || d.status === 'queued').length;

    if (activeCount > 0) {
      this.hadActiveWork = true;
      this.cancelPending(); // new work arrived — abort any countdown
      return;
    }

    // Queue is drained. Only arm the countdown if we actually saw work happen
    // this session (avoids shutting down a machine that was idle at launch).
    if (this.hadActiveWork && !this.graceTimer) {
      const grace = Math.max(5, settings.power.graceSeconds || 60);
      this.pendingActionAt = Date.now() + grace * 1000;
      this.notify(
        `All downloads finished. "${settings.power.actionOnQueueDrained}" will execute in ${grace}s unless new downloads start.`
      );

      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        this.pendingActionAt = undefined;
        this.hadActiveWork = false;
        void this.executeAction(settings.power.actionOnQueueDrained as PowerAction);
      }, grace * 1000);
    }
  }

  private static notify(message: string): void {
    if (this.onNotify) this.onNotify(message);
  }

  private static async executeAction(action: PowerAction): Promise<void> {
    // Re-check right before firing: a download may have been added in the last tick window.
    if (this.engine) {
      const stillActive = this.engine
        .getAllDownloads()
        .some((d) => d.status === 'downloading' || d.status === 'queued');
      if (stillActive) return;
    }

    this.lastActionTakenAt = Date.now();

    if (action === 'notify') {
      this.notify('✅ Download queue drained — all transfers complete.');
      this.lastActionResult = 'notified';
      return;
    }

    const cmd = this.resolveCommand(action);
    if (!cmd) {
      this.lastActionResult = `unsupported action "${action}" on platform ${process.platform}`;
      this.notify(this.lastActionResult);
      return;
    }

    this.notify(`⚡ Executing power action: ${action}`);
    execFile(cmd.bin, cmd.args, { timeout: 15000 }, (err) => {
      this.lastActionResult = err ? `failed: ${err.message}` : `executed ${action}`;
    });
  }

  private static resolveCommand(action: PowerAction): { bin: string; args: string[] } | null {
    const platform = process.platform;

    if (platform === 'linux') {
      if (action === 'sleep') return { bin: 'systemctl', args: ['suspend'] };
      if (action === 'hibernate') return { bin: 'systemctl', args: ['hibernate'] };
      if (action === 'shutdown') return { bin: 'shutdown', args: ['-h', 'now'] };
    }

    if (platform === 'darwin') {
      if (action === 'sleep') return { bin: 'pmset', args: ['sleepnow'] };
      if (action === 'shutdown') return { bin: 'shutdown', args: ['-h', 'now'] };
      if (action === 'hibernate') return { bin: 'pmset', args: ['sleepnow'] }; // macOS handles hibernation itself
    }

    if (platform === 'win32') {
      if (action === 'sleep')
        return { bin: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] };
      if (action === 'hibernate') return { bin: 'shutdown', args: ['/h'] };
      if (action === 'shutdown') return { bin: 'shutdown', args: ['/s', '/t', '5'] };
    }

    return null;
  }
}
