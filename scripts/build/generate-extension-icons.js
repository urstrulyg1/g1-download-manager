const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..', '..');
const sourceMaster = path.join(rootDir, 'resources', 'brand', 'logo-mark.png');

const targetDirs = [
  path.join(rootDir, 'resources', 'extensions', 'chrome', 'icons'),
  path.join(rootDir, 'resources', 'extensions', 'firefox', 'icons'),
  path.join(rootDir, 'resources', 'extensions', 'safari', 'icons'),
  path.join(rootDir, 'resources', 'browser-extension', 'icons'),
  path.join(rootDir, 'resources', 'browser-extension'),
  path.join(rootDir, 'src', 'renderer', 'public', 'icons')
];

async function generateIcons() {
  if (!fs.existsSync(sourceMaster)) {
    throw new Error(`Master brand logo not found at: ${sourceMaster}`);
  }

  const sizes = [16, 32, 48, 64, 128, 192, 256, 512];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const isPublicIcons = dir.endsWith(path.join('public', 'icons'));
    const applicableSizes = isPublicIcons ? sizes : [16, 32, 48, 128];

    const isQuiet = process.argv.includes('--quiet') || process.env.QUIET === '1';
    for (const size of applicableSizes) {
      const filename = isPublicIcons ? `icon-${size}.png` : `icon${size}.png`;
      const outPath = path.join(dir, filename);

      await sharp(sourceMaster)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3
        })
        .png({ compressionLevel: 9 })
        .toFile(outPath);

      if (!isQuiet) {
        console.log(`Generated ${size}x${size} -> ${outPath}`);
      }
    }
  }

  // Also ensure public/favicon.ico and public/logo-mark.png are synchronized
  const publicDir = path.join(rootDir, 'src', 'renderer', 'public');
  if (fs.existsSync(publicDir)) {
    fs.copyFileSync(sourceMaster, path.join(publicDir, 'logo-mark.png'));
    fs.copyFileSync(sourceMaster, path.join(publicDir, 'logo.png'));
    const fullLogoMaster = path.join(rootDir, 'resources', 'brand', 'logo-full.png');
    if (fs.existsSync(fullLogoMaster)) {
      fs.copyFileSync(fullLogoMaster, path.join(publicDir, 'logo-full.png'));
    }
  }

  const isQuiet = process.argv.includes('--quiet') || process.env.QUIET === '1';
  if (!isQuiet) {
    console.log('All brand & extension icons generated successfully from master transparent logo!');
  }
}

if (require.main === module) {
  generateIcons().catch((err) => {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  });
}

module.exports = { generateIcons };
