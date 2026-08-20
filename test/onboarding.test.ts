import { OnboardingService } from '../src/main/engine/OnboardingService';
import { AppDatabase } from '../src/main/db/Database';
import * as path from 'path';
import * as fs from 'fs';

describe('Smart Onboarding & Installation Self-Check Suite', () => {
  const testDir = path.join(__dirname, 'tmp_onboarding_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should run full installation self-check and detect system readiness', async () => {
    const db = new AppDatabase(path.join(testDir, 'onboarding.db'));
    await db.init();

    const report = await OnboardingService.runSelfCheck(db);
    expect(report.ready).toBe(true);
    expect(report.osName).toBeDefined();
    expect(report.cpuArchitecture).toBeDefined();
    expect(report.checks.length).toBeGreaterThanOrEqual(5);

    expect(report.checks.some((c) => c.name.includes('Core Download Engine'))).toBe(true);
    expect(report.checks.some((c) => c.name.includes('HTTPS & TLS'))).toBe(true);

    db.close();
  });
});
