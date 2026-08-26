import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Clock,
  Loader2,
  Pencil,
} from 'lucide-react';
import { AutomationRule, RuleExecutionLog } from '../../main/automation/RuleEngine';
import { RuleSimulator, SimulationResult } from '../../main/automation/RuleSimulator';
import { DownloadItem } from '../../shared/types';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

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
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New Rule Form State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const [ruleName, setRuleName] = useState('Auto Move Movies');
  const [trigger, setTrigger] = useState<AutomationRule['trigger']>('DOWNLOAD_COMPLETED');
  // Support multiple conditions/actions
  const [conditions, setConditions] = useState<AutomationRule['conditions']>([
    { field: 'category', operator: 'equals', value: 'video' },
  ]);
  const [actions, setActions] = useState<AutomationRule['actions']>([
    { actionType: 'MOVE_TO_DIR', params: { targetDir: 'Videos' } },
  ]);
  // Keep single-row shortcuts in sync for simple display
  const conditionField = conditions[0]?.field ?? 'category';
  const conditionOperator = conditions[0]?.operator ?? 'equals';
  const conditionValue = conditions[0]?.value ?? '';
  const actionType = actions[0]?.actionType ?? 'MOVE_TO_DIR';
  const actionParam = actions[0]?.params?.targetDir ?? '';

  const fetchRules = async () => {
    setRulesError(null);
    try {
      const [rRes, lRes] = await Promise.all([
        api.getRules(),
        fetch('/api/rules/logs').then((r) => r.json()).catch(() => []),
      ]);
      setRules(rRes);
      setExecutionLogs(lRes);
    } catch (err: any) {
      setRulesError(err.message || 'Failed to load automation rules.');
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const resetForm = () => {
    setEditingRuleId(null);
    setRuleName('Auto Move Movies');
    setTrigger('DOWNLOAD_COMPLETED');
    setConditions([{ field: 'category', operator: 'equals', value: 'video' }]);
    setActions([{ actionType: 'MOVE_TO_DIR', params: { targetDir: 'Videos' } }]);
    setSimResult(null);
    setSaveError(null);
  };

  const openEditRule = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setTrigger(rule.trigger);
    setConditions(rule.conditions.length > 0 ? [...rule.conditions] : [{ field: 'category', operator: 'equals', value: '' }]);
    setActions(rule.actions.length > 0 ? [...rule.actions] : [{ actionType: 'MOVE_TO_DIR', params: { targetDir: '' } }]);
    setSimResult(null);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleSimulate = () => {
    const candidateRule: AutomationRule = {
      id: 'rule_sim',
      name: ruleName,
      enabled: true,
      trigger,
      conditions,
      actions,
    };

    const res = RuleSimulator.simulate(candidateRule, downloads, rules);
    setSimResult(res);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const updatedRule: AutomationRule = {
      id: editingRuleId ?? `rule_${Date.now()}`,
      name: ruleName,
      enabled: true,
      trigger,
      conditions,
      actions,
    };

    try {
      let updatedRules: AutomationRule[];
      if (editingRuleId) {
        updatedRules = rules.map((r) => (r.id === editingRuleId ? updatedRule : r));
      } else {
        updatedRules = [...rules, updatedRule];
      }
      await api.saveRules(updatedRules);
      setIsModalOpen(false);
      resetForm();
      fetchRules();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save rule.');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.saveRules(rules.filter((r) => r.id !== id));
      fetchRules();
    } catch (err: any) {
      setRulesError(err.message || 'Failed to delete rule.');
    }
  };

  const toggleRuleEnabled = async (rule: AutomationRule) => {
    try {
      await api.saveRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
      fetchRules();
    } catch (err: any) {
      setRulesError(err.message || 'Failed to update rule.');
    }
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

      {/* Global rules error */}
      {rulesError && (
        <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
          <span>{rulesError}</span>
          <button onClick={() => setRulesError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
        </div>
      )}

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
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditRule(rule)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-950 text-slate-400 hover:text-blue-400"
                    title="Edit rule"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
                    <td className="p-2.5 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
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

      {/* Create / Edit Rule Modal with Simulator */}
      {isModalOpen && (
        <div
          className="theme-overlay fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingRuleId ? 'Edit automation rule' : 'Create automation rule'}
          onKeyDown={(e) => { if (e.key === 'Escape') { setIsModalOpen(false); resetForm(); } }}
        >
          <form
            onSubmit={handleCreateRule}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">{editingRuleId ? 'Edit Automation Rule' : 'Create Automation Rule'}</h2>
              <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-1 text-slate-400 hover:text-white">
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

            {/* IF — Multiple Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-cyan-400 font-bold uppercase text-[11px]">IF (Conditions)</label>
                <button
                  type="button"
                  onClick={() => setConditions((prev) => [...prev, { field: 'category', operator: 'equals', value: '' }])}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  + Add Condition
                </button>
              </div>
              {conditions.map((cond, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Field"
                    value={cond.field}
                    onChange={(e) => setConditions((prev) => prev.map((c, j) => j === i ? { ...c, field: e.target.value } : c))}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => setConditions((prev) => prev.map((c, j) => j === i ? { ...c, operator: e.target.value as any } : c))}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="equals">equals</option>
                    <option value="less_than">less than</option>
                    <option value="greater_than">greater than</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => setConditions((prev) => prev.map((c, j) => j === i ? { ...c, value: e.target.value } : c))}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                  {conditions.length > 1 && (
                    <button type="button" onClick={() => setConditions((prev) => prev.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-300 font-bold text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* THEN — Multiple Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-emerald-400 font-bold uppercase text-[11px]">THEN (Actions)</label>
                <button
                  type="button"
                  onClick={() => setActions((prev) => [...prev, { actionType: 'NOTIFY_USER', params: {} }])}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                >
                  + Add Action
                </button>
              </div>
              {actions.map((act, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <select
                    value={act.actionType}
                    onChange={(e) => setActions((prev) => prev.map((a, j) => j === i ? { ...a, actionType: e.target.value as any } : a))}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="MOVE_TO_DIR">Move File to Folder</option>
                    <option value="APPLY_PROFILE">Apply Download Profile</option>
                    <option value="PAUSE_DOWNLOADS">Pause Downloads</option>
                    <option value="NOTIFY_USER">Notify Desktop</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Target (e.g. Videos)"
                    value={act.params?.targetDir ?? ''}
                    onChange={(e) => setActions((prev) => prev.map((a, j) => j === i ? { ...a, params: { ...a.params, targetDir: e.target.value } } : a))}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                  {actions.length > 1 && (
                    <button type="button" onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-300 font-bold text-xs">✕</button>
                  )}
                </div>
              ))}
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
                    <div className="text-rose-400 font-bold space-y-1">
                      <div>⚠ Rule Conflicts Detected:</div>
                      {simResult.conflictsDetails?.split(';').filter(Boolean).map((detail: string, i: number) => (
                        <div key={i} className="pl-3 text-rose-300">• {detail.trim()}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold">
                {editingRuleId ? 'Update Rule' : 'Save & Activate Rule'}
              </button>
            </div>

            {saveError && (
              <div role="alert" className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {saveError}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
