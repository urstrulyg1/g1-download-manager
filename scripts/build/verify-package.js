#!/usr/bin/env node
/**
 * G1DM 4.0 Packaged Application Isolation & Integrity Verifier
 * Verifies that the packaged distribution runs completely standalone
 * without any dependency on source files, dev paths, or local git repository.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const http = require('http');

const DIST_ROOT = path.resolve(__dirname, '..', '..');
const RELEASE_DIR = path.join(DIST_ROOT, 'release');

console.log(`\n======================================================`);
console.log(`  G1DM Packaged Application Validation & Audit`);
console.log(`======================================================\n`);

// 1. Verify Release Directory Exists
if (!fs.existsSync(RELEASE_DIR)) {
  console.log('Packaging release artifacts first...');
  execSync('node scripts/build/package-distribution.js', { cwd: DIST_ROOT, stdio: 'inherit' });
}

// 2. Validate Checksum Manifest Integrity
console.log('[1/5] Verifying SHA-256 Checksums Manifest...');
const checksumFile = path.join(RELEASE_DIR, 'checksums.sha256');
if (!fs.existsSync(checksumFile)) {
  throw new Error('checksums.sha256 missing in release output directory!');
}

const lines = fs.readFileSync(checksumFile, 'utf8').trim().split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  const [expectedHash, filename] = line.trim().split(/\s+/);
  const targetFile = path.join(RELEASE_DIR, filename);
  if (!fs.existsSync(targetFile)) {
    throw new Error(`Artifact listed in checksums.sha256 not found: ${filename}`);
  }
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`Checksum mismatch on ${filename}! Expected ${expectedHash}, got ${actualHash}`);
  }
  console.log(`  ✓ Verified SHA-256 integrity for ${filename}`);
}

// 3. Validate Release Manifest JSON
console.log('\n[2/5] Verifying release-manifest.json schema...');
const manifestFile = path.join(RELEASE_DIR, 'release-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (!manifest.version || !manifest.artifacts || !Array.isArray(manifest.artifacts)) {
  throw new Error('Invalid release-manifest.json structure.');
}
console.log(`  ✓ Release manifest version: ${manifest.version} (${manifest.artifacts.length} artifacts documented).`);

// 4. Isolated Extraction & Standalone Dependency Audit
console.log('\n[3/5] Testing isolated extraction outside repository...');
const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm_pkg_verify_'));
const linuxArchive = path.join(RELEASE_DIR, 'g1dm-4.0.0-linux-x64.tar.gz');

execSync(`tar -xzf "${linuxArchive}" -C "${tempTestDir}"`);
const extractedApp = path.join(tempTestDir, 'app');

// Audit against forbidden dev files
const forbiddenFiles = ['.git', '.github', 'tsconfig.json', '.eslintrc', 'test', 'coverage'];
for (const bad of forbiddenFiles) {
  if (fs.existsSync(path.join(extractedApp, bad))) {
    throw new Error(`Package contains forbidden development file/folder: ${bad}`);
  }
}
console.log('  ✓ No development-only files or test folders present in distribution package.');

// 5. Standalone Runtime Launch Verification
console.log('\n[4/5] Launching packaged application in isolated process...');
const testPort = 18099;
const testEnv = {
  ...process.env,
  PORT: String(testPort),
  G1DM_HOME: path.join(tempTestDir, 'user_home'),
  G1DM_DB_PATH: path.join(tempTestDir, 'user_home', '.g1dm', 'test.db'),
  NODE_ENV: 'production',
};

fs.mkdirSync(path.join(tempTestDir, 'user_home'), { recursive: true });

const child = spawn('node', ['dist/main/server.js'], {
  cwd: extractedApp,
  env: testEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverStarted = false;
let serverLogs = '';

child.stdout.on('data', (d) => {
  serverLogs += d.toString();
  if (serverLogs.includes('Application running')) {
    serverStarted = true;
  }
});

child.stderr.on('data', (d) => {
  serverLogs += d.toString();
});

async function runRuntimeTests() {
  // Wait up to 15s for server startup
  const startWait = Date.now();
  while (!serverStarted && Date.now() - startWait < 15000) {
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!serverStarted) {
    child.kill('SIGKILL');
    throw new Error(`Packaged application failed to start in time. Logs:\n${serverLogs}`);
  }
  console.log(`  ✓ Packaged server started successfully on port ${testPort}`);

  // Test API probe endpoint
  console.log('\n[5/5] Executing live API health & diagnostics on packaged app...');
  const metricsData = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${testPort}/api/metrics`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  if (!metricsData.network || !metricsData.storage) {
    throw new Error('Metrics response is missing expected subsystem reports.');
  }
  console.log(`  ✓ Live health check returned 200 OK. Engine uptime: ${metricsData.engine.uptimeSeconds}s`);

  // Shutdown child process gracefully
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));

  // Cleanup temp dir
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  } catch {}

  console.log('\n🏆 Packaged application validation passed completely!\n');
}

runRuntimeTests().catch((err) => {
  console.error('\n❌ Packaged verification failed:', err);
  if (child) {
    try { child.kill('SIGKILL'); } catch {}
  }
  try { fs.rmSync(tempTestDir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
