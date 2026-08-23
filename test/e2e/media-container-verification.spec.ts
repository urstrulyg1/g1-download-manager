import { test, expect, Page, APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FIXTURE_BASE = process.env.PLAYWRIGHT_FIXTURE_BASE || 'http://127.0.0.1:18055';
const RUNTIME_ROOT = path.join(process.cwd(), '.tmp', 'e2e-runtime');

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function fileSize(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function readFileHex(filePath: string, length = 32): string {
  const data = fs.readFileSync(filePath);
  return data.subarray(0, Math.min(length, data.length)).toString('hex');
}

async function getTestState(request: APIRequestContext) {
  const response = await request.get('/api/test/state');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function resetAppState(request: APIRequestContext, maxRetries = 5) {
  const response = await request.post('/api/test/reset', { data: { maxRetries } });
  expect(response.ok()).toBeTruthy();
  await expect.poll(async () => {
    const state = await getTestState(request);
    return state.downloads.length;
  }).toBe(0);
}

async function getDownloads(request: APIRequestContext) {
  const response = await request.get('/api/downloads');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getDownload(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/downloads/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getFixtureHealth() {
  const response = await fetch(`${FIXTURE_BASE}/health`);
  expect(response.ok).toBeTruthy();
  return response.json() as Promise<{ 
    hashes: Record<string, string>;
    mediaFixtures?: { available: boolean; files?: Array<{ name: string; size: number; hash: string }> };
  }>;
}

async function openDownloadsView(page: Page) {
  await page.locator('aside').getByRole('button', { name: /downloads/i }).first().click();
  await expect(page.locator('table')).toBeVisible();
}

async function createDownloadViaModal(
  page: Page,
  url: string,
  options: {
    action?: 'now' | 'later' | 'queue';
    expectedFilename?: RegExp | string;
    destinationDir?: string;
  } = {}
) {
  const action = options.action || 'now';

  await page.getByRole('button', { name: /new download/i }).click();
  await expect(page.getByTestId('add-download-modal')).toBeVisible();
  await page.getByTestId('download-url-input').fill(url);

  if (options.expectedFilename) {
    await expect(page.getByTestId('download-filename-input')).toHaveValue(options.expectedFilename, { timeout: 20_000 });
  }

  if (options.destinationDir) {
    await page.getByTestId('download-destination-input').fill(options.destinationDir);
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/downloads') &&
      response.request().method() === 'POST'
  );

  const buttonTestId =
    action === 'now'
      ? 'download-now-button'
      : action === 'later'
      ? 'download-later-button'
      : 'add-to-queue-button';

  await page.getByTestId(buttonTestId).click();
  const response = await responsePromise;
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  await expect(page.getByTestId('add-download-modal')).toBeHidden();
  await page.waitForTimeout(500);

  return { item: body };
}

async function openPopupForDownload(page: Page, id: string) {
  await openDownloadsView(page);
  const opener = page.getByTestId(`open-idm-progress-${id}`);
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(page.getByTestId('idm-progress-modal')).toBeVisible();
  await expect(page.getByTestId('idm-download-id')).toHaveText(id);
  return opener;
}

async function waitForDownloadCompletion(page: Page, request: APIRequestContext, id: string, timeout = 60000) {
  await expect.poll(async () => (await getDownload(request, id)).status, { timeout }).toBe('completed');
}

test.describe.configure({ mode: 'serial' });

test.describe('Media Container Verification - Real MP4 and WebM', () => {
  test.beforeEach(async ({ request }) => {
    await resetAppState(request);
  });

  test('MP4: Downloads real media container, verifies checksum, validates structure', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    // Check if media fixtures are available
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    const mp4Fixture = fixtureHealth.mediaFixtures.files?.find(f => f.name === 'test-video.mp4');
    expect(mp4Fixture).toBeDefined();
    expect(mp4Fixture!.size).toBeGreaterThan(0);
    
    const sourceUrl = `${FIXTURE_BASE}/files/media/test-video.mp4`;
    const expectedSize = mp4Fixture!.size;
    const expectedHash = mp4Fixture!.hash;

    await page.goto('/');

    // Step 1: Add download
    const { item: createdItem } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Test Video\.mp4/,
    });

    expect(createdItem.id).toBeTruthy();
    expect(createdItem.filename).toBe('Test Video.mp4');
    expect(createdItem.status).toBe('downloading');

    // Step 2: Verify IDM popup opens
    await expect(page.getByTestId('idm-progress-modal')).toBeVisible();
    await expect(page.getByTestId('idm-download-id')).toHaveText(createdItem.id);
    await expect(page.getByTestId('idm-filename')).toContainText('Test Video');
    await expect(page.getByTestId('idm-file-type')).toHaveText(/MP4/i);

    // Step 3: Verify progress tracking
    await expect.poll(async () => {
      const item = await getDownload(request, createdItem.id);
      return item.downloadedBytes;
    }).toBeGreaterThan(0);

    // Step 4: Wait for completion
    await waitForDownloadCompletion(page, request, createdItem.id);

    // Step 5: Verify completion state
    const completedItem = await getDownload(request, createdItem.id);
    expect(completedItem.status).toBe('completed');
    expect(completedItem.downloadedBytes).toBe(expectedSize);
    expect(completedItem.totalBytes).toBe(expectedSize);
    expect(completedItem.progress).toBe(100);

    // Step 6: Verify file on filesystem
    expect(fs.existsSync(completedItem.finalPath)).toBeTruthy();
    expect(path.basename(completedItem.finalPath)).toBe('Test Video.mp4');
    expect(path.extname(completedItem.finalPath)).toBe('.mp4');
    expect(fileSize(completedItem.finalPath)).toBe(expectedSize);

    // Step 7: Verify SHA-256 checksum
    const actualHash = await sha256File(completedItem.finalPath);
    expect(actualHash).toBe(expectedHash);

    // Step 8: Verify MP4 container structure (check for ftyp and moov boxes)
    const fileHeader = readFileHex(completedItem.finalPath, 64);
    // MP4 should start with ftyp box
    expect(fileHeader).toContain('66747970'); // 'ftyp' in hex
    expect(fileHeader).toContain('6d6f6f76'); // 'moov' in hex

    // Step 9: Verify UI shows completion
    await expect(page.getByTestId('idm-status')).toHaveText('Completed');
    await expect(page.getByTestId('idm-progress-value')).toHaveText('100.0%');

    // Step 10: Verify filename consistency across all representations
    await openDownloadsView(page);
    await expect(page.getByTestId(`download-filename-${createdItem.id}`)).toHaveText('Test Video.mp4');
    
    // Verify in database
    const state = await getTestState(request);
    const dbItem = state.downloads.find((d: any) => d.id === createdItem.id);
    expect(dbItem).toBeDefined();
    expect(dbItem.filename).toBe('Test Video.mp4');
    expect(dbItem.finalPath).toContain('Test Video.mp4');

    // Verify temp files are cleaned up
    expect(fs.existsSync(completedItem.tempPath)).toBeFalsy();
    expect(fs.existsSync(completedItem.stateFilePath)).toBeFalsy();
  });

  test('WebM: Downloads real media container, verifies checksum, validates structure', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    // Check if media fixtures are available
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    const webmFixture = fixtureHealth.mediaFixtures.files?.find(f => f.name === 'test-video.webm');
    expect(webmFixture).toBeDefined();
    expect(webmFixture!.size).toBeGreaterThan(0);
    
    const sourceUrl = `${FIXTURE_BASE}/files/media/test-video.webm`;
    const expectedSize = webmFixture!.size;
    const expectedHash = webmFixture!.hash;

    await page.goto('/');

    // Step 1: Add download
    const { item: createdItem } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Test Video\.webm/,
    });

    expect(createdItem.id).toBeTruthy();
    expect(createdItem.filename).toBe('Test Video.webm');
    expect(createdItem.status).toBe('downloading');

    // Step 2: Verify IDM popup opens
    await expect(page.getByTestId('idm-progress-modal')).toBeVisible();
    await expect(page.getByTestId('idm-download-id')).toHaveText(createdItem.id);
    await expect(page.getByTestId('idm-filename')).toContainText('Test Video');
    await expect(page.getByTestId('idm-file-type')).toHaveText(/WEBM/i);

    // Step 3: Wait for completion
    await waitForDownloadCompletion(page, request, createdItem.id);

    // Step 4: Verify completion state
    const completedItem = await getDownload(request, createdItem.id);
    expect(completedItem.status).toBe('completed');
    expect(completedItem.downloadedBytes).toBe(expectedSize);
    expect(completedItem.totalBytes).toBe(expectedSize);

    // Step 5: Verify file on filesystem
    expect(fs.existsSync(completedItem.finalPath)).toBeTruthy();
    expect(path.basename(completedItem.finalPath)).toBe('Test Video.webm');
    expect(path.extname(completedItem.finalPath)).toBe('.webm');
    
    // IMPORTANT: G1DM must NOT rename WebM to .mp4
    expect(path.extname(completedItem.finalPath)).not.toBe('.mp4');
    expect(completedItem.filename).toBe('Test Video.webm');
    
    expect(fileSize(completedItem.finalPath)).toBe(expectedSize);

    // Step 6: Verify SHA-256 checksum
    const actualHash = await sha256File(completedItem.finalPath);
    expect(actualHash).toBe(expectedHash);

    // Step 7: Verify WebM container structure (check for EBML header)
    const fileHeader = readFileHex(completedItem.finalPath, 32);
    // WebM should start with EBML header (0x1A 0x45 0xDF 0xA3)
    expect(fileHeader).toContain('1a45dfa3');

    // Step 8: Verify UI shows completion
    await expect(page.getByTestId('idm-status')).toHaveText('Completed');
    await expect(page.getByTestId('idm-progress-value')).toHaveText('100.0%');

    // Step 9: Verify filename consistency
    await openDownloadsView(page);
    await expect(page.getByTestId(`download-filename-${createdItem.id}`)).toHaveText('Test Video.webm');
    
    // Verify in database
    const state = await getTestState(request);
    const dbItem = state.downloads.find((d: any) => d.id === createdItem.id);
    expect(dbItem).toBeDefined();
    expect(dbItem.filename).toBe('Test Video.webm');
    expect(dbItem.finalPath).toContain('Test Video.webm');
  });

  test('Invalid MP4: Downloads file with .mp4 extension but invalid structure', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    // Check if media fixtures are available
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    const invalidMp4Fixture = fixtureHealth.mediaFixtures.files?.find(f => f.name === 'invalid-video.mp4');
    expect(invalidMp4Fixture).toBeDefined();
    
    const sourceUrl = `${FIXTURE_BASE}/files/media/invalid-video.mp4`;
    const expectedSize = invalidMp4Fixture!.size;
    const expectedHash = invalidMp4Fixture!.hash;

    await page.goto('/');

    // Download the invalid MP4
    const { item: createdItem } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Invalid Video\.mp4/,
    });

    // Should still download (G1DM treats files as opaque bytes)
    await waitForDownloadCompletion(page, request, createdItem.id);

    const completedItem = await getDownload(request, createdItem.id);
    expect(completedItem.status).toBe('completed');
    expect(completedItem.downloadedBytes).toBe(expectedSize);

    // Verify file exists
    expect(fs.existsSync(completedItem.finalPath)).toBeTruthy();
    expect(path.basename(completedItem.finalPath)).toBe('Invalid Video.mp4');
    expect(fileSize(completedItem.finalPath)).toBe(expectedSize);

    // Verify checksum
    const actualHash = await sha256File(completedItem.finalPath);
    expect(actualHash).toBe(expectedHash);

    // Verify it's NOT a valid MP4 (doesn't have ftyp box)
    const fileHeader = readFileHex(completedItem.finalPath, 32);
    expect(fileHeader).not.toContain('66747970'); // No 'ftyp' box
    
    // The file should be downloaded as-is without validation
    // G1DM's normal downloader treats files as opaque bytes
    // Media validation is separate (in detection/preview workflows)
  });

  test('Filename consistency: Same filename across all representations for MP4', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    const sourceUrl = `${FIXTURE_BASE}/files/media/test-video.mp4`;

    await page.goto('/');

    const { item: createdItem } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Test Video\.mp4/,
    });

    await waitForDownloadCompletion(page, request, createdItem.id);
    const completedItem = await getDownload(request, createdItem.id);

    const expectedFilename = 'Test Video.mp4';

    // Check Add Download result
    expect(createdItem.filename).toBe(expectedFilename);

    // Check IDM popup
    await openPopupForDownload(page, createdItem.id);
    await expect(page.getByTestId('idm-filename-inline')).toHaveText(expectedFilename);

    // Check Downloads list
    await openDownloadsView(page);
    await expect(page.getByTestId(`download-filename-${createdItem.id}`)).toHaveText(expectedFilename);

    // Check Download detail
    await page.locator(`[data-download-id="${createdItem.id}"]`).click();
    await expect(page.getByText(expectedFilename).first()).toBeVisible();

    // Check Database
    const state = await getTestState(request);
    const dbItem = state.downloads.find((d: any) => d.id === createdItem.id);
    expect(dbItem.filename).toBe(expectedFilename);

    // Check Filesystem
    expect(path.basename(completedItem.finalPath)).toBe(expectedFilename);

    // No discrepancies should exist
    expect(createdItem.filename).toBe(dbItem.filename);
    expect(createdItem.filename).toBe(path.basename(completedItem.finalPath));
  });

  test('Filename consistency: Same filename across all representations for WebM', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    const sourceUrl = `${FIXTURE_BASE}/files/media/test-video.webm`;

    await page.goto('/');

    const { item: createdItem } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Test Video\.webm/,
    });

    await waitForDownloadCompletion(page, request, createdItem.id);
    const completedItem = await getDownload(request, createdItem.id);

    const expectedFilename = 'Test Video.webm';

    // Check Add Download result
    expect(createdItem.filename).toBe(expectedFilename);

    // Check IDM popup
    await openPopupForDownload(page, createdItem.id);
    await expect(page.getByTestId('idm-filename-inline')).toHaveText(expectedFilename);

    // Check Downloads list
    await openDownloadsView(page);
    await expect(page.getByTestId(`download-filename-${createdItem.id}`)).toHaveText(expectedFilename);

    // Check Download detail
    await page.locator(`[data-download-id="${createdItem.id}"]`).click();
    await expect(page.getByText(expectedFilename).first()).toBeVisible();

    // Check Database
    const state = await getTestState(request);
    const dbItem = state.downloads.find((d: any) => d.id === createdItem.id);
    expect(dbItem.filename).toBe(expectedFilename);

    // Check Filesystem
    expect(path.basename(completedItem.finalPath)).toBe(expectedFilename);

    // No discrepancies should exist
    expect(createdItem.filename).toBe(dbItem.filename);
    expect(createdItem.filename).toBe(path.basename(completedItem.finalPath));
  });

  test('Media detection remains separate from downloading - no DownloadItem created during detection', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    await page.goto('/');

    // Verify no downloads exist initially
    let downloads = await getDownloads(request);
    expect(downloads.length).toBe(0);

    // Open Media Sniffer
    await page.locator('aside').getByRole('button', { name: /media sniffer/i }).click();
    
    // Detect the MP4 fixture
    await page.getByRole('textbox').fill(`${FIXTURE_BASE}/files/media/test-video.mp4`);
    await page.getByRole('button', { name: /analyze video source/i }).click();
    
    // Wait for metadata to appear
    await expect.poll(async () => {
      const currentDownloads = await getDownloads(request);
      return currentDownloads.length;
    }).toBe(0);
    
    // Metadata should appear but NO DownloadItem should be created
    try {
      await page.waitForSelector('[data-testid="media-metadata"]', { timeout: 10000 }).catch(() => {});
      // If metadata appears, that's good
    } catch (e) {
      // Metadata might not appear if detection doesn't recognize it
      // That's okay - the important thing is no DownloadItem was created
    }
    
    // Still no downloads
    downloads = await getDownloads(request);
    expect(downloads.length).toBe(0);
    
    // User clicks Download
    const { item: createdItem } = await createDownloadViaModal(page, `${FIXTURE_BASE}/files/media/test-video.mp4`, {
      action: 'now',
      expectedFilename: /Test Video\.mp4/,
    });
    
    // Now DownloadItem is created
    await expect.poll(async () => (await getDownloads(request)).length).toBe(1);
    
    // Verify the item exists
    const item = await getDownload(request, createdItem.id);
    expect(item).toBeDefined();
    expect(item.id).toBe(createdItem.id);
  });

  test('Multiple media downloads maintain separate identities and filenames', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    
    if (!fixtureHealth.mediaFixtures?.available) {
      test.skip();
      return;
    }
    
    await page.goto('/');

    const urls = [
      `${FIXTURE_BASE}/files/media/test-video.mp4`,
      `${FIXTURE_BASE}/files/media/test-video.webm`,
    ];

    const created: any[] = [];
    for (const url of urls) {
      const { item } = await createDownloadViaModal(page, url, { action: 'now' });
      created.push(item);
      
      // Hide popup after each download
      if (await page.getByTestId('idm-progress-modal').isVisible().catch(() => false)) {
        await page.getByTestId('idm-hide-button').click();
      }
    }

    // Wait for all downloads to complete
    for (const item of created) {
      await waitForDownloadCompletion(page, request, item.id, 120000);
    }

    // Verify all downloads completed
    const allDownloads = await getDownloads(request);
    expect(allDownloads.length).toBeGreaterThanOrEqual(2);

    // Verify each has correct filename
    for (const item of created) {
      const completed = await getDownload(request, item.id);
      expect(completed.status).toBe('completed');
      expect(fs.existsSync(completed.finalPath)).toBeTruthy();
      
      if (item.filename.includes('.mp4')) {
        expect(path.extname(completed.finalPath)).toBe('.mp4');
      } else if (item.filename.includes('.webm')) {
        expect(path.extname(completed.finalPath)).toBe('.webm');
      }
    }

    // Verify no filename collisions
    const filenames = created.map(item => item.filename);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});
