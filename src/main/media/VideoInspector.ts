import * as http from 'http';
import * as https from 'https';
import { TlsPolicy } from '../security/TlsPolicy';

export interface InspectedVideoMetadata {
  container: 'MP4' | 'WebM' | 'MKV' | 'MPEG-TS' | 'Unknown';
  width?: number;
  height?: number;
  durationSec?: number;
  videoCodec?: string;
  audioCodec?: string;
  majorBrand?: string;
  isFragmented?: boolean;
}

export class VideoInspector {
  public static async inspectRemoteHeader(mediaUrl: string, timeoutMs: number = 10000): Promise<InspectedVideoMetadata> {
    try {
      const headerBuffer = await this.fetchRangeBuffer(mediaUrl, 0, 128 * 1024 - 1, timeoutMs);
      return this.parseHeaderBuffer(headerBuffer);
    } catch {
      return { container: 'Unknown' };
    }
  }

  public static parseHeaderBuffer(buf: Buffer): InspectedVideoMetadata {
    if (buf.length < 4) return { container: 'Unknown' };

    // 1. Check MP4 ftyp box
    // Box structure: 4 bytes length, 4 bytes type ("ftyp")
    if (buf.length >= 8) {
      const boxType = buf.toString('ascii', 4, 8);
      if (boxType === 'ftyp') {
        const majorBrand = buf.length >= 12 ? buf.toString('ascii', 8, 12).trim() : 'isom';
        const mp4Meta = this.parseMp4Boxes(buf);
        return {
          container: 'MP4',
          majorBrand,
          width: mp4Meta.width,
          height: mp4Meta.height,
          durationSec: mp4Meta.durationSec,
          videoCodec: mp4Meta.videoCodec || 'H.264 / AVC',
          audioCodec: 'AAC',
          isFragmented: buf.includes(Buffer.from('moof')),
        };
      }
    }

    // 2. Check WebM / MKV EBML Header (0x1A 0x45 0xDF 0xA3)
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      const isWebM = buf.includes(Buffer.from('webm', 'ascii'));
      return {
        container: isWebM ? 'WebM' : 'MKV',
        videoCodec: isWebM ? 'VP9 / AV1' : 'H.264 / H.265',
        audioCodec: isWebM ? 'Opus' : 'AAC / AC-3',
      };
    }

    // 3. Check MPEG-TS Sync Byte (0x47)
    if (buf[0] === 0x47 && (buf.length < 188 || buf[188] === 0x47)) {
      return {
        container: 'MPEG-TS',
        videoCodec: 'H.264 / MPEG-2',
        audioCodec: 'AAC / MP2',
      };
    }

    return { container: 'Unknown' };
  }

  private static parseMp4Boxes(buf: Buffer): { width?: number; height?: number; durationSec?: number; videoCodec?: string } {
    let offset = 0;
    let width: number | undefined;
    let height: number | undefined;
    let durationSec: number | undefined;

    while (offset + 8 <= buf.length) {
      const boxSize = buf.readUInt32BE(offset);
      const boxType = buf.toString('ascii', offset + 4, offset + 8);

      if (boxSize <= 0 || offset + boxSize > buf.length + 1000) {
        break;
      }

      if (boxType === 'moov' || boxType === 'trak' || boxType === 'mdia' || boxType === 'minf' || boxType === 'stbl') {
        // Step inside container box
        offset += 8;
        continue;
      }

      // Check tkhd (Track Header) for video dimensions
      if (boxType === 'tkhd' && offset + 84 <= buf.length) {
        const version = buf.readUInt8(offset + 8);
        const widthOffset = version === 1 ? offset + 96 : offset + 84;
        const heightOffset = version === 1 ? offset + 100 : offset + 88;

        if (widthOffset + 4 <= buf.length && heightOffset + 4 <= buf.length) {
          // Fixed point 16.16 format in tkhd
          const w = buf.readUInt32BE(widthOffset) >> 16;
          const h = buf.readUInt32BE(heightOffset) >> 16;
          if (w > 0 && h > 0) {
            width = w;
            height = h;
          }
        }
      }

      // Check mvhd (Movie Header) for duration and timescale
      if (boxType === 'mvhd' && offset + 32 <= buf.length) {
        const version = buf.readUInt8(offset + 8);
        const timescaleOffset = version === 1 ? offset + 28 : offset + 20;
        const durationOffset = version === 1 ? offset + 32 : offset + 24;

        if (timescaleOffset + 4 <= buf.length && durationOffset + 4 <= buf.length) {
          const timescale = buf.readUInt32BE(timescaleOffset);
          const duration = version === 1 ? Number(buf.readBigUInt64BE(durationOffset)) : buf.readUInt32BE(durationOffset);
          if (timescale > 0) {
            durationSec = Math.round((duration / timescale) * 10) / 10;
          }
        }
      }

      offset += boxSize;
    }

    return { width, height, durationSec };
  }

  private static async fetchRangeBuffer(mediaUrl: string, start: number, end: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(mediaUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(
        mediaUrl,
        {
          headers: {
            'Range': `bytes=${start}-${end}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': '*/*',
          },
          timeout: timeoutMs,
          rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
        },
        (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
            res.headers.location
          ) {
            const redirect = new URL(res.headers.location, mediaUrl).href;
            this.fetchRangeBuffer(redirect, start, end, timeoutMs).then(resolve).catch(reject);
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Range fetch timed out')));
    });
  }
}
