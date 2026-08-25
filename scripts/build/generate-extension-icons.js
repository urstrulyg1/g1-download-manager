const fs = require('fs');
const path = require('path');
let sharp = null;

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

function getRequiredIconList() {
  const sizes = [16, 32, 48, 64, 128, 192, 256, 512];
  const items = [];

  for (const dir of targetDirs) {
    const isPublicIcons = dir.endsWith(path.join('public', 'icons'));
    const applicableSizes = isPublicIcons ? sizes : [16, 32, 48, 128];

    for (const size of applicableSizes) {
      const filename = isPublicIcons ? `icon-${size}.png` : `icon${size}.png`;
      items.push({
        dir,
        filename,
        outPath: path.join(dir, filename),
        size
      });
    }
  }

  return items;
}

function getRequiredCopiedFiles() {
  const publicDir = path.join(rootDir, 'src', 'renderer', 'public');
  const copies = [
    { src: sourceMaster, dest: path.join(publicDir, 'logo-mark.png') },
    { src: sourceMaster, dest: path.join(publicDir, 'logo.png') }
  ];

  const fullLogoMaster = path.join(rootDir, 'resources', 'brand', 'logo-full.png');
  if (fs.existsSync(fullLogoMaster)) {
    copies.push({ src: fullLogoMaster, dest: path.join(publicDir, 'logo-full.png') });
  }

  return copies;
}

async function generateIcons(options = {}) {
  if (!fs.existsSync(sourceMaster)) {
    throw new Error(`Master brand logo not found at: ${sourceMaster}`);
  }

  const force = options.force || process.argv.includes('--force') || process.argv.includes('-f') || process.env.FORCE_GENERATE_ICONS === '1';
  const isQuiet = options.quiet || process.argv.includes('--quiet') || process.env.QUIET === '1';

  const requiredIcons = getRequiredIconList();
  const requiredCopies = getRequiredCopiedFiles();

  // Check if all files already exist
  const missingIcons = requiredIcons.filter((item) => {
    if (force) return true;
    if (!fs.existsSync(item.outPath)) return true;
    try {
      const stat = fs.statSync(item.outPath);
      return stat.size === 0;
    } catch {
      return true;
    }
  });

  const missingCopies = requiredCopies.filter((copy) => {
    if (force) return true;
    if (!fs.existsSync(copy.dest)) return true;
    try {
      const stat = fs.statSync(copy.dest);
      return stat.size === 0;
    } catch {
      return true;
    }
  });

  if (!force && missingIcons.length === 0 && missingCopies.length === 0) {
    if (!isQuiet) {
      console.log('✓ All brand & extension icons already exist. Using existing PNG assets (use --force to re-generate).');
    }
    return;
  }

  // Load sharp only when generation is actually needed
  if (!sharp) {
    sharp = require('sharp');
  }

  // Ensure directories exist
  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Generate missing icons
  for (const item of missingIcons) {
    if (!fs.existsSync(item.dir)) {
      fs.mkdirSync(item.dir, { recursive: true });
    }

    await sharp(sourceMaster)
      .resize(item.size, item.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3
      })
      .png({ compressionLevel: 9 })
      .toFile(item.outPath);

    if (!isQuiet) {
      console.log(`Generated ${item.size}x${item.size} -> ${item.outPath}`);
    }
  }

  // Copy public assets if needed
  const publicDir = path.join(rootDir, 'src', 'renderer', 'public');
  if (fs.existsSync(publicDir)) {
    for (const copy of missingCopies) {
      if (fs.existsSync(copy.src)) {
        fs.copyFileSync(copy.src, copy.dest);
      }
    }
  }

  if (!isQuiet) {
    console.log('🎉 Brand & extension icon assets verified and synchronized successfully.');
  }
}

if (require.main === module) {
  generateIcons().catch((err) => {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  });
}

module.exports = { generateIcons };
