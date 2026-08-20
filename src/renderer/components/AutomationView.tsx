import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { AutomationRule, RuleExecutionLog } from '../../main/automation/RuleEngine';
import { RuleSimulator, SimulationResult } from '../../main/automation/RuleSimulator';
import { DownloadItem } from '../../shared/types';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Language, translations } from '../lib/i18n';

interface AutomationViewProps {
  downloads: DownloadItem[];
  lang: Language;
}

export const AutomationView: React.FC<AutomationViewProps> = ({ downloads, lang }) => {
  const t = translations[lang] || translations.en;
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executionLogs, setExecutionLogs] = useState<RuleExecutionLog[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  // New Rule Form State
  const [ruleName, setRuleName] = useState('Auto Move Movies');
  const [trigger, setTrigger] = useState<AutomationRule['trigger']>('DOWNLOAD_COMPLETED');
  const [conditionField, setConditionField] = useState('category');
  const [conditionOperator, setConditionOperator] = useState<'equals' | 'greater_than' | 'less_than'>('equals');
  const [conditionValue, setConditionValue] = useState('video');
  const [actionType, setActionType] = useState<AutomationRule['actions'][0]['actionType']>('MOVE_TO_DIR');
  const [actionParam, setActionParam] = useState('Videos');

  const fetchRules = async () => {
    try {
      const [rRes, lRes] = await Promise.all([
        fetch('/api/rules').then((r) => r.json()),
        fetch('/api/rules/logs').then((r) => r.json()).catch(() => []),
      ]);
      setRules(rRes);
      setExecutionLogs(lRes);
    } catch {}
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSimulate = () => {
    const candidateRule: AutomationRule = {
      id: 'rule_sim',
      name: ruleName,
      enabled: true,
      trigger,
      conditions: [{ field: conditionField, operator: conditionOperator as any, value: conditionValue }],
      actions: [{ actionType, params: { targetDir: actionParam } }],
    };

    const res = RuleSimulator.simulate(candidateRule, downloads, rules);
    setSimResult(res);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRule: AutomationRule = {
      id: `rule_${Date.now()}`,
      name: ruleName,
      enabled: true,
      trigger,
      conditions: [{ field: conditionField, operator: conditionOperator as any, value: conditionValue }],
      actions: [{ actionType, params: { targetDir: actionParam } }],
    };

    const updated = [...rules, newRule];
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    setIsModalOpen(false);
    setSimResult(null);
    fetchRules();
  };

  const handleDeleteRule = async (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    fetchRules();
  };

  const toggleRuleEnabled = async (rule: AutomationRule) => {
    const updated = rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    fetchRules();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Rule Automation Studio</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure event-driven WHEN ➔ IF ➔ THEN rules with conflict auditing and simulation
          </p>
        </div>

        <Button size="sm" variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>
          Create Automation Rule
        </Button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{rule.name}</h3>
                  <Badge variant={rule.enabled ? 'success' : 'neutral'} size="sm" className="mt-1">
                    {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* WHEN / IF / THEN Badges */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1.5 font-mono">
                <div className="text-slate-400 flex items-center gap-2">
                  <span className="font-bold text-indigo-400 uppercase">WHEN</span>
                  <span className="text-slate-200">{rule.trigger}</span>
                </div>
                <div className="text-slate-400 flex items-center gap-2">
                  <span className="font-bold text-cyan-400 uppercase">IF</span>
                  <span className="text-slate-200">
                    {rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')}
                  </span>
                </div>
                <div className="text-slate-400 flex items-center gap-2">
                  <span className="font-bold text-emerald-400 uppercase">THEN</span>
                  <span className="text-slate-200">
                    {rule.actions.map((a) => `${a.actionType}(${JSON.stringify(a.params)})`).join(', ')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => toggleRuleEnabled(rule)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  rule.enabled ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {rule.enabled ? 'Disable Rule' : 'Enable Rule'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Execution Audit Log */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>Rule Execution Audit Log</span>
        </h3>

        <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 font-mono text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-sans">
                <th className="p-2.5">Time</th>
                <th className="p-2.5">Rule</th>
                <th className="p-2.5">Trigger</th>
                <th className="p-2.5">Executed Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-[11px]">
              {executionLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500 font-sans">
                    No automation rules have executed yet.
                  </td>
                </tr>
              ) : (
                executionLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="p-2.5 text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="p-2.5 text-slate-200 font-bold">{log.ruleName}</td>
                    <td className="p-2.5 text-indigo-400">{log.trigger}</td>
                    <td className="p-2.5 text-emerald-400 truncate max-w-xs">{log.executedActions.join(', ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Rule Modal with Simulator */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRule}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">Create Automation Rule</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Rule Name</label>
              <input
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                required
              />
            </div>

            {/* WHEN */}
            <div className="space-y-1">
              <label className="text-indigo-400 font-bold uppercase text-[11px]">WHEN (Event Trigger)</label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200"
              >
                <option value="DOWNLOAD_COMPLETED">Download Completed</option>
                <option value="DOWNLOAD_FAILED">Download Failed</option>
                <option value="STORAGE_LOW">Storage Low</option>
                <option value="NETWORK_CHANGED">Network Interface Changed</option>
              </select>
            </div>

            {/* IF */}
            <div className="space-y-1">
              <label className="text-cyan-400 font-bold uppercase text-[11px]">IF (Condition)</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Field (e.g. category)"
                  value={conditionField}
                  onChange={(e) => setConditionField(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                />
                <select
                  value={conditionOperator}
                  onChange={(e) => setConditionOperator(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  <option value="equals">equals</option>
                  <option value="less_than">less than</option>
                  <option value="greater_than">greater than</option>
                </select>
                <input
                  type="text"
                  placeholder="Value (e.g. video)"
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* THEN */}
            <div className="space-y-1">
              <label className="text-emerald-400 font-bold uppercase text-[11px]">THEN (Action)</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  <option value="MOVE_TO_DIR">Move File to Folder</option>
                  <option value="APPLY_PROFILE">Apply Download Profile</option>
                  <option value="PAUSE_DOWNLOADS">Pause Downloads</option>
                  <option value="NOTIFY_USER">Notify Desktop</option>
                </select>
                <input
                  type="text"
                  placeholder="Target (e.g. Videos or TURBO)"
                  value={actionParam}
                  onChange={(e) => setActionParam(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* Pre-Activation Simulator */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-300">Pre-Activation Rule Simulator</span>
                <button
                  type="button"
                  onClick={handleSimulate}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Simulate Rule
                </button>
              </div>

              {simResult && (
                <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                  <div>Tested against: <strong className="text-white">{simResult.testedHistoricalItemsCount} downloads</strong></div>
                  <div>Would trigger: <strong className="text-emerald-400">{simResult.wouldHaveTriggeredCount} times</strong></div>
                  {simResult.hasConflicts && (
                    <div className="text-rose-400 font-bold">⚠ {simResult.conflictsDetails}</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold">
                Save & Activate Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
