const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
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

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(size) {
  // Render using 4x supersampling (SSAA) for crisp anti-aliased edges
  const s = 4;
  const W = size * s;
  const H = size * s;
  const rCorner = W * 0.22; // rounded corner radius

  // Normalized polygon coordinates for lightning bolt [x, y]
  const boltPoly = [
    [0.54, 0.15],
    [0.30, 0.52],
    [0.48, 0.52],
    [0.42, 0.85],
    [0.72, 0.45],
    [0.54, 0.45],
    [0.62, 0.15]
  ];

  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function sdRoundedBox(px, py, w, h, r) {
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
        // Transparent outside rounded rectangle
        hrPixels[idx] = 0;
        hrPixels[idx + 1] = 0;
        hrPixels[idx + 2] = 0;
        hrPixels[idx + 3] = 0;
      } else {
        // High-tech vibrant blue/cyan gradient: #2563eb to #06b6d4
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

  // Downsample to target size with Box filter
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

  const rawRows = [];
  const s2 = s * s;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // Filter: None
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

function writeIconsToDirectory(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sizes = [16, 32, 48, 128];
  for (const size of sizes) {
    const pngBuffer = generatePng(size);
    const filePath = path.join(targetDir, `icon${size}.png`);
    fs.writeFileSync(filePath, pngBuffer);
    console.log(`Wrote icon ${size}x${size} -> ${filePath}`);
  }
}

function main() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const targetDirs = [
    path.join(rootDir, 'resources', 'extensions', 'chrome', 'icons'),
    path.join(rootDir, 'resources', 'extensions', 'firefox', 'icons'),
    path.join(rootDir, 'resources', 'extensions', 'safari', 'icons'),
    path.join(rootDir, 'resources', 'browser-extension', 'icons'),
    path.join(rootDir, 'resources', 'browser-extension')
  ];

  for (const dir of targetDirs) {
    writeIconsToDirectory(dir);
  }
  console.log('All extension icons generated successfully!');
}

if (require.main === module) {
  main();
}

module.exports = { generatePng, writeIconsToDirectory };
