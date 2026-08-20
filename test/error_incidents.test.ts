import { ErrorIncidentEngine } from '../src/main/diagnostics/ErrorIncidentEngine';
import { SupportBundle } from '../src/main/diagnostics/SupportBundle';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import * as path from 'path';
import * as fs from 'fs';

describe('Error Incidents & Support Bundle Suite', () => {
  const testDir = path.join(__dirname, 'tmp_support_bundle');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should correlate failure bursts into incidents', () => {
    const engine = new ErrorIncidentEngine();
    const inc = engine.recordIncident('NETWORK_INSTABILITY_SPIKE', 'Wi-Fi Disconnect Burst', 4, 'Multiple sockets closed simultaneously');

    expect(inc.incidentId).toContain('INCIDENT_');
    expect(inc.affectedDownloadsCount).toBe(4);
    expect(inc.corruptedDownloadsCount).toBe(0);
    expect(engine.getIncidents().length).toBe(1);
  });

  it('should generate sanitized support diagnostic bundles', async () => {
    const db = new AppDatabase(path.join(testDir, 'bundle.db'));
    await db.init();
    const downloadEngine = new DownloadEngine(db);
    await downloadEngine.init();

    const bundle = SupportBundle.generateBundle(db, downloadEngine, [{ name: 'Test Diagnostic', status: 'ok' }]);

    expect(bundle.bundleVersion).toBe('2.0.0');
    expect(bundle.system.platform).toBeDefined();
    expect(bundle.redactionAudit.isSafeToShare).toBe(true);

    await downloadEngine.shutdown();
    db.close();
  });
});
