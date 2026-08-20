import { AutomationRule } from './RuleEngine';

export interface SimulationResult {
  ruleId: string;
  ruleName: string;
  testedHistoricalItemsCount: number;
  wouldHaveTriggeredCount: number;
  simulatedActions: string[];
  hasConflicts: boolean;
  conflictsDetails?: string;
  isCycleSafe: boolean;
}

export class RuleSimulator {
  public static simulate(
    rule: AutomationRule,
    historicalItems: any[],
    existingRules: AutomationRule[] = []
  ): SimulationResult {
    let triggeredCount = 0;
    const actions: string[] = [];

    for (const item of historicalItems) {
      let matches = true;
      for (const cond of rule.conditions) {
        if (item[cond.field] !== cond.value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        triggeredCount++;
        for (const act of rule.actions) {
          actions.push(`${act.actionType} on ${item.filename || item.url}`);
        }
      }
    }

    // Check conflicts with other active rules
    let hasConflicts = false;
    let conflictsDetails: string | undefined;

    for (const other of existingRules) {
      if (other.id === rule.id || !other.enabled) continue;
      if (other.trigger === rule.trigger) {
        // Check if actions conflict (e.g. two MOVE_TO_DIR actions to different folders)
        const ruleMove = rule.actions.find((a) => a.actionType === 'MOVE_TO_DIR');
        const otherMove = other.actions.find((a) => a.actionType === 'MOVE_TO_DIR');
        if (ruleMove && otherMove && ruleMove.params.targetDir !== otherMove.params.targetDir) {
          hasConflicts = true;
          conflictsDetails = `Potential destination conflict with "${other.name}" (${ruleMove.params.targetDir} vs ${otherMove.params.targetDir}).`;
        }
      }
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      testedHistoricalItemsCount: historicalItems.length,
      wouldHaveTriggeredCount: triggeredCount,
      simulatedActions: actions.slice(0, 10),
      hasConflicts,
      conflictsDetails,
      isCycleSafe: true,
    };
  }
}
