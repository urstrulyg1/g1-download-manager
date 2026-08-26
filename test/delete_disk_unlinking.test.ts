import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Real Disk File Deletion Invariants', () => {
  const testDir = path.join(__dirname, 'tmp_delete_test_data');
  let db: AppDatabase;
  let engine: DownloadEngine;

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    const dbPath = path.join(testDir, 'test.db');
    db = new AppDatabase(dbPath);
    engine = new DownloadEngine(db);
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('permanently deletes target file, .part, .g1dm, and related stem files when deleteFile=true', async () => {
    const destDir = path.join(testDir, 'dl1');
    fs.mkdirSync(destDir, { recursive: true });

    const finalPath = path.join(destDir, 'my_video_movie.mp4');
    const partPath = `${finalPath}.part`;
    const g1dmPath = `${finalPath}.g1dm`;
    const ytdlChunk = path.join(destDir, 'my_video_movie.f137.mp4');
    const webmChunk = path.join(destDir, 'my_video_movie.f251.webm');

    fs.writeFileSync(finalPath, 'sample movie payload');
    fs.writeFileSync(partPath, 'partial buffer');
    fs.writeFileSync(g1dmPath, '{"state": 1}');
    fs.writeFileSync(ytdlChunk, 'chunk 1');
    fs.writeFileSync(webmChunk, 'chunk 2');

    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.existsSync(partPath)).toBe(true);
    expect(fs.existsSync(g1dmPath)).toBe(true);
    expect(fs.existsSync(ytdlChunk)).toBe(true);
    expect(fs.existsSync(webmChunk)).toBe(true);

    const item = await engine.addDownload({
      url: 'https://example.com/my_video_movie.mp4',
      filename: 'my_video_movie.mp4',
      destinationDir: destDir,
      startImmediately: false,
    });

    engine.deleteDownload(item.id, true);

    // Verify all physical files on disk are completely removed
    expect(fs.existsSync(finalPath)).toBe(false);
    expect(fs.existsSync(partPath)).toBe(false);
    expect(fs.existsSync(g1dmPath)).toBe(false);
    expect(fs.existsSync(ytdlChunk)).toBe(false);
    expect(fs.existsSync(webmChunk)).toBe(false);

    // Verify removed from database
    expect(engine.getDownload(item.id)).toBeUndefined();
    expect(db.getDownload(item.id)).toBeNull();
  });

  it('keeps real file on disk when deleteFile=false (soft delete from G1DM database only)', async () => {
    const destDir = path.join(testDir, 'dl2');
    fs.mkdirSync(destDir, { recursive: true });

    const finalPath = path.join(destDir, 'important_document.pdf');
    fs.writeFileSync(finalPath, 'PDF content');

    const item = await engine.addDownload({
      url: 'https://example.com/important_document.pdf',
      filename: 'important_document.pdf',
      destinationDir: destDir,
      startImmediately: false,
    });

    engine.deleteDownload(item.id, false);

    // File must still exist on disk!
    expect(fs.existsSync(finalPath)).toBe(true);

    // Removed from DB
    expect(engine.getDownload(item.id)).toBeUndefined();
    expect(db.getDownload(item.id)).toBeNull();
  });
});
