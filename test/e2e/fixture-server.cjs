const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function buildPattern(size, multiplier, offset) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = (i * multiplier + offset) % 256;
  }
  return buffer;
}

const BUFFERS = {
  '1mb': buildPattern(1024 * 1024, 1, 0),
  '5mb': buildPattern(5 * 1024 * 1024, 7, 13),
  '10mb': buildPattern(10 * 1024 * 1024, 3, 7),
};

const HASHES = Object.fromEntries(
  Object.entries(BUFFERS).map(([key, value]) => [key, crypto.createHash('sha256').update(value).digest('hex')])
);

// Load real media fixtures from filesystem
const MEDIA_FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'media');
let mediaFixtures = {};

try {
  if (fs.existsSync(MEDIA_FIXTURES_DIR)) {
    const files = fs.readdirSync(MEDIA_FIXTURES_DIR);
    for (const file of files) {
      const filePath = path.join(MEDIA_FIXTURES_DIR, file);
      if (fs.statSync(filePath).isFile() && !file.endsWith('.json')) {
        const data = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        mediaFixtures[file] = {
          data,
          hash,
          size: data.length,
          contentType: getContentType(file)
        };
        HASHES[file] = hash;
      }
    }
    console.log(`Loaded ${Object.keys(mediaFixtures).length} media fixtures from ${MEDIA_FIXTURES_DIR}`);
  }
} catch (err) {
  console.warn('Could not load media fixtures:', err.message);
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return types[ext] || 'application/octet-stream';
}

function parseRange(rangeHeader, totalSize) {
  if (!rangeHeader) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  const match = String(rangeHeader).match(/bytes=(\d+)-(\d*)/i);
  if (!match) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? Math.min(end, totalSize - 1) : totalSize - 1,
    partial: true,
  };
}

