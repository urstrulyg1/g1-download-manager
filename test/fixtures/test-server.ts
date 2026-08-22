/**
 * Local HTTP Test Server for Integration Testing
 * 
 * Provides controlled test endpoints for verifying the download pipeline:
 * - Basic file download
 * - Content-Disposition filename
 * - UTF-8 filename (RFC 5987)
 * - Unknown content length (chunked transfer)
 * - Slow transfer for progress observation
 * - HTTP errors (403, 404, 500)
 * - Range support for pause/resume
 */

import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Deterministic test content - generate once, hash is fixed
const DETERMINISTIC_1MB = crypto.createHash('sha256')
  .update('G1DM_TEST_FILE_1MB_' + 'x'.repeat(1024 * 1024 - 18))
  .digest();

const DETERMINISTIC_1MB_PATTERN = Buffer.alloc(1024 * 1024);
for (let i = 0; i < DETERMINISTIC_1MB_PATTERN.length; i++) {
  DETERMINISTIC_1MB_PATTERN[i] = i % 256;
}

const DETERMINISTIC_1MB_HASH = crypto.createHash('sha256').update(DETERMINISTIC_1MB_PATTERN).digest('hex');
const DETERMINISTIC_5MB_PATTERN = Buffer.alloc(5 * 1024 * 1024);
for (let i = 0; i < DETERMINISTIC_5MB_PATTERN.length; i++) {
  DETERMINISTIC_5MB_PATTERN[i] = (i * 7 + 13) % 256;
}
const DETERMINISTIC_5MB_HASH = crypto.createHash('sha256').update(DETERMINISTIC_5MB_PATTERN).digest('hex');
const DETERMINISTIC_10MB_PATTERN = Buffer.alloc(10 * 1024 * 1024);
for (let i = 0; i < DETERMINISTIC_10MB_PATTERN.length; i++) {
  DETERMINISTIC_10MB_PATTERN[i] = (i * 3 + 7) % 256;
}
const DETERMINISTIC_10MB_HASH = crypto.createHash('sha256').update(DETERMINISTIC_10MB_PATTERN).digest('hex');

interface TestServerOptions {
  port?: number;
  slowTransferDelay?: number;
}

export interface TestServerInfo {
  port: number;
  baseUrl: string;
  hashes: {
    '1mb': string;
    '5mb': string;
    '10mb': string;
  };
  stop: () => Promise<void>;
}

