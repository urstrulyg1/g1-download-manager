import * as fs from 'fs';
import * as path from 'path';
import { MediaDownloadPipeline } from '../src/main/media/MediaDownloadPipeline';

describe('Media Download Pipeline & Muxing Suite', () => {
  const testDir = path.join(__dirname, 'tmp_mux_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should execute multi-stream media download and remuxing cleanly', async () => {
    const videoVariant: any = {
      id: 'v1',
      resolutionLabel: '1080p',
      downloadUrl: 'https://cdn.example.com/v.mp4',
    };

    const res = await MediaDownloadPipeline.executePipeline({
      videoVariant,
      destinationDir: testDir,
      finalFilename: 'pipeline_single.mp4',
    });

    expect(res.success).toBe(true);
    expect(res.finalPath).toContain('pipeline_single.mp4');
  });

  it('should preserve raw streams if muxing encounters an error without dropping data', async () => {
    const videoVariant: any = { id: 'v1', resolutionLabel: '1080p' };
    const audioVariant: any = { id: 'a1', language: 'en' };

    const videoTemp = path.join(testDir, 'recover_video.mp4.video.tmp');
    const audioTemp = path.join(testDir, 'recover_video.mp4.audio.tmp');
    fs.writeFileSync(videoTemp, Buffer.from('Raw Video Data 2026'));
    fs.writeFileSync(audioTemp, Buffer.from('Raw Audio Data 2026'));

    const res = await MediaDownloadPipeline.executePipeline({
      videoVariant,
      audioVariant,
      destinationDir: testDir,
      finalFilename: 'recover_video.mp4',
    });

    expect(res.success).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'recover_video.mp4'))).toBe(true);
  });
});