function sendBuffer(req, res, buffer, options = {}) {
  const {
    contentType = 'application/octet-stream',
    filename,
    slowMs = 0,
    chunkSize = 32 * 1024,
    failAfterBytes = null,
    utf8Filename = false,
  } = options;

  const { start, end, partial } = parseRange(req.headers.range, buffer.length);
  const totalLength = end - start + 1;

  const headers = {
    'Content-Type': contentType,
    'Content-Length': totalLength,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  if (filename) {
    headers['Content-Disposition'] = utf8Filename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      : `attachment; filename="${filename}"`;
  }

  if (partial) {
    headers['Content-Range'] = `bytes ${start}-${end}/${buffer.length}`;
  }

  res.writeHead(partial ? 206 : 200, headers);

  let cursor = start;
  let bytesSent = 0;

  const writeChunk = () => {
    if (cursor > end) {
      res.end();
      return;
    }

    if (typeof failAfterBytes === 'number' && bytesSent >= failAfterBytes) {
      res.destroy(new Error('E2E forced network drop'));
      return;
    }

    const nextEnd = Math.min(cursor + chunkSize, end + 1);
    const chunk = buffer.slice(cursor, nextEnd);
    cursor = nextEnd;
    bytesSent += chunk.length;

    res.write(chunk, () => {
      if (slowMs > 0) {
        setTimeout(writeChunk, slowMs);
      } else {
        setImmediate(writeChunk);
      }
    });
  };

  writeChunk();
}

async function startFixtureServer({ port = 18055 } = {}) {
  const attempts = new Map();

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.searchParams;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const isProbeRequest = req.headers.range === 'bytes=0-0';

    if (pathname === '/files/1mb.bin') {
      sendBuffer(req, res, BUFFERS['1mb']);
      return;
    }

    if (pathname === '/files/5mb.bin') {
      sendBuffer(req, res, BUFFERS['5mb']);
      return;
    }

    if (pathname === '/files/10mb.bin') {
      sendBuffer(req, res, BUFFERS['10mb']);
      return;
    }

    if (pathname === '/files/idm-video.mp4') {
      sendBuffer(req, res, BUFFERS['5mb'], {
        contentType: 'video/mp4',
        filename: 'Actual Video Title.mp4',
        slowMs: isProbeRequest ? 0 : 80,
        chunkSize: 32 * 1024,
      });
      return;
    }

    if (pathname === '/files/direct-video.mp4') {
      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/mp4',
      });
      return;
    }

    if (pathname === '/files/slow-media') {
      const profile = query.get('profile') || '5mb';
      const name = query.get('name') || 'Slow Fixture.bin';
      const mime = query.get('mime') || 'application/octet-stream';
      const delay = Number.parseInt(query.get('delayMs') || '70', 10);
      sendBuffer(req, res, BUFFERS[profile] || BUFFERS['5mb'], {
        contentType: mime,
        filename: name,
        slowMs: isProbeRequest ? 0 : delay,
        chunkSize: 32 * 1024,
      });
      return;
    }

    if (pathname === '/files/content-disposition') {
      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/mp4',
        filename: 'Actual Video Name.mp4',
      });
      return;
    }

    if (pathname === '/files/utf8-filename') {
      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/mp4',
        filename: 'Amazing Video ✓.mp4',
        utf8Filename: true,
      });
      return;
    }

    if (pathname === '/files/sample.webm') {
      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/webm',
        filename: 'Amazing Footage.webm',
      });
      return;
    }

    if (pathname === '/files/sample.mkv') {
      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/x-matroska',
        filename: 'Epic Movie.mkv',
      });
      return;
    }

    // Real media fixtures
    if (pathname === '/files/media/test-video.mp4') {
      if (mediaFixtures['test-video.mp4']) {
        sendBuffer(req, res, mediaFixtures['test-video.mp4'].data, {
          contentType: mediaFixtures['test-video.mp4'].contentType,
          filename: 'Test Video.mp4',
          slowMs: isProbeRequest ? 0 : 0,
        });
        return;
      }
    }

    if (pathname === '/files/media/test-video.webm') {
      if (mediaFixtures['test-video.webm']) {
        sendBuffer(req, res, mediaFixtures['test-video.webm'].data, {
          contentType: mediaFixtures['test-video.webm'].contentType,
          filename: 'Test Video.webm',
          slowMs: isProbeRequest ? 0 : 0,
        });
        return;
      }
    }

    if (pathname === '/files/media/invalid-video.mp4') {
      if (mediaFixtures['invalid-video.mp4']) {
        sendBuffer(req, res, mediaFixtures['invalid-video.mp4'].data, {
          contentType: mediaFixtures['invalid-video.mp4'].contentType,
          filename: 'Invalid Video.mp4',
          slowMs: isProbeRequest ? 0 : 0,
        });
        return;
      }
    }

    if (pathname === '/files/flaky-retry.mp4') {
      if (isProbeRequest) {
        sendBuffer(req, res, BUFFERS['1mb'], {
          contentType: 'video/mp4',
          filename: 'Retryable Demo Clip.mp4',
        });
        return;
      }

      const attempt = (attempts.get(pathname) || 0) + 1;
      attempts.set(pathname, attempt);

      if (attempt === 1) {
        sendBuffer(req, res, BUFFERS['1mb'], {
          contentType: 'video/mp4',
          filename: 'Retryable Demo Clip.mp4',
          slowMs: 25,
          chunkSize: 16 * 1024,
          failAfterBytes: 64 * 1024,
        });
        return;
      }

      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/mp4',
        filename: 'Retryable Demo Clip.mp4',
        slowMs: 20,
        chunkSize: 32 * 1024,
      });
      return;
    }

    if (pathname === '/files/network-drop.mp4') {
      if (isProbeRequest) {
        sendBuffer(req, res, BUFFERS['1mb'], {
          contentType: 'video/mp4',
          filename: 'Network Drop Demo.mp4',
        });
        return;
      }

      sendBuffer(req, res, BUFFERS['1mb'], {
        contentType: 'video/mp4',
        filename: 'Network Drop Demo.mp4',
        slowMs: 25,
        chunkSize: 16 * 1024,
        failAfterBytes: 64 * 1024,
      });
      return;
    }

    if (pathname === '/files/chunked') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
      });
      let cursor = 0;
      const chunkSize = 64 * 1024;
      const writeChunk = () => {
        if (cursor >= BUFFERS['1mb'].length) {
          res.end();
          return;
        }
        const nextEnd = Math.min(cursor + chunkSize, BUFFERS['1mb'].length);
        const chunk = BUFFERS['1mb'].slice(cursor, nextEnd);
        cursor = nextEnd;
        res.write(chunk, () => setImmediate(writeChunk));
      };
      writeChunk();
      return;
    }

    if (pathname === '/page/video') {
      const directUrl = `http://127.0.0.1:${port}/files/direct-video.mp4`;
      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Detector Preview Demo</title>
  </head>
  <body>
    <h1>Detector Preview Demo</h1>
    <video controls preload="metadata" src="${directUrl}"></video>
  </body>
</html>`;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      });
      res.end(html);
      return;
    }

    if (pathname === '/error/403') {
      const body = '<html><body><h1>403 Forbidden</h1></body></html>';
      res.writeHead(403, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    if (pathname === '/error/404') {
      const body = '<html><body><h1>404 Not Found</h1></body></html>';
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    if (pathname === '/error/500') {
      const body = JSON.stringify({ error: 'Internal Server Error' });
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    if (pathname === '/health') {
      const body = JSON.stringify({
        status: 'ok',
        baseUrl: `http://127.0.0.1:${port}`,
        hashes: HASHES,
        mediaFixtures: Object.keys(mediaFixtures).length > 0 ? {
          available: true,
          files: Object.keys(mediaFixtures).map(f => ({
            name: f,
            size: mediaFixtures[f].size,
            hash: mediaFixtures[f].hash
          }))
        } : { available: false },
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    hashes: HASHES,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = {
  BUFFERS,
  HASHES,
  startFixtureServer,
};
