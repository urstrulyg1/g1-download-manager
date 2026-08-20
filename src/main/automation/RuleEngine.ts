import { EventEmitter } from 'events';
import { DownloadItem } from '../../shared/types';

export type AutomationEventTrigger =
  | 'DOWNLOAD_COMPLETED'
  | 'DOWNLOAD_FAILED'
  | 'STORAGE_LOW'
  | 'NETWORK_CHANGED'
  | 'MEDIA_DETECTED'
  | 'DEADLINE_RISK';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationEventTrigger;
  conditions: {
    field: string; // "category", "retries", "resolution", "networkType", "storageFreeMb"
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
  }[];
  actions: {
    actionType: 'MOVE_TO_DIR' | 'APPLY_PROFILE' | 'PAUSE_DOWNLOADS' | 'NOTIFY_USER' | 'ADD_TO_QUEUE' | 'TAG_ITEM';
    params: Record<string, any>;
  }[];
}

export interface RuleExecutionLog {
  ruleId: string;
  ruleName: string;
  trigger: AutomationEventTrigger;
  matched: boolean;
  executedActions: string[];
  timestamp: number;
}

export class RuleEngine extends EventEmitter {
  private rules: AutomationRule[] = [
    {
      id: 'rule_move_videos',
      name: 'Auto-Move Completed Videos',
      enabled: true,
      trigger: 'DOWNLOAD_COMPLETED',
      conditions: [{ field: 'category', operator: 'equals', value: 'video' }],
      actions: [{ actionType: 'MOVE_TO_DIR', params: { targetDir: 'Videos' } }],
    },
    {
      id: 'rule_metered_profile',
      name: 'Auto-Apply Metered Profile on Cellular/Hotspot',
      enabled: true,
      trigger: 'NETWORK_CHANGED',
      conditions: [{ field: 'networkType', operator: 'equals', value: 'metered' }],
      actions: [{ actionType: 'APPLY_PROFILE', params: { profile: 'METERED' } }],
    },
    {
      id: 'rule_storage_low',
      name: 'Auto-Pause on Low Disk Space (< 5 GB)',
      enabled: true,
      trigger: 'STORAGE_LOW',
      conditions: [{ field: 'storageFreeMb', operator: 'less_than', value: 5120 }],
      actions: [{ actionType: 'PAUSE_DOWNLOADS', params: { scope: 'large_files' } }],
    },
  ];

  private executionLogs: RuleExecutionLog[] = [];

  public evaluateEvent(trigger: AutomationEventTrigger, payload: any): RuleExecutionLog[] {
    const executed: RuleExecutionLog[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled || rule.trigger !== trigger) continue;

      const matches = this.checkConditions(rule.conditions, payload);
      if (matches) {
        const actionNames = rule.actions.map((a) => `${a.actionType}(${JSON.stringify(a.params)})`);
        const log: RuleExecutionLog = {
          ruleId: rule.id,
          ruleName: rule.name,
          trigger,
          matched: true,
          executedActions: actionNames,
          timestamp: Date.now(),
        };

        this.executionLogs.push(log);
        if (this.executionLogs.length > 100) this.executionLogs.shift();
        executed.push(log);

        this.emit('rule_executed', { rule, payload, log });
      }
    }

    return executed;
  }

  private checkConditions(conditions: AutomationRule['conditions'], payload: any): boolean {
    for (const cond of conditions) {
      const val = payload[cond.field];
      switch (cond.operator) {
        case 'equals':
          if (val !== cond.value) return false;
          break;
        case 'not_equals':
          if (val === cond.value) return false;
          break;
        case 'greater_than':
          if (Number(val) <= Number(cond.value)) return false;
          break;
        case 'less_than':
          if (Number(val) >= Number(cond.value)) return false;
          break;
        case 'contains':
          if (!String(val).toLowerCase().includes(String(cond.value).toLowerCase())) return false;
          break;
      }
    }
    return true;
  }

  public getRules(): AutomationRule[] {
    return [...this.rules];
  }

  public setRules(rules: AutomationRule[]): void {
    this.rules = rules;
  }

  public getExecutionLogs(): RuleExecutionLog[] {
    return [...this.executionLogs];
  }
}
