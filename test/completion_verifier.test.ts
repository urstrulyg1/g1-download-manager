import * as fs from 'fs';
import * as path from 'path';
import { CompletionVerifier } from '../src/main/engine/CompletionVerifier';
import { DownloadItem } from '../src/shared/types';

describe('Completion Verifier Multi-Stage Pipeline', () => {
  const testDir = path.join(__dirname, 'tmp_comp_verifier');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should validate and atomically rename complete downloads', async () => {
    const tempFile = path.join(testDir, 'valid_test.zip.part');
    const finalFile = path.join(testDir, 'valid_test.zip');
    const stateFile = path.join(testDir, 'valid_test.zip.g1dm');

    const data = Buffer.from('Valid Complete Zip Payload Data 2026');
    fs.writeFileSync(tempFile, data);
    fs.writeFileSync(stateFile, JSON.stringify({ ok: true }));

    const mockItem: any = {
      id: 'dl_verify_1',
      filename: 'valid_test.zip',
      tempPath: tempFile,
      finalPath: finalFile,
      stateFilePath: stateFile,
      totalBytes: data.length,
      downloadedBytes: data.length,
      segments: [{ id: 1, startOffset: 0, endOffset: data.length - 1, downloadedBytes: data.length, status: 'completed' }],
      checksum: { algorithm: 'sha256', status: 'none' },
    };

    const res = await CompletionVerifier.verifyAndFinalize(mockItem);
    expect(res.valid).toBe(true);
    expect(res.stage).toBe('COMPLETE');
    expect(fs.existsSync(finalFile)).toBe(true);
    expect(fs.existsSync(tempFile)).toBe(false);
    expect(fs.existsSync(stateFile)).toBe(false);
  });

  it('should detect range gaps between segments and reject completion', async () => {
    const tempFile = path.join(testDir, 'gap_test.bin.part');
    const finalFile = path.join(testDir, 'gap_test.bin');
    fs.writeFileSync(tempFile, Buffer.alloc(100));

    const mockItem: any = {
      id: 'dl_gap_test',
      filename: 'gap_test.bin',
      tempPath: tempFile,
      finalPath: finalFile,
      totalBytes: 100,
      downloadedBytes: 80,
      segments: [
        { id: 1, startOffset: 0, endOffset: 40, downloadedBytes: 41, status: 'completed' },
        { id: 2, startOffset: 50, endOffset: 99, downloadedBytes: 50, status: 'completed' }, // Gap from 41 to 49!
      ],
    };

    const res = await CompletionVerifier.verifyAndFinalize(mockItem);
    expect(res.valid).toBe(false);
    expect(res.stage).toBe('RANGES');
    expect(res.error).toContain('Range gap detected');
  });

  it('should detect HTML error page disguised as binary file', async () => {
    const tempFile = path.join(testDir, 'fake_error.zip.part');
    const finalFile = path.join(testDir, 'fake_error.zip');
    fs.writeFileSync(tempFile, Buffer.from('<!DOCTYPE html><html><body>403 Forbidden Access Denied</body></html>'));

    const mockItem: any = {
      id: 'dl_fake_html',
      filename: 'fake_error.zip',
      tempPath: tempFile,
      finalPath: finalFile,
      totalBytes: 0,
      downloadedBytes: 50,
      segments: [],
    };

    const res = await CompletionVerifier.verifyAndFinalize(mockItem);
    expect(res.valid).toBe(false);
    expect(res.stage).toBe('CONTENT');
    expect(res.error).toContain('HTML error webpage');
  });
});
