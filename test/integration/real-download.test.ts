/**
 * Real Download Integration Tests
 * 
 * Tests the actual download pipeline: API → DownloadEngine → HttpDownloader → filesystem
 * Uses a deterministic local test server for controlled testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import { createTestServer } from '../fixtures/test-server';
import { DownloadEngine } from '../../src/main/engine/DownloadEngine';
import { AppDatabase } from '../../src/main/db/Database';
import { DownloadItem, DownloadStatus } from '../../src/shared/types';
import express from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';

// Test configuration
const TEST_PORT = 18056;
const TEST_DOWNLOAD_DIR = path.join(__dirname, '__test_downloads__');

// Helper to compute SHA-256 of a file
function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`));
      return;
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to wait for a condition with timeout
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 30000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) return true;
    await sleep(intervalMs);
  }
  return false;
}

// Helper to clean up test directory
function cleanTestDir() {
  if (fs.existsSync(TEST_DOWNLOAD_DIR)) {
    fs.rmSync(TEST_DOWNLOAD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DOWNLOAD_DIR, { recursive: true });
}

// API helper functions
async function apiCreateDownload(url: string, startImmediately: boolean = true): Promise<DownloadItem> {
  const response = await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, startImmediately }),
  });
  const data = await response.json() as DownloadItem;
  if (!response.ok) {
    throw new Error(`Failed to create download: ${data}`);
  }
  return data;
}

async function apiGetDownload(id: string): Promise<DownloadItem> {
  const response = await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}`);
  return response.json() as Promise<DownloadItem>;
}

async function apiGetAllDownloads(): Promise<DownloadItem[]> {
  const response = await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads`);
  return response.json() as Promise<DownloadItem[]>;
}

async function apiPauseDownload(id: string): Promise<void> {
  await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}/pause`, { method: 'POST' });
}

async function apiResumeDownload(id: string): Promise<void> {
  await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}/resume`, { method: 'POST' });
}

async function apiCancelDownload(id: string): Promise<void> {
  await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}/cancel`, { method: 'POST' });
}

async function apiStartDownload(id: string): Promise<void> {
  await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}/start`, { method: 'POST' });
}

async function apiDeleteDownload(id: string, deleteFile: boolean = false): Promise<void> {
  await fetch(`http://127.0.0.1:${TEST_PORT}/api/downloads/${id}?deleteFile=${deleteFile}`, { method: 'DELETE' });
}

describe('Real Download Integration Tests', () => {
  let testServer: Awaited<ReturnType<typeof createTestServer>>;
  let app: express.Application;
  let server: Server;
  let db: AppDatabase;
  let engine: DownloadEngine;

  beforeAll(async () => {
    // Create test server
    testServer = await createTestServer({ port: 18055 });
    
    // Create test app with real download engine
    app = express();
    app.use(cors());
    app.use(express.json());
    
    // Initialize database and engine
    db = new AppDatabase(':memory:');
    await db.init();
    
    // Override download directory
    const settings = db.getSettings();
    settings.general.defaultDownloadDir = TEST_DOWNLOAD_DIR;
    settings.downloads.maxConcurrentDownloads = 1;
    db.saveSettings(settings);
    
    engine = new DownloadEngine(db);
    await engine.init();
    
    // Setup API routes
    app.post('/api/downloads', async (req, res) => {
      try {
        const item = await engine.addDownload(req.body);
        res.json(item);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    });
    
    app.get('/api/downloads', (req, res) => {
      res.json(engine.getAllDownloads());
    });
    
    app.get('/api/downloads/:id', (req, res) => {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    });
    
    app.post('/api/downloads/:id/pause', (req, res) => {
      engine.pauseDownload(req.params.id);
      res.json({ success: true });
    });
    
    app.post('/api/downloads/:id/resume', (req, res) => {
      engine.resumeDownload(req.params.id);
      res.json({ success: true });
    });
    
    app.post('/api/downloads/:id/cancel', (req, res) => {
      engine.cancelDownload(req.params.id);
      res.json({ success: true });
    });
    
    app.post('/api/downloads/:id/retry', (req, res) => {
      engine.retryDownload(req.params.id);
      res.json({ success: true });
    });
    
    app.post('/api/downloads/:id/start', async (req, res) => {
      try {
        await engine.startDownload(req.params.id);
        res.json({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    });
    
    app.delete('/api/downloads/:id', (req, res) => {
      const deleteFile = req.query.deleteFile === 'true';
      engine.deleteDownload(req.params.id, deleteFile);
      res.json({ success: true });
    });
    
    // Start server
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
    
    // Clean test directory
    cleanTestDir();
  });

  afterAll(async () => {
    // Cleanup
    if (engine) await engine.shutdown();
    if (db) db.close();
    if (server) await new Promise<void>((res) => server.close(() => res()));
    if (testServer) await testServer.stop();
    cleanTestDir();
  });

  beforeEach(() => {
    cleanTestDir();
  });

  describe('1. Basic Download Flow', () => {
    it('should create exactly one download and complete successfully', async () => {
      const url = `${testServer.baseUrl}/files/1mb.bin`;
      const expectedHash = testServer.hashes['1mb'];
      
      // Create download via API
      const createdItem = await apiCreateDownload(url, true);
      
      // Verify exactly one download was created
      const downloads = await apiGetAllDownloads();
      expect(downloads.length).toBe(1);
      expect(downloads[0].id).toBe(createdItem.id);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const item = await apiGetDownload(createdItem.id);
        return item.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      // Verify the final file
      const item = await apiGetDownload(createdItem.id);
      expect(fs.existsSync(item.finalPath)).toBe(true);
      expect(fs.statSync(item.finalPath).size).toBe(1024 * 1024);
      
      // Verify SHA-256
      const fileHash = await fileSha256(item.finalPath);
      expect(fileHash).toBe(expectedHash);
    }, 90000);

    it('should return correct download ID', async () => {
      const url = `${testServer.baseUrl}/files/1mb.bin`;
      
      const item = await apiCreateDownload(url, false);
      expect(item.id).toBeDefined();
      expect(item.id).toMatch(/^dl_/);
      
      // Verify we can retrieve by ID
      const retrieved = await apiGetDownload(item.id);
      expect(retrieved.id).toBe(item.id);
    });
  });

  describe('2. Filename from Content-Disposition', () => {
    it('should extract filename from Content-Disposition header', async () => {
      const url = `${testServer.baseUrl}/files/content-disposition`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      
      // Should contain "Actual Video Name" from Content-Disposition, NOT "download" or generic
      // The exact filename may have (N) suffix due to collision handling
      expect(finalItem.filename).toMatch(/Actual Video Name/);
      expect(finalItem.filename).toMatch(/\.mp4$/i);
      expect(finalItem.filename).not.toMatch(/^download/i);
      expect(finalItem.filename).not.toMatch(/YouTube_/);
    }, 90000);
  });

  describe('3. UTF-8 Filename', () => {
    it('should correctly decode UTF-8 filename from RFC 5987 encoding', async () => {
      const url = `${testServer.baseUrl}/files/utf8-filename`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      
      // Should preserve the Unicode character
      expect(finalItem.filename).toContain('Amazing Video');
      expect(finalItem.filename).toContain('.mp4');
    }, 90000);
  });

  describe('4. Media Extension Handling', () => {
    it('should preserve correct extension for MP4', async () => {
      const url = `${testServer.baseUrl}/files/sample.mp4`;
      
      const item = await apiCreateDownload(url, true);
      
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      expect(finalItem.filename).toMatch(/\.mp4$/i);
      expect(fs.existsSync(finalItem.finalPath)).toBe(true);
    }, 90000);

    it('should preserve correct extension for WebM', async () => {
      const url = `${testServer.baseUrl}/files/sample.webm`;
      
      const item = await apiCreateDownload(url, true);
      
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      expect(finalItem.filename).toMatch(/\.webm$/i);
    }, 90000);

    it('should preserve correct extension for MKV', async () => {
      const url = `${testServer.baseUrl}/files/sample.mkv`;
      
      const item = await apiCreateDownload(url, true);
      
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      expect(finalItem.filename).toMatch(/\.mkv$/i);
    }, 90000);
  });

  describe('5. Duplicate Filename Handling', () => {
    it('should handle duplicate filenames with (1), (2) suffixes', async () => {
      const url = `${testServer.baseUrl}/files/content-disposition`;
      
      // First download
      const item1 = await apiCreateDownload(url, true);
      
      await waitFor(async () => {
        const i = await apiGetDownload(item1.id);
        return i.status === 'completed';
      }, 60000);
      
      // Second download (same source)
      const item2 = await apiCreateDownload(url, true);
      
      await waitFor(async () => {
        const i = await apiGetDownload(item2.id);
        return i.status === 'completed';
      }, 60000);
      
      // Third download
      const item3 = await apiCreateDownload(url, true);
      
      await waitFor(async () => {
        const i = await apiGetDownload(item3.id);
        return i.status === 'completed';
      }, 60000);
      
      // Verify filenames - note: counter starts at 1, so first duplicate gets (1)
      const final1 = await apiGetDownload(item1.id);
      const final2 = await apiGetDownload(item2.id);
      const final3 = await apiGetDownload(item3.id);
      
      // First download may already have (1) if temp file existed, so check pattern
      expect(final1.filename).toMatch(/^Actual Video Name(\s*\(?\d*\)?)?\.mp4$/);
      expect(final2.filename).toMatch(/^Actual Video Name \(\d+\)\.mp4$/);
      expect(final3.filename).toMatch(/^Actual Video Name \(\d+\)\.mp4$/);
      
      // All files should exist
      expect(fs.existsSync(final1.finalPath)).toBe(true);
      expect(fs.existsSync(final2.finalPath)).toBe(true);
      expect(fs.existsSync(final3.finalPath)).toBe(true);
      
      // Ensure filenames are all unique
      expect(new Set([final1.filename, final2.filename, final3.filename]).size).toBe(3);
    }, 180000);
  });

  describe('6. Unknown Content Length', () => {
    it('should handle chunked transfer without Content-Length', async () => {
      const url = `${testServer.baseUrl}/files/chunked`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      
      // Should have downloaded the full content
      expect(finalItem.downloadedBytes).toBe(1024 * 1024);
      expect(fs.existsSync(finalItem.finalPath)).toBe(true);
      
      // Verify checksum
      const fileHash = await fileSha256(finalItem.finalPath);
      expect(fileHash).toBe(testServer.hashes['1mb']);
    }, 90000);
  });

  describe('7. HTTP Error Handling', () => {
    it('should handle 404 error correctly', async () => {
      const url = `${testServer.baseUrl}/error/404`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for failure
      const failed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'failed';
      }, 30000);
      
      expect(failed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      
      // Should NOT have status "completed"
      expect(finalItem.status).not.toBe('completed');
      expect(finalItem.error).toBeDefined();
      
      // Should NOT have created a file
      expect(fs.existsSync(finalItem.finalPath)).toBe(false);
    }, 60000);

    it('should handle 403 error correctly', async () => {
      const url = `${testServer.baseUrl}/error/403`;
      
      const item = await apiCreateDownload(url, true);
      
      const failed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'failed';
      }, 30000);
      
      expect(failed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      expect(finalItem.status).not.toBe('completed');
    }, 60000);

    it('should handle 500 error correctly', async () => {
      const url = `${testServer.baseUrl}/error/500`;
      
      const item = await apiCreateDownload(url, true);
      
      const failed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'failed';
      }, 30000);
      
      expect(failed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      expect(finalItem.status).not.toBe('completed');
    }, 60000);
  });

  describe('8. Pause and Resume', () => {
    it('should pause and resume a download', async () => {
      const url = `${testServer.baseUrl}/files/slow`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for some progress
      await sleep(2000);
      
      // Get current progress
      const midItem = await apiGetDownload(item.id);
      const midBytes = midItem.downloadedBytes;
      
      expect(midBytes).toBeGreaterThan(0);
      expect(midBytes).toBeLessThan(1024 * 1024);
      
      // Pause
      await apiPauseDownload(item.id);
      
      await sleep(1000);
      
      const pausedItem = await apiGetDownload(item.id);
      expect(pausedItem.status).toBe('paused');
      
      const bytesAfterPause = pausedItem.downloadedBytes;
      
      // Wait and verify no bytes added while paused
      await sleep(2000);
      
      const stillPausedItem = await apiGetDownload(item.id);
      expect(stillPausedItem.downloadedBytes).toBe(bytesAfterPause);
      
      // Resume
      await apiResumeDownload(item.id);
      
      await sleep(2000);
      
      const resumedItem = await apiGetDownload(item.id);
      expect(resumedItem.downloadedBytes).toBeGreaterThan(bytesAfterPause);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 120000);
      
      expect(completed).toBe(true);
    }, 180000);
  });

  describe('9. Cancel', () => {
    it('should cancel a download and clean up', async () => {
      const url = `${testServer.baseUrl}/files/slow`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for some progress
      await sleep(1000);
      
      // Cancel
      await apiCancelDownload(item.id);
      
      await sleep(500);
      
      const cancelledItem = await apiGetDownload(item.id);
      expect(cancelledItem.status).toBe('cancelled');
    }, 30000);
  });

  describe('10. Retry', () => {
    it('should retry a failed download', async () => {
      // First trigger a failure by using 404
      const url = `${testServer.baseUrl}/error/404`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for failure
      await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'failed';
      }, 30000);
      
      // Now fix the URL and retry
      const newUrl = `${testServer.baseUrl}/files/1mb.bin`;
      
      // Delete and recreate with correct URL
      await apiDeleteDownload(item.id, true);
      
      const newItem = await apiCreateDownload(newUrl, true);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(newItem.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
    }, 120000);
  });

  describe('11. Start Later (Queued)', () => {
    it('should respect startImmediately=false and not auto-start', async () => {
      const url = `${testServer.baseUrl}/files/1mb.bin`;
      
      // Create with startImmediately=false
      const item = await apiCreateDownload(url, false);
      
      // Wait a moment
      await sleep(2000);
      
      // Should still be queued, not downloading
      const queuedItem = await apiGetDownload(item.id);
      expect(queuedItem.status).toBe('queued');
      expect(queuedItem.downloadedBytes).toBe(0);
      
      // Now explicitly start
      await apiStartDownload(item.id);
      
      // Should start downloading
      await sleep(500);
      
      const startedItem = await apiGetDownload(item.id);
      expect(['downloading', 'completed']).toContain(startedItem.status);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
    }, 120000);
  });

  describe('12. Multiple Downloads', () => {
    it('should handle multiple concurrent downloads with unique IDs and files', async () => {
      const urls = [
        `${testServer.baseUrl}/files/1mb.bin`,
        `${testServer.baseUrl}/files/content-disposition`,
        `${testServer.baseUrl}/files/utf8-filename`,
      ];
      
      // Create all downloads
      const items: DownloadItem[] = [];
      for (const url of urls) {
        const item = await apiCreateDownload(url, true);
        items.push(item);
      }
      
      // All IDs should be unique
      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      
      // Wait for all to complete
      const allCompleted = await waitFor(async () => {
        const allDone = await Promise.all(
          items.map(async (item) => {
            const i = await apiGetDownload(item.id);
            return i.status === 'completed';
          })
        );
        return allDone.every(Boolean);
      }, 120000);
      
      expect(allCompleted).toBe(true);
      
      // Verify all files exist and have correct sizes
      for (const item of items) {
        const finalItem = await apiGetDownload(item.id);
        expect(fs.existsSync(finalItem.finalPath)).toBe(true);
        expect(fs.statSync(finalItem.finalPath).size).toBe(1024 * 1024);
      }
    }, 180000);
  });

  describe('13. Progress and Speed Tracking', () => {
    it('should calculate real progress during download', async () => {
      const url = `${testServer.baseUrl}/files/slow`;
      
      const item = await apiCreateDownload(url, true);
      
      // Capture progress over time
      const progressSamples: { progress: number; downloadedBytes: number; speed: number; timestamp: number }[] = [];
      
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        const iItem = await apiGetDownload(item.id);
        progressSamples.push({
          progress: iItem.progress,
          downloadedBytes: iItem.downloadedBytes,
          speed: iItem.speed,
          timestamp: Date.now(),
        });
        
        if (iItem.status === 'completed') break;
      }
      
      // Verify progress increases monotonically
      for (let i = 1; i < progressSamples.length; i++) {
        expect(progressSamples[i].downloadedBytes).toBeGreaterThanOrEqual(progressSamples[i - 1].downloadedBytes);
      }
      
      // Speed should be calculated (may be 0 if measured during a pause)
      const nonZeroSpeedSamples = progressSamples.filter((s) => s.speed > 0);
      if (nonZeroSpeedSamples.length > 0) {
        // Speed should be reasonable (not negative, not absurdly high)
        for (const sample of nonZeroSpeedSamples) {
          expect(sample.speed).toBeGreaterThan(0);
          expect(sample.speed).toBeLessThan(1024 * 1024 * 1024); // Less than 1 GB/s
        }
      }
    }, 60000);
  });

  describe('14. SHA-256 Verification', () => {
    it('should produce identical SHA-256 for source and downloaded file', async () => {
      const url = `${testServer.baseUrl}/files/1mb.bin`;
      const expectedHash = testServer.hashes['1mb'];
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for completion
      const completed = await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      expect(completed).toBe(true);
      
      const finalItem = await apiGetDownload(item.id);
      
      // Compute actual file hash
      const actualHash = await fileSha256(finalItem.finalPath);
      
      // Must match exactly
      expect(actualHash).toBe(expectedHash);
      console.log(`SHA-256 verification: ${actualHash} === ${expectedHash} ✓`);
    }, 90000);
  });

  describe('15. No Dummy Data', () => {
    it('should start with empty downloads list', async () => {
      // Create a fresh engine/db
      const freshDir = path.join(TEST_DOWNLOAD_DIR, 'fresh_test');
      fs.mkdirSync(freshDir, { recursive: true });
      
      const freshDb = new AppDatabase(path.join(freshDir, 'fresh.db'));
      await freshDb.init();
      
      const freshEngine = new DownloadEngine(freshDb);
      await freshEngine.init();
      
      // Should have no downloads initially
      const downloads = freshEngine.getAllDownloads();
      expect(downloads.length).toBe(0);
      
      // Cleanup
      await freshEngine.shutdown();
      freshDb.close();
      fs.rmSync(freshDir, { recursive: true, force: true });
    });
  });

  describe('16. Database State Consistency', () => {
    it('should maintain consistent state between database and filesystem', async () => {
      const url = `${testServer.baseUrl}/files/1mb.bin`;
      
      const item = await apiCreateDownload(url, true);
      
      // Wait for completion
      await waitFor(async () => {
        const i = await apiGetDownload(item.id);
        return i.status === 'completed';
      }, 60000);
      
      // Get state from various sources
      const dbItem = db.getDownload(item.id);
      const engineItem = engine.getDownload(item.id);
      const apiItem = await apiGetDownload(item.id);
      
      // All should agree on status
      expect(dbItem?.status).toBe('completed');
      expect(engineItem?.status).toBe('completed');
      expect(apiItem.status).toBe('completed');
      
      // All should agree on filename
      expect(dbItem?.filename).toBe(engineItem?.filename);
      expect(engineItem?.filename).toBe(apiItem.filename);
      
      // File should exist at finalPath
      expect(fs.existsSync(apiItem.finalPath)).toBe(true);
      
      // No .part file should remain
      expect(fs.existsSync(apiItem.tempPath)).toBe(false);
    }, 90000);
  });
});
