import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_SANDBOX = path.join(os.tmpdir(), `g1dm_test_sandbox_${process.pid}`);

// Set environment variables before any test suites run
process.env.NODE_ENV = 'test';
process.env.G1DM_DOWNLOAD_DIR = TEST_SANDBOX;

beforeAll(() => {
  if (!fs.existsSync(TEST_SANDBOX)) {
    try {
      fs.mkdirSync(TEST_SANDBOX, { recursive: true });
    } catch {}
  }
});

afterAll(() => {
  // Automatically delete all test artifacts immediately when test suite finishes
  if (fs.existsSync(TEST_SANDBOX)) {
    try {
      fs.rmSync(TEST_SANDBOX, { recursive: true, force: true });
    } catch {}
  }
  const defaultTmp = path.join(os.tmpdir(), 'g1dm_test_downloads');
  if (fs.existsSync(defaultTmp)) {
    try {
      fs.rmSync(defaultTmp, { recursive: true, force: true });
    } catch {}
  }
});
