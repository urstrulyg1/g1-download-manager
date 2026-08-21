import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { execFileSync } from 'child_process';
import { AutoExtractor } from '../src/main/archive/AutoExtractor';

describe('AutoExtractor — real extraction engine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm-extract-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeZip(name: string, files: Record<string, string>): string {
    // Build the zip with the system zip if available, else via archiver dependency
    const zipPath = path.join(tmpDir, name);
    const srcDir = path.join(tmpDir, 'zipsrc');
    fs.mkdirSync(srcDir, { recursive: true });
    for (const [fname, content] of Object.entries(files)) {
      const target = path.join(srcDir, fname);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    try {
      execFileSync('zip', ['-r', zipPath, '.'], { cwd: srcDir });
      return zipPath;
    } catch {
      return ''; // system zip unavailable
    }
  }

  it('extracts a real .zip archive natively via yauzl', async () => {
    const zipPath = makeZip('sample.zip', {
      'readme.txt': 'hello from G1DM',
      'nested/data.json': '{"ok":true}',
    });
    if (!zipPath) return; // zip tool unavailable in this environment — skip

    const result = await AutoExtractor.extractArchive(zipPath);
    expect(result.extracted).toBe(true);
    expect(result.engineUsed === 'built-in-zip' || result.engineUsed === 'system-7z' || result.engineUsed === 'system-unzip').toBe(true);

    const readme = result.extractedFiles.find((f) => f.endsWith('readme.txt'));
    expect(readme).toBeDefined();
    expect(fs.readFileSync(readme!, 'utf8')).toBe('hello from G1DM');

    const nested = result.extractedFiles.find((f) => f.endsWith(path.join('nested', 'data.json')));
    expect(nested).toBeDefined();
    expect(JSON.parse(fs.readFileSync(nested!, 'utf8')).ok).toBe(true);
  });

  it('extracts a real .gz file via zlib', async () => {
    const gzPath = path.join(tmpDir, 'notes.txt.gz');
    fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from('gzip content works')));

    const result = await AutoExtractor.extractArchive(gzPath);
    expect(result.extracted).toBe(true);
    expect(result.engineUsed).toBe('built-in-gzip');
    expect(result.extractedFiles.length).toBe(1);
    expect(fs.readFileSync(result.extractedFiles[0], 'utf8')).toBe('gzip content works');
  });

  it('extracts a real .tar archive via the built-in ustar parser', async () => {
    // Build a minimal valid tar buffer by hand (one file entry)
    const content = Buffer.from('tar entry payload');
    const header = Buffer.alloc(512);
    header.write('payload.txt', 0); // name
    header.write('0000644', 100); // mode
    header.write('0000000', 108); // uid
    header.write('0000000', 116); // gid
    header.write(content.length.toString(8).padStart(11, '0'), 124); // size
    header.write('00000000000', 136); // mtime
    header.write('        ', 148); // checksum placeholder (spaces during computation)
    header[156] = '0'.charCodeAt(0); // typeflag: regular file
    header.write('ustar', 257);
    let checksum = 0;
    for (const b of header) checksum += b;
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);

    const dataBlock = Buffer.alloc(Math.ceil(content.length / 512) * 512);
    content.copy(dataBlock);
    const tarBuf = Buffer.concat([header, dataBlock, Buffer.alloc(1024)]);

    const tarPath = path.join(tmpDir, 'bundle.tar');
    fs.writeFileSync(tarPath, tarBuf);

    const result = await AutoExtractor.extractArchive(tarPath);
    expect(result.extracted).toBe(true);
    expect(result.engineUsed).toBe('built-in-tar');
    const extracted = result.extractedFiles.find((f) => f.endsWith('payload.txt'));
    expect(extracted).toBeDefined();
    expect(fs.readFileSync(extracted!, 'utf8')).toBe('tar entry payload');
  });

  it('extracts .tar.gz archives (gunzip + tar)', async () => {
    const content = Buffer.from('tgz works');
    const header = Buffer.alloc(512);
    header.write('inner.txt', 0);
    header.write('0000644', 100);
    header.write(content.length.toString(8).padStart(11, '0'), 124);
    header.write('        ', 148);
    header[156] = '0'.charCodeAt(0);
    let checksum = 0;
    for (const b of header) checksum += b;
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    const dataBlock = Buffer.alloc(512);
    content.copy(dataBlock);
    const tarBuf = Buffer.concat([header, dataBlock, Buffer.alloc(1024)]);

    const tgzPath = path.join(tmpDir, 'bundle.tar.gz');
    fs.writeFileSync(tgzPath, zlib.gzipSync(tarBuf));

    const result = await AutoExtractor.extractArchive(tgzPath);
    expect(result.extracted).toBe(true);
    const extracted = result.extractedFiles.find((f) => f.endsWith('inner.txt'));
    expect(extracted).toBeDefined();
    expect(fs.readFileSync(extracted!, 'utf8')).toBe('tgz works');
  });

  it('blocks zip-slip / path traversal entries in tar archives', async () => {
    const content = Buffer.from('evil');
    const header = Buffer.alloc(512);
    header.write('../../escape.txt', 0); // traversal attempt
    header.write('0000644', 100);
    header.write(content.length.toString(8).padStart(11, '0'), 124);
    header.write('        ', 148);
    header[156] = '0'.charCodeAt(0);
    let checksum = 0;
    for (const b of header) checksum += b;
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    const dataBlock = Buffer.alloc(512);
    content.copy(dataBlock);
    const tarPath = path.join(tmpDir, 'evil.tar');
    fs.writeFileSync(tarPath, Buffer.concat([header, dataBlock, Buffer.alloc(1024)]));

    const result = await AutoExtractor.extractArchive(tarPath);
    // The malicious entry must NOT be written outside the destination dir
    expect(fs.existsSync(path.join(tmpDir, '..', '..', 'escape.txt'))).toBe(false);
    expect(result.extractedFiles.every((f) => f.startsWith(result.destinationDir))).toBe(true);
  });

  it('deletes the original archive when requested', async () => {
    const gzPath = path.join(tmpDir, 'temp.txt.gz');
    fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from('bye')));

    const result = await AutoExtractor.extractArchive(gzPath, [], true);
    expect(result.extracted).toBe(true);
    expect(result.deletedArchive).toBe(true);
    expect(fs.existsSync(gzPath)).toBe(false);
  });

  it('returns unsupported for unknown extensions without fabricating output', async () => {
    const filePath = path.join(tmpDir, 'movie.mp4');
    fs.writeFileSync(filePath, 'not an archive');
    const result = await AutoExtractor.extractArchive(filePath);
    expect(result.extracted).toBe(false);
    expect(result.extractedFiles.length).toBe(0);
  });
});
