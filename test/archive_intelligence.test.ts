import { ArchiveIntelligence } from '../src/main/archive/ArchiveIntelligence';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

describe('Archive Intelligence & Safety Audit Suite', () => {
  const testDir = path.join(__dirname, 'tmp_arch_intel');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should analyze zip files, compute compression ratio, and audit security', async () => {
    const zipPath = path.join(testDir, 'sample_intel.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.append('Sample text 12345', { name: 'document.txt' });
      archive.finalize();
    });

    const report = await ArchiveIntelligence.analyzeArchive(zipPath);
    expect(report.isArchive).toBe(true);
    expect(report.totalEntries).toBe(1);
    expect(report.securityAudit.isSafeToExtract).toBe(true);
    expect(report.securityAudit.hasZipSlip).toBe(false);
  });
});
