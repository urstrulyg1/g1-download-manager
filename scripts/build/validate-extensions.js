const fs = require('fs');
const path = require('path');

function validateExtensionDir(extensionPath, browserType) {
  const errors = [];
  if (!fs.existsSync(extensionPath)) {
    errors.push(`Directory does not exist: ${extensionPath}`);
    return errors;
  }

  const manifestPath = path.join(extensionPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push(`Missing manifest.json at ${manifestPath}`);
    return errors;
  }

  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch (err) {
    errors.push(`Invalid JSON in manifest.json: ${err.message}`);
    return errors;
  }

  if (!manifest.name) errors.push('Missing "name" in manifest.json');
  if (!manifest.version) errors.push('Missing "version" in manifest.json');
  if (!manifest.manifest_version) errors.push('Missing "manifest_version" in manifest.json');

  // Check icons if declared
  const icons = manifest.icons || {};
  for (const [size, iconRelPath] of Object.entries(icons)) {
    const iconFullPath = path.join(extensionPath, iconRelPath);
    if (!fs.existsSync(iconFullPath)) {
      errors.push(`Declared icon (${size}px) missing on disk: ${iconRelPath}`);
    } else {
      const stats = fs.statSync(iconFullPath);
      if (stats.size === 0) {
        errors.push(`Declared icon (${size}px) is empty (0 bytes): ${iconRelPath}`);
      }
    }
  }

  // Check background script
  if (manifest.background) {
    if (manifest.background.service_worker) {
      const bgPath = path.join(extensionPath, manifest.background.service_worker);
      if (!fs.existsSync(bgPath)) {
        errors.push(`Background service worker missing: ${manifest.background.service_worker}`);
      }
    } else if (Array.isArray(manifest.background.scripts)) {
      for (const scr of manifest.background.scripts) {
        const bgPath = path.join(extensionPath, scr);
        if (!fs.existsSync(bgPath)) {
          errors.push(`Background script missing: ${scr}`);
        }
      }
    }
  }

  // Check content scripts
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.js)) {
        for (const jsFile of cs.js) {
          const jsPath = path.join(extensionPath, jsFile);
          if (!fs.existsSync(jsPath)) {
            errors.push(`Content script missing: ${jsFile}`);
          }
        }
      }
    }
  }

  return errors;
}

function main() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const extensions = [
    { name: 'Google Chrome / Chromium / Edge / Brave', path: path.join(rootDir, 'resources', 'extensions', 'chrome') },
    { name: 'Mozilla Firefox', path: path.join(rootDir, 'resources', 'extensions', 'firefox') },
    { name: 'Apple Safari', path: path.join(rootDir, 'resources', 'extensions', 'safari') },
    { name: 'Browser Extension Package', path: path.join(rootDir, 'resources', 'browser-extension') }
  ];

  let totalErrors = 0;
  const isQuiet = process.argv.includes('--quiet') || process.env.QUIET === '1';

  if (!isQuiet) {
    console.log('🔍 Validating browser companion extensions...');
  }

  for (const ext of extensions) {
    const errs = validateExtensionDir(ext.path, ext.name);
    if (errs.length > 0) {
      console.error(`❌ [${ext.name}] Validation failed:`);
      for (const err of errs) {
        console.error(`   - ${err}`);
      }
      totalErrors += errs.length;
    } else if (!isQuiet) {
      console.log(`✓ [${ext.name}] Verified valid.`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\n🚨 Extension validation failed with ${totalErrors} error(s)!`);
    process.exit(1);
  } else {
    if (!isQuiet) {
      console.log('🎉 All browser extensions validated successfully.\n');
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateExtensionDir };
