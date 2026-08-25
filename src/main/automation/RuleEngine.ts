import { EventEmitter } from 'events';
import { DownloadItem, Priority } from '../../shared/types';

export type AutomationEventTrigger =
  | 'PRE_DOWNLOAD'
  | 'DOWNLOAD_COMPLETED'
  | 'DOWNLOAD_FAILED'
  | 'STORAGE_LOW'
  | 'NETWORK_CHANGED'
  | 'MEDIA_DETECTED'
  | 'DEADLINE_RISK';

export interface PreDownloadRuleMatch {
  category?: string;
  priority?: Priority;
  destinationDir?: string;
  maxConnections?: number;
  matchedRules: string[];
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationEventTrigger;
  conditions: {
    field: string; // "category", "extension", "domain", "size", "retries", "resolution", "networkType", "storageFreeMb"
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'starts_with' | 'ends_with';
    value: any;
  }[];
  actions: {
    actionType:
      | 'SET_CATEGORY'
      | 'SET_PRIORITY'
      | 'SET_DESTINATION'
      | 'SET_CONNECTIONS'
      | 'MOVE_TO_DIR'
      | 'APPLY_PROFILE'
      | 'PAUSE_DOWNLOADS'
      | 'NOTIFY_USER'
      | 'ADD_TO_QUEUE'
      | 'TAG_ITEM';
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
        case 'starts_with':
          if (!String(val).toLowerCase().startsWith(String(cond.value).toLowerCase())) return false;
          break;
        case 'ends_with':
          if (!String(val).toLowerCase().endsWith(String(cond.value).toLowerCase())) return false;
          break;
      }
    }
    return true;
  }

  public evaluatePreDownloadRules(item: {
    url: string;
    filename?: string;
    extension?: string;
    domain?: string;
    size?: number;
  }): PreDownloadRuleMatch {
    const result: PreDownloadRuleMatch = {
      matchedRules: [],
    };

    let domain = item.domain;
    if (!domain && item.url) {
      try {
        domain = new URL(item.url).hostname;
      } catch {}
    }

    let extension = item.extension;
    if (!extension && item.filename) {
      const ext = item.filename.split('.').pop();
      if (ext && ext !== item.filename) {
        extension = `.${ext.toLowerCase()}`;
      }
    }

    const payload = {
      url: item.url,
      filename: item.filename || '',
      extension: extension || '',
      domain: domain || '',
      size: item.size || 0,
    };

    for (const rule of this.rules) {
      if (!rule.enabled || rule.trigger !== 'PRE_DOWNLOAD') continue;
      if (this.checkConditions(rule.conditions, payload)) {
        result.matchedRules.push(rule.id);
        for (const act of rule.actions) {
          if (act.actionType === 'SET_CATEGORY' && act.params.category) {
            result.category = act.params.category;
          } else if (act.actionType === 'SET_PRIORITY' && act.params.priority) {
            result.priority = act.params.priority;
          } else if (act.actionType === 'SET_DESTINATION' && act.params.destinationDir) {
            result.destinationDir = act.params.destinationDir;
          } else if (act.actionType === 'SET_CONNECTIONS' && act.params.maxConnections) {
            result.maxConnections = Number(act.params.maxConnections);
          }
        }
      }
    }

    return result;
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
