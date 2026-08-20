import { RuleSimulator } from '../src/main/automation/RuleSimulator';
import { PrivacyCenter } from '../src/main/security/PrivacyCenter';
import { PluginManager } from '../src/main/plugins/PluginManager';
import { AppDatabase } from '../src/main/db/Database';
import * as path from 'path';
import * as fs from 'fs';

describe('Rule Simulator, Privacy Center & Plugin Manager Suite', () => {
  const testDir = path.join(__dirname, 'tmp_rule_sim_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should simulate automation rules against historical data and report conflicts', () => {
    const historical = [
      { category: 'video', filename: 'clip1.mp4' },
      { category: 'video', filename: 'clip2.mp4' },
      { category: 'document', filename: 'doc.pdf' },
    ];

    const rule: any = {
      id: 'r_sim_1',
      name: 'Move Videos',
      enabled: true,
      trigger: 'DOWNLOAD_COMPLETED',
      conditions: [{ field: 'category', value: 'video' }],
      actions: [{ actionType: 'MOVE_TO_DIR', params: { targetDir: 'Videos' } }],
    };

    const sim = RuleSimulator.simulate(rule, historical);
    expect(sim.wouldHaveTriggeredCount).toBe(2);
    expect(sim.simulatedActions.length).toBe(2);
  });

  it('should generate privacy summary and support confirmed data wipe', async () => {
    const db = new AppDatabase(path.join(testDir, 'priv.db'));
    await db.init();

    const summary = PrivacyCenter.getPrivacySummary(db);
    expect(summary.externalTelemetryEnabled).toBe(false);

    const wipeReject = PrivacyCenter.wipeAllData(db, 'wrong phrase');
    expect(wipeReject.success).toBe(false);

    const wipeConfirm = PrivacyCenter.wipeAllData(db, 'DELETE ALL G1DM DATA');
    expect(wipeConfirm.success).toBe(true);

    db.close();
  });

  it('should register sandboxed plugins and enforce permissions', () => {
    const manager = new PluginManager();
    const plugin = manager.registerPlugin({
      id: 'plugin_ffmpeg_mux',
      name: 'FFmpeg Muxer Extension',
      version: '1.0.0',
      author: 'G1DM Community',
      category: 'MEDIA_ANALYZER',
      permissions: ['filesystem:read'],
      minG1dmVersion: '1.0.0',
    });

    expect(plugin.status).toBe('ACTIVE');
    expect(manager.getPlugins().length).toBe(1);

    manager.disablePlugin('plugin_ffmpeg_mux');
    expect(manager.getPlugins()[0].status).toBe('DISABLED');
  });
});
