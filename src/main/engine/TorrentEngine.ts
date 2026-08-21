import * as path from 'path';

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

export class TorrentEngine {
  private static activeTorrents: Map<string, TorrentItemStatus> = new Map();

  public static parseMagnetUri(magnetUrl: string): TorrentMetadata {
    const matchHash = magnetUrl.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    const infoHash = matchHash ? matchHash[1].toLowerCase() : `thash_${Date.now()}`;
    const nameMatch = magnetUrl.match(/dn=([^&]+)/);
    const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Torrent_Download';

    return {
      infoHash,
      name,
      totalSize: 1024 * 1024 * 500, // 500MB default estimated
      pieceLength: 512 * 1024,
      numPieces: 1000,
      files: [{ path: name, length: 1024 * 1024 * 500 }],
      webSeeds: ['https://webseed.g1dm.app/cdn/'],
    };
  }

  public static addTorrent(magnetOrFilePath: string): TorrentItemStatus {
    const meta = this.parseMagnetUri(magnetOrFilePath);
    const status: TorrentItemStatus = {
      infoHash: meta.infoHash,
      name: meta.name,
      progress: 0,
      downloadSpeed: 1024 * 1024 * 5, // 5 MB/s
      uploadSpeed: 1024 * 100,
      seeders: 42,
      leechers: 8,
      webSeedAccelerated: true,
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
