import * as fs from 'fs';
import { exec } from 'child_process';

export class MediaMuxer {
  public static async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('ffmpeg -version', (err) => {
        resolve(!err);
      });
    });
  }

  public static async remuxSegments(
    sourceSegmentFiles: string[],
    targetFilePath: string
  ): Promise<void> {
    // If FFmpeg is not available or raw concatenation is sufficient
    const output = fs.createWriteStream(targetFilePath, { flags: 'w' });

    for (const segFile of sourceSegmentFiles) {
      if (fs.existsSync(segFile)) {
        const buf = fs.readFileSync(segFile);
        output.write(buf);
      }
    }

    await new Promise<void>((resolve, reject) => {
      output.end(() => resolve());
      output.on('error', reject);
    });
  }
}
