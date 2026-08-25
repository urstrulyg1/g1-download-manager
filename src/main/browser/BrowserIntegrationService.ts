import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

export class BrowserIntegrationService {
  public static generatePngBuffer(width: number, height: number): Buffer {
    const rawData: number[] = [];
    for (let y = 0; y < height; y++) {
      rawData.push(0); // filter 0
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        let isArrow = false;
        if (nx >= 0.42 && nx <= 0.58 && ny >= 0.22 && ny <= 0.52) isArrow = true;
        else if (ny >= 0.52 && ny <= 0.72) {
          const progress = (ny - 0.52) / 0.20;
          const halfW = 0.28 * (1 - progress);
          if (nx >= 0.5 - halfW && nx <= 0.5 + halfW) isArrow = true;
        } else if (ny >= 0.75 && ny <= 0.82 && nx >= 0.25 && nx <= 0.75) isArrow = true;

        if (isArrow) {
          rawData.push(255, 255, 255, 255);
        } else {
          rawData.push(30, 80, 200, 255);
        }
      }
    }

    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
    function crc32(buf: Buffer): number {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    }

    function makeChunk(type: string, data: Buffer): Buffer {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crcVal = crc32(Buffer.concat([typeBuf, data]));
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crcVal, 0);
      return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    }

    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
      header,
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', compressed),
      makeChunk('IEND', Buffer.alloc(0)),
    ]);
  }

  public static ensureExtensionFiles(): void {
    const extensionDir = path.join(process.cwd(), 'resources', 'browser-extension');
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
    }

    // Ensure icons in resources/browser-extension and resources/extensions/chrome
    const targetIconDirs = [
      path.join(extensionDir, 'icons'),
      extensionDir,
      path.join(process.cwd(), 'resources', 'extensions', 'chrome', 'icons'),
      path.join(process.cwd(), 'resources', 'extensions', 'firefox', 'icons'),
      path.join(process.cwd(), 'resources', 'extensions', 'safari', 'icons'),
    ];

    for (const dir of targetIconDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      for (const size of [16, 32, 48, 128]) {
        const iconPath = path.join(dir, `icon${size}.png`);
        if (!fs.existsSync(iconPath)) {
          const pngBuf = this.generatePngBuffer(size, size);
          fs.writeFileSync(iconPath, pngBuf);
        }
      }
    }

    // Write manifest.json for resources/browser-extension
    const manifest = {
      manifest_version: 3,
      name: 'G1DM — Internet Download Manager Integration',
      version: '1.0.0',
      description: 'Official companion extension for G1DM Next-Generation Download Manager',
      permissions: ['contextMenus', 'storage', 'activeTab'],
      host_permissions: ['<all_urls>'],
      background: {
        service_worker: 'background.js',
      },
      action: {
        default_popup: 'popup.html',
        default_title: 'G1DM Download Manager',
        default_icon: {
          '16': 'icons/icon16.png',
          '32': 'icons/icon32.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
      },
      icons: {
        '16': 'icons/icon16.png',
        '32': 'icons/icon32.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    };

    fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Ensure icons exist in extensionDir/icons and extensionDir
    const iconsDir = path.join(extensionDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }
    this.writeIcons(iconsDir);
    this.writeIcons(extensionDir);

    // Write background.js
    const backgroundJs = `
// G1DM Browser Companion Extension Background Service Worker
const G1DM_API_PORT = 8055;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "g1dm-download-link",
    title: "Download with G1DM",
    contexts: ["link", "image", "video", "audio"]
  });

  chrome.contextMenus.create({
    id: "g1dm-download-page",
    title: "Download all links on this page with G1DM",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "g1dm-download-link") {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      sendToG1DM(targetUrl);
    }
  } else if (info.menuItemId === "g1dm-download-page") {
    if (tab && tab.url) {
      chrome.tabs.create({ url: "http://127.0.0.1:8055/#batch?url=" + encodeURIComponent(tab.url) });
    }
  }
});

// This companion never invokes browser download APIs. It only submits URLs
// to G1DM; the core DownloadEngine performs the transfer.

async function sendToG1DM(url, filename) {
  try {
    const payload = { url, startImmediately: true };
    if (filename) payload.filename = filename;
    const res = await fetch(\`http://127.0.0.1:\${G1DM_API_PORT}/api/downloads\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.log('Successfully enqueued to G1DM:', json);
  } catch (err) {
    console.warn('G1DM server not reachable:', err);
  }
}
`;
    fs.writeFileSync(path.join(extensionDir, 'background.js'), backgroundJs);

    // Write popup.html
    const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 320px; margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
    h2 { margin: 0 0 12px 0; font-size: 16px; color: #3b82f6; display: flex; align-items: center; gap: 8px; }
    .status { font-size: 12px; color: #94a3b8; margin-bottom: 16px; }
    button { width: 100%; padding: 8px 12px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-size: 13px; }
  </style>
</head>
<body>
  <h2>⚡ G1DM Companion</h2>
  <div class="status">Connected to G1DM Core Engine</div>
  <div class="toggle-row">
    <span>Automatic Interception</span>
    <input type="checkbox" id="interceptToggle" checked>
  </div>
  <button id="openApp">Open Download Manager</button>
  <script>
    document.getElementById('openApp').addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://127.0.0.1:8055' });
    });
  </script>
</body>
</html>`;
    fs.writeFileSync(path.join(extensionDir, 'popup.html'), popupHtml);
  }

  public static writeIcons(targetDir: string): void {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const sizes = [16, 32, 48, 128];
    for (const size of sizes) {
      const pngBuffer = this.generatePng(size);
      const filePath = path.join(targetDir, `icon${size}.png`);
      fs.writeFileSync(filePath, pngBuffer);
    }
  }

  private static generatePng(size: number): Buffer {
    const s = 4;
    const W = size * s;
    const H = size * s;
    const rCorner = W * 0.22;

    const boltPoly = [
      [0.54, 0.15],
      [0.30, 0.52],
      [0.48, 0.52],
      [0.42, 0.85],
      [0.72, 0.45],
      [0.54, 0.45],
      [0.62, 0.15]
    ];

    function pointInPolygon(px: number, py: number, poly: number[][]): boolean {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function sdRoundedBox(px: number, py: number, w: number, h: number, r: number): number {
      const dx = Math.abs(px - w / 2) - (w / 2 - r);
      const dy = Math.abs(py - h / 2) - (h / 2 - r);
      const outside = Math.sqrt(Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2) - r;
      const inside = Math.min(Math.max(dx, dy), 0) - r;
      return (dx > 0 || dy > 0) ? outside : inside;
    }

    const hrPixels = new Uint8Array(W * H * 4);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const dBox = sdRoundedBox(x + 0.5, y + 0.5, W, H, rCorner);

        if (dBox > 0) {
          hrPixels[idx] = 0;
          hrPixels[idx + 1] = 0;
          hrPixels[idx + 2] = 0;
          hrPixels[idx + 3] = 0;
        } else {
          const t = (x + y) / (W + H);
          const bgR = Math.round(37 * (1 - t) + 6 * t);
          const bgG = Math.round(99 * (1 - t) + 182 * t);
          const bgB = Math.round(235 * (1 - t) + 212 * t);

          const nx = (x + 0.5) / W;
          const ny = (y + 0.5) / H;

          const isBolt = pointInPolygon(nx, ny, boltPoly);
          if (isBolt) {
            hrPixels[idx] = 255;
            hrPixels[idx + 1] = 255;
            hrPixels[idx + 2] = 255;
            hrPixels[idx + 3] = 255;
          } else {
            hrPixels[idx] = bgR;
            hrPixels[idx + 1] = bgG;
            hrPixels[idx + 2] = bgB;
            hrPixels[idx + 3] = 255;
          }
        }
      }
    }

    function crc32(buf: Buffer): number {
      let table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
      let crc = 0 ^ (-1);
      for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
      }
      return (crc ^ (-1)) >>> 0;
    }

    function makeChunk(type: string, data: Buffer): Buffer {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(typeAndData), 0);
      return Buffer.concat([len, typeAndData, crc]);
    }

    const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 6; // RGBA
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;
    const ihdrChunk = makeChunk('IHDR', ihdrData);

    const rawRows: Buffer[] = [];
    const s2 = s * s;
    for (let y = 0; y < size; y++) {
      const row = Buffer.alloc(1 + size * 4);
      row[0] = 0;
      for (let x = 0; x < size; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
        for (let sy = 0; sy < s; sy++) {
          for (let sx = 0; sx < s; sx++) {
            const hx = x * s + sx;
            const hy = y * s + sy;
            const hIdx = (hy * W + hx) * 4;
            const alpha = hrPixels[hIdx + 3] / 255;
            rSum += hrPixels[hIdx] * alpha;
            gSum += hrPixels[hIdx + 1] * alpha;
            bSum += hrPixels[hIdx + 2] * alpha;
            aSum += hrPixels[hIdx + 3];
          }
        }
        const finalA = aSum / s2;
        const targetIdx = 1 + x * 4;
        if (finalA > 0) {
          row[targetIdx] = Math.round(rSum / (aSum / 255));
          row[targetIdx + 1] = Math.round(gSum / (aSum / 255));
          row[targetIdx + 2] = Math.round(bSum / (aSum / 255));
          row[targetIdx + 3] = Math.round(finalA);
        } else {
          row[targetIdx] = 0;
          row[targetIdx + 1] = 0;
          row[targetIdx + 2] = 0;
          row[targetIdx + 3] = 0;
        }
      }
      rawRows.push(row);
    }

    const rawBuffer = Buffer.concat(rawRows);
    const compressed = zlib.deflateSync(rawBuffer, { level: 9 });
    const idatChunk = makeChunk('IDAT', compressed);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
  }
}
