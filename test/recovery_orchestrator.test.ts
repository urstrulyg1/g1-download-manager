import { RecoveryOrchestrator } from '../src/main/engine/RecoveryOrchestrator';
import { ServerPolicyEngine } from '../src/main/engine/ServerPolicyEngine';
import { AppDatabase } from '../src/main/db/Database';
import { NetworkTransitionDetector } from '../src/main/network/NetworkTransitionDetector';
import * as path from 'path';
import * as fs from 'fs';

describe('Recovery Orchestrator & Network Transition Suite', () => {
  const testDir = path.join(__dirname, 'tmp_rec_orch');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should evaluate server rate-limiting and command adaptive AIMD backoff', async () => {
    const db = new AppDatabase(path.join(testDir, 'orch.db'));
    await db.init();
    const policy = new ServerPolicyEngine();
    const orchestrator = new RecoveryOrchestrator(policy, db);

    const mockItem: any = {
      id: 'dl_fail_429',
      url: 'https://cdn.example.com/bigdata.tar',
      retryCount: 0,
    };

    const decision = orchestrator.evaluateFailure(mockItem, new Error('HTTP 429 Too Many Requests'));
    expect(decision.category).toBe('SERVER_FAILURE');
    expect(decision.action).toBe('ADAPTIVE_AIMD_BACKOFF');
    expect(decision.newConnectionCount).toBeDefined();
    expect(decision.explanation).toContain('throttled concurrent requests');

    db.close();
  });

  it('should detect network interface and IP changes', () => {
    const detector = new NetworkTransitionDetector();
    const ip = detector.getActiveIp();
    expect(typeof ip).toBe('string');
  });
});
