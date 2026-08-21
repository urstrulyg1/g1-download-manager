import * as fs from 'fs';
import * as path from 'path';
import { Request, Response } from 'express';
import * as mime from 'mime-types';
import { AppDatabase } from '../db/Database';

export interface StreamRangeInfo {
  start: number;
  end: number;
  total: number;
  chunkSize: number;
  mimeType: string;
  isPartial: boolean;
}

export class StreamPreviewService {
  /**
   * Serves an active or completed download stream supporting HTTP 206 Range requests.
   */
  public static async handleStreamRequest(req: Request, res: Response, downloadId: string, db?: AppDatabase): Promise<void> {
    const database = db || new AppDatabase();
    const item = database.getDownload(downloadId);

    if (!item) {
      res.status(404).json({ error: 'Download record not found' });
      return;
    }

    // Determine target path on disk
    let filePath = item.finalPath || path.join(item.destinationDir || '', item.filename || '');

    // Check if destination file exists
    if (!fs.existsSync(filePath)) {
      // Check temp/partial file
      const tempPath = item.tempPath || `${filePath}.g1dm.part`;
      if (fs.existsSync(tempPath)) {
        filePath = tempPath;
      } else {
        res.status(404).json({ error: 'Media file not yet created on disk' });
        return;
      }
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch (err: any) {
      res.status(500).json({ error: `Cannot read file stats: ${err.message}` });
      return;
    }

    // Total file size: prefer declared totalBytes if larger than current on-disk partial size
    const totalSize = item.totalBytes > 0 ? item.totalBytes : stats.size;
    const currentOnDiskSize = stats.size;

    // Determine MIME type
    const ext = path.extname(item.filename || filePath).toLowerCase();
    let mimeType = mime.lookup(ext) || 'video/mp4';
    if (ext === '.mkv') mimeType = 'video/x-matroska';
    if (ext === '.webm') mimeType = 'video/webm';
    if (ext === '.mp4') mimeType = 'video/mp4';
    if (ext === '.flac') mimeType = 'audio/flac';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    if (ext === '.m4a') mimeType = 'audio/mp4';

    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      // No range requested: send initial stream with Accept-Ranges
      const head = {
        'Content-Length': currentOnDiskSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath, { start: 0, end: Math.max(0, currentOnDiskSize - 1) }).pipe(res);
      return;
    }

    // Parse Range header (e.g., "bytes=0-1048576" or "bytes=500000-")
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const requestedStart = parseInt(parts[0], 10);
    const requestedEnd = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    // Constrain range to currently available bytes on disk
    const start = Math.min(requestedStart, currentOnDiskSize - 1);
    const end = Math.min(requestedEnd, currentOnDiskSize - 1);

    if (start < 0 || start >= currentOnDiskSize) {
      res.status(416).set({
        'Content-Range': `bytes */${totalSize}`,
      }).end();
      return;
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    const headers = {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    res.writeHead(206, headers);
    fileStream.pipe(res);
  }

  /**
   * Inspects preview availability and buffer readiness for a download.
   */
  public static getPreviewStatus(downloadId: string, db?: AppDatabase): {
    canPreview: boolean;
    availableBytes: number;
    totalBytes: number;
    progressPercentage: number;
    mimeType: string;
    isComplete: boolean;
  } {
    const database = db || new AppDatabase();
    const item = database.getDownload(downloadId);

    if (!item) {
      return {
        canPreview: false,
        availableBytes: 0,
        totalBytes: 0,
        progressPercentage: 0,
        mimeType: 'application/octet-stream',
        isComplete: false,
      };
    }

    let filePath = item.finalPath || path.join(item.destinationDir || '', item.filename || '');
    let availableBytes = item.downloadedBytes;

    if (fs.existsSync(filePath)) {
      availableBytes = fs.statSync(filePath).size;
    } else {
      const partPath = item.tempPath || `${filePath}.g1dm.part`;
      if (fs.existsSync(partPath)) {
        availableBytes = fs.statSync(partPath).size;
      }
    }

    const totalBytes = item.totalBytes || availableBytes;
    const progressPercentage = totalBytes > 0 ? (availableBytes / totalBytes) * 100 : 0;
    const ext = path.extname(item.filename || filePath).toLowerCase();
    const isMedia = ['.mp4', '.mkv', '.webm', '.mov', '.ts', '.mp3', '.flac', '.m4a', '.wav', '.ogg', '.opus', '.avi', '.m4v'].includes(ext);

    // Can preview if it's media and has at least 256KB buffered on disk
    const canPreview = isMedia && availableBytes >= 256 * 1024;

    return {
      canPreview,
      availableBytes,
      totalBytes,
      progressPercentage: Math.min(100, Math.round(progressPercentage * 10) / 10),
      mimeType: mime.lookup(ext) || 'video/mp4',
      isComplete: item.status === 'completed',
    };
  }
}
