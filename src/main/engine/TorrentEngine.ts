import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TorrentMetadata {
  infoHash: string;
  name: string;
  totalSize: number;
  pieceLength: number;
  numPieces: number;
  files: { path: string; length: number }[];
  webSeeds: string[];
}

export interface TorrentItemStatus {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  seeders: number;
  leechers: number;
  webSeedAccelerated: boolean;
  status: 'downloading' | 'seeding' | 'paused' | 'completed';
}

/**
 * BitTorrent metadata parsing (magnet URIs and .torrent files via bencode).
 *
 * NOTE: This module parses torrents and tracks them, but does not include a
 * full peer-wire client. Speeds / seeder counts are reported as 0 until a
 * BitTorrent transport engine is wired in — it no longer fabricates 5 MB/s
 * and 42 seeders.
 */
export class TorrentEngine {
  private static activeTorrents: Map<string, TorrentItemStatus> = new Map();

  public static parseMagnetUri(magnetUrl: string): TorrentMetadata {
    const matchHash = magnetUrl.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    const infoHash = matchHash ? matchHash[1].toLowerCase() : `thash_${Date.now()}`;
    const nameMatch = magnetUrl.match(/dn=([^&]+)/);
    const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Torrent_Download';

    const webSeeds: string[] = [];
    for (const wsMatch of magnetUrl.matchAll(/ws=([^&]+)/g)) {
      try {
        webSeeds.push(decodeURIComponent(wsMatch[1]));
      } catch {
        // ignore malformed web seed
      }
    }

    return {
      infoHash,
      name,
      totalSize: 0, // unknown until metadata is fetched from peers
      pieceLength: 0,
      numPieces: 0,
      files: [],
      webSeeds,
    };
  }

  public static parseTorrentFile(filePath: string): TorrentMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Torrent file does not exist: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath);
    const decoded = Bencode.decode(raw) as Record<string, any>;
    const info = (decoded.info && typeof decoded.info === 'object' ? decoded.info : {}) as Record<
      string,
      any
    >;

    const asString = (v: unknown): string => (Buffer.isBuffer(v) ? v.toString('utf8') : String(v ?? ''));

    const name = asString(info.name) || path.basename(filePath).replace(/\.torrent$/i, '');
    const pieceLength = Number(info['piece length'] || 0);
    const pieces = Buffer.isBuffer(info.pieces) ? info.pieces.length / 20 : 0;

    let files: { path: string; length: number }[] = [];
    let totalSize = 0;
    if (Array.isArray(info.files)) {
      files = info.files.map((f: any) => {
        const p = Array.isArray(f.path) ? f.path.map(asString).join('/') : asString(f.path);
        const length = Number(f.length || 0);
        totalSize += length;
        return { path: p, length };
      });
    } else {
      totalSize = Number(info.length || 0);
      files = [{ path: name, length: totalSize }];
    }

    return {
      infoHash: Bencode.infoHash(raw),
      name,
      totalSize,
      pieceLength,
      numPieces: Math.floor(pieces),
      files,
      webSeeds: Array.isArray(decoded['url-list']) ? decoded['url-list'].map(asString) : [],
    };
  }

  public static addTorrent(magnetOrFilePath: string): TorrentItemStatus {
    let meta: TorrentMetadata;
    if (magnetOrFilePath.startsWith('magnet:')) {
      meta = this.parseMagnetUri(magnetOrFilePath);
    } else {
      meta = this.parseTorrentFile(magnetOrFilePath);
    }

    const status: TorrentItemStatus = {
      infoHash: meta.infoHash,
      name: meta.name,
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      seeders: 0,
      leechers: 0,
      webSeedAccelerated: meta.webSeeds.length > 0,
      status: 'downloading',
    };

    this.activeTorrents.set(meta.infoHash, status);
    return status;
  }

  public static getTorrentStatus(infoHash: string): TorrentItemStatus | undefined {
    return this.activeTorrents.get(infoHash);
  }

  public static getAllTorrents(): TorrentItemStatus[] {
    return Array.from(this.activeTorrents.values());
  }
}

/** Minimal bencode decoder for .torrent files. */
class Bencode {
  public static decode(data: Buffer): unknown {
    const [value] = Bencode.parse(data, 0);
    return value;
  }

  /** SHA-1 of the raw bencoded `info` dictionary. */
  public static infoHash(torrentBuffer: Buffer): string {
    const marker = Buffer.from('4:info');
    const start = torrentBuffer.indexOf(marker);
    if (start < 0) return '';
    const valueStart = start + marker.length;
    const [, end] = Bencode.parse(torrentBuffer, valueStart);
    return crypto.createHash('sha1').update(torrentBuffer.subarray(valueStart, end)).digest('hex');
  }

  private static parse(data: Buffer, offset: number): [unknown, number] {
    const byte = data[offset];
    if (byte === 0x69) {
      // integer
      const end = data.indexOf(0x65, offset);
      if (end < 0) throw new Error('Invalid bencode integer');
      return [parseInt(data.subarray(offset + 1, end).toString('utf8'), 10), end + 1];
    }
    if (byte === 0x6c) {
      // list
      const list: unknown[] = [];
      let i = offset + 1;
      while (data[i] !== 0x65) {
        const [v, next] = Bencode.parse(data, i);
        list.push(v);
        i = next;
      }
      return [list, i + 1];
    }
    if (byte === 0x64) {
      // dictionary
      const dict: Record<string, unknown> = {};
      let i = offset + 1;
      while (data[i] !== 0x65) {
        const [k, kEnd] = Bencode.parse(data, i);
        const [v, vEnd] = Bencode.parse(data, kEnd);
        dict[Buffer.isBuffer(k) ? k.toString('utf8') : String(k)] = v;
        i = vEnd;
      }
      return [dict, i + 1];
    }
    // byte string
    const colon = data.indexOf(0x3a, offset);
    if (colon < 0) throw new Error('Invalid bencode string');
    const length = parseInt(data.subarray(offset, colon).toString('utf8'), 10);
    const strStart = colon + 1;
    return [data.subarray(strStart, strStart + length), strStart + length];
  }
}
