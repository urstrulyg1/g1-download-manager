import { RuleEngine } from '../src/main/automation/RuleEngine';

describe('Automation Rule Engine Suite', () => {
  it('should evaluate trigger conditions and execute matching actions', () => {
    const engine = new RuleEngine();

    const logs = engine.evaluateEvent('DOWNLOAD_COMPLETED', {
      category: 'video',
      filename: 'sample_movie.mp4',
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].ruleId).toBe('rule_move_videos');
    expect(logs[0].matched).toBe(true);
    expect(logs[0].executedActions[0]).toContain('MOVE_TO_DIR');
  });

  it('should evaluate storage low triggers and apply pause policies', () => {
    const engine = new RuleEngine();

    const logs = engine.evaluateEvent('STORAGE_LOW', {
      storageFreeMb: 2048, // 2 GB < 5 GB threshold
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].ruleId).toBe('rule_storage_low');
    expect(logs[0].executedActions[0]).toContain('PAUSE_DOWNLOADS');
  });

  it('should evaluate network changed trigger and apply metered profile', () => {
    const engine = new RuleEngine();
    const logs = engine.evaluateEvent('NETWORK_CHANGED', { networkType: 'metered' });
    expect(logs.some((l) => l.ruleId === 'rule_metered_profile')).toBe(true);
  });

  it('should ignore events when conditions do not match', () => {
    const engine = new RuleEngine();
    const logs = engine.evaluateEvent('DOWNLOAD_COMPLETED', { category: 'document' });
    expect(logs.some((l) => l.ruleId === 'rule_move_videos')).toBe(false);
  });

  it('should support adding and enabling custom user automation rules', () => {
    const engine = new RuleEngine();
    const existing = engine.getRules();
    engine.setRules([
      ...existing,
      {
        id: 'rule_custom_archive',
        name: 'Auto-Move Archives',
        enabled: true,
        trigger: 'DOWNLOAD_COMPLETED',
        conditions: [{ field: 'category', operator: 'equals', value: 'archive' }],
        actions: [{ actionType: 'MOVE_TO_DIR', params: { targetDir: 'Archives' } }],
      },
    ]);

    const logs = engine.evaluateEvent('DOWNLOAD_COMPLETED', { category: 'archive' });
    expect(logs.some((l) => l.ruleId === 'rule_custom_archive')).toBe(true);
  });
});
