import * as fs from 'fs';
import * as path from 'path';
import { FtpManager } from '../src/main/ftp/FtpManager';

describe('FTP Manager & Timestamp Preservation', () => {
  const testDir = path.join(__dirname, 'tmp_ftp_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should preserve remote modification timestamps on local files', () => {
    const localFile = path.join(testDir, 'timestamp_test.txt');
    fs.writeFileSync(localFile, 'Sample content');

    const targetTime = new Date('2026-05-15T08:30:00Z').getTime();
    FtpManager.preserveTimestamp(localFile, targetTime);

    const stat = fs.statSync(localFile);
    expect(Math.abs(stat.mtimeMs - targetTime)).toBeLessThan(2000);
  });
});
