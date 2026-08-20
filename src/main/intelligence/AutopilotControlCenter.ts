import { EventEmitter } from 'events';
import { AutopilotDecision } from './DownloadAutopilot';

export type AutopilotMode = 'OFF' | 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

export interface UserOverrideRecord {
  downloadId: string;
  field: 'WORKERS' | 'SPEED_LIMIT' | 'PROFILE' | 'DESTINATION' | 'PRIORITY';
  manualValue: any;
  setAt: number;
}

export class AutopilotControlCenter extends EventEmitter {
  private mode: AutopilotMode = 'BALANCED';
  private decisionsHistory: AutopilotDecision[] = [];
  private userOverrides: Map<string, UserOverrideRecord[]> = new Map();

  public setMode(mode: AutopilotMode): void {
    this.mode = mode;
    this.emit('mode_changed', mode);
  }

  public getMode(): AutopilotMode {
    return this.mode;
  }

  public recordDecision(decision: AutopilotDecision): void {
    this.decisionsHistory.push(decision);
    if (this.decisionsHistory.length > 50) this.decisionsHistory.shift();
    this.emit('decision_recorded', decision);
  }

  public recordUserOverride(downloadId: string, field: UserOverrideRecord['field'], manualValue: any): void {
    const list = this.userOverrides.get(downloadId) || [];
    list.push({ downloadId, field, manualValue, setAt: Date.now() });
    this.userOverrides.set(downloadId, list);
    this.emit('override_recorded', { downloadId, field, manualValue });
  }

  public hasUserOverride(downloadId: string, field: UserOverrideRecord['field']): boolean {
    const list = this.userOverrides.get(downloadId);
    return Boolean(list && list.some((o) => o.field === field));
  }

  public getDecisionsHistory(): AutopilotDecision[] {
    return [...this.decisionsHistory];
  }
}