export async function createTestServer(options: TestServerOptions = {}): Promise<TestServerInfo> {
  const port = options.port || 18055;
  const slowDelay = options.slowTransferDelay || 50; // ms per chunk for slow transfer

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // === ENDPOINT A: Basic file (1MB deterministic) ===
    if (pathname === '/files/1mb.bin' || pathname === '/files/basic.bin') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    // === ENDPOINT A2: 5MB deterministic ===
    if (pathname === '/files/5mb.bin') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': DETERMINISTIC_5MB_PATTERN.length,
      });
      res.end(DETERMINISTIC_5MB_PATTERN);
      return;
    }

    // === ENDPOINT A3: 10MB deterministic ===
    if (pathname === '/files/10mb.bin') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': DETERMINISTIC_10MB_PATTERN.length,
      });
      res.end(DETERMINISTIC_10MB_PATTERN);
      return;
    }

    // === ENDPOINT B: Content-Disposition with filename ===
    if (pathname === '/files/content-disposition') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Content-Disposition': 'attachment; filename="Actual Video Name.mp4"',
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    // === ENDPOINT C: UTF-8 filename (RFC 5987) ===
    if (pathname === '/files/utf8-filename') {
      const utf8Filename = 'Amazing Video ✓.mp4';
      const encodedFilename = encodeURIComponent(utf8Filename);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    // === ENDPOINT D: Unknown content length (chunked transfer encoding) ===
    if (pathname === '/files/chunked') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
      });
      
      const chunkSize = 64 * 1024; // 64KB chunks
      const totalChunks = Math.ceil(DETERMINISTIC_1MB_PATTERN.length / chunkSize);
      let currentChunk = 0;
      
      const writeChunk = () => {
        if (currentChunk >= totalChunks) {
          res.end();
          return;
        }
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, DETERMINISTIC_1MB_PATTERN.length);
        const chunk = DETERMINISTIC_1MB_PATTERN.slice(start, end);
        
        res.write(chunk, () => {
          currentChunk++;
          setImmediate(writeChunk);
        });
      };
      
      writeChunk();
      return;
    }

    // === ENDPOINT E: Slow transfer ===
    if (pathname === '/files/slow') {
      const rangeHeader = req.headers['range'];
      let startByte = 0;
      let endByte = DETERMINISTIC_1MB_PATTERN.length - 1;
      
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (rangeMatch) {
          startByte = parseInt(rangeMatch[1], 10);
          endByte = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : DETERMINISTIC_1MB_PATTERN.length - 1;
        }
      }
      
      res.writeHead(rangeHeader ? 206 : 200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': endByte - startByte + 1,
        'Accept-Ranges': 'bytes',
        ...(rangeHeader ? {
          'Content-Range': `bytes ${startByte}-${endByte}/${DETERMINISTIC_1MB_PATTERN.length}`,
        } : {}),
      });
      
      let currentByte = startByte;
      const sendSlowChunk = () => {
        if (currentByte > endByte) {
          res.end();
          return;
        }
        const chunkSize = Math.min(4 * 1024, endByte - currentByte + 1); // 4KB chunks
        const chunk = DETERMINISTIC_1MB_PATTERN.slice(currentByte, currentByte + chunkSize);
        res.write(chunk, () => {
          currentByte += chunkSize;
          setTimeout(sendSlowChunk, slowDelay);
        });
      };
      
      sendSlowChunk();
      return;
    }

    // === ENDPOINT F: HTTP errors ===
    if (pathname === '/error/403') {
      res.writeHead(403, {
        'Content-Type': 'text/html',
        'Content-Length': Buffer.byteLength('<html><body><h1>403 Forbidden</h1></body></html>'),
      });
      res.end('<html><body><h1>403 Forbidden</h1></body></html>');
      return;
    }

    if (pathname === '/error/404') {
      res.writeHead(404, {
        'Content-Type': 'text/html',
        'Content-Length': Buffer.byteLength('<html><body><h1>404 Not Found</h1></body></html>'),
      });
      res.end('<html><body><h1>404 Not Found</h1></body></html>');
      return;
    }

    if (pathname === '/error/500') {
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength('{"error":"Internal Server Error"}'),
      });
      res.end('{"error":"Internal Server Error"}');
      return;
    }

    // === ENDPOINT G: Range support (for pause/resume) ===
    if (pathname === '/files/resumable') {
      const rangeHeader = req.headers['range'];
      
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (rangeMatch) {
          const startByte = parseInt(rangeMatch[1], 10);
          const endByte = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : DETERMINISTIC_1MB_PATTERN.length - 1;
          
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': endByte - startByte + 1,
            'Content-Range': `bytes ${startByte}-${endByte}/${DETERMINISTIC_1MB_PATTERN.length}`,
            'Accept-Ranges': 'bytes',
          });
          res.end(DETERMINISTIC_1MB_PATTERN.slice(startByte, endByte + 1));
          return;
        }
      }
      
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Accept-Ranges': 'bytes',
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    // === Media container endpoints (MP4, WebM, MKV) ===
    if (pathname === '/files/sample.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Content-Disposition': 'attachment; filename="Nature Documentary.mp4"',
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    if (pathname === '/files/sample.webm') {
      res.writeHead(200, {
        'Content-Type': 'video/webm',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Content-Disposition': 'attachment; filename="Amazing Footage.webm"',
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    if (pathname === '/files/sample.mkv') {
      res.writeHead(200, {
        'Content-Type': 'video/x-matroska',
        'Content-Length': DETERMINISTIC_1MB_PATTERN.length,
        'Content-Disposition': 'attachment; filename="Epic Movie.mkv"',
      });
      res.end(DETERMINISTIC_1MB_PATTERN);
      return;
    }

    // Health check endpoint
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', hashes: { '1mb': DETERMINISTIC_1MB_HASH, '5mb': DETERMINISTIC_5MB_HASH, '10mb': DETERMINISTIC_10MB_HASH } }));
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        hashes: {
          '1mb': DETERMINISTIC_1MB_HASH,
          '5mb': DETERMINISTIC_5MB_HASH,
          '10mb': DETERMINISTIC_10MB_HASH,
        },
        stop: async () => {
          return new Promise((res) => server.close(() => res()));
        },
      });
    });
  });
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function verifySha256(filePath: string, expectedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const fileHash = hash.digest('hex');
      resolve(fileHash === expectedHash);
    });
    stream.on('error', reject);
  });
}
