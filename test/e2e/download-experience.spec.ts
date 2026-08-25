import { test, expect, APIRequestContext, Locator, Page } from '@playwright/test';
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

function readHead(filePath: string, length = 256): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').toLowerCase();
  } finally {
    fs.closeSync(fd);
  }
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

async function getSettings(request: APIRequestContext) {
  const response = await request.get('/api/settings');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function saveSettings(request: APIRequestContext, settings: any) {
  const response = await request.post('/api/settings', { data: settings });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getDownload(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/downloads/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getDownloads(request: APIRequestContext) {
  const response = await request.get('/api/downloads');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getFixtureHealth() {
  const response = await fetch(`${FIXTURE_BASE}/health`);
  expect(response.ok).toBeTruthy();
  return response.json() as Promise<{ hashes: Record<string, string> }>;
}

async function openDownloadsView(page: Page) {
  // The IDM popup legitimately covers the UI while a real download runs and
  // may open asynchronously — dismiss it (Escape) and retry, as a user would.
  const navButton = page.locator('aside').getByRole('button', { name: /downloads/i }).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await navButton.click({ timeout: 3000 });
      await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
      return;
    } catch {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
  await navButton.click();
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
  let createRequestCount = 0;
  const requestListener = (request: any) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/downloads')) {
      createRequestCount += 1;
    }
  };

  page.on('request', requestListener);
  try {
    await page.getByRole('button', { name: /new download|add download/i }).first().click();
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

    return {
      item: body,
      createRequestCount,
    };
  } finally {
    page.off('request', requestListener);
  }
}

async function submitDownloadExpectInlineError(page: Page, url: string, destinationDir: string) {
  await page.getByRole('button', { name: /new download|add download/i }).first().click();
  await expect(page.getByTestId('add-download-modal')).toBeVisible();
  await page.getByTestId('download-url-input').fill(url);
  await page.waitForTimeout(1000);
  await page.getByTestId('download-destination-input').fill(destinationDir);
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/downloads') && response.request().method() === 'POST'
  );
  await page.getByTestId('download-now-button').click();
  const response = await responsePromise;
  expect(response.ok()).toBeFalsy();
  await expect(page.getByTestId('download-submit-error')).toBeVisible();
  return response;
}

function parsePercent(text: string | null): number {
  return Number.parseFloat((text || '0').replace('%', '').trim()) || 0;
}

async function getProgressPercent(locator: Locator): Promise<number> {
  return parsePercent(await locator.textContent());
}

async function waitForProgressToStart(page: Page) {
  await expect
    .poll(async () => getProgressPercent(page.getByTestId('idm-progress-value')))
    .toBeGreaterThan(0);
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

test.describe.configure({ mode: 'serial' });


/**
 * Navigate to the app and dismiss the genuine first-run onboarding modal when
 * present (a real fresh-profile condition). Onboarding is user-facing setup,
 * not download data; tests dismiss it the same way a real user would.
 */
async function gotoApp(page: Page) {
  await page.goto('/');
  const skipButton = page.getByRole('button', { name: /skip setup/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
    await expect(page.getByRole('heading', { name: /welcome to g1dm/i })).toBeHidden();
  }
  // Close any overlay left open by a previous test in the shared context
  // (theme menu, popup, etc.) so navigation is not blocked.
  await page.keyboard.press('Escape');
}

test.describe('G1DM browser download experience', () => {
  test.beforeEach(async ({ request }) => {
    await resetAppState(request);
  });

  test('starts with a real empty state and no dummy downloads', async ({ page, request }) => {
    await gotoApp(page);
    await expect(page.getByText('G1DM')).toBeVisible();

    let state = await getTestState(request);
    expect(state.downloads).toHaveLength(0);

    await openDownloadsView(page);
    await expect(page.getByTestId('downloads-empty-state')).toContainText('No downloads yet');
    await expect(page.locator('[data-download-id]')).toHaveCount(0);

    await page.reload();
    await openDownloadsView(page);
    await expect(page.getByTestId('downloads-empty-state')).toBeVisible();

    state = await getTestState(request);
    expect(state.downloads).toHaveLength(0);
  });

  test('Download Now opens the IDM popup automatically, tracks the exact ID, supports pause/resume/hide/reopen, and finalizes the real file', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    const sourceUrl = `${FIXTURE_BASE}/files/slow-media?name=Actual%20Video%20Title.mp4&mime=video/mp4&profile=10mb&delayMs=80`;

    await gotoApp(page);

    const { item: createdItem, createRequestCount } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Actual Video Title\.mp4/,
    });

    expect(createRequestCount).toBe(1);

    await expect(page.getByTestId('idm-progress-modal')).toBeVisible();
    await expect(page.getByTestId('idm-download-id')).toHaveText(createdItem.id);
    await expect(page.getByTestId('idm-filename')).toContainText('Actual Video Title');
    await expect(page.getByTestId('idm-file-type')).toHaveText(/MP4/i);

    await expect.poll(async () => (await getDownloads(request)).length).toBe(1);

    await waitForProgressToStart(page);
    await expect.poll(async () => await page.getByTestId('idm-speed').textContent()).not.toBe('0 B/s');
    await expect.poll(async () => await page.getByTestId('idm-eta').textContent()).not.toBe('—');

    const progressSamples: Array<{ ui: number; api: number; downloaded: number }> = [];
    for (let index = 0; index < 4; index += 1) {
      await page.waitForTimeout(700);
      const apiItem = await getDownload(request, createdItem.id);
      const uiProgress = await getProgressPercent(page.getByTestId('idm-progress-value'));
      progressSamples.push({
        ui: uiProgress,
        api: apiItem.progress,
        downloaded: apiItem.downloadedBytes,
      });
      expect(Math.abs(uiProgress - apiItem.progress)).toBeLessThan(12.1);
    }

    expect(progressSamples.some((sample) => sample.downloaded > 0)).toBeTruthy();
    for (let index = 1; index < progressSamples.length; index += 1) {
      expect(progressSamples[index].downloaded).toBeGreaterThanOrEqual(progressSamples[index - 1].downloaded);
    }

    await page.getByTestId('idm-pause-button').click();
    await expect(page.getByTestId('idm-status')).toHaveText('Paused');
    await expect.poll(async () => (await getDownload(request, createdItem.id)).status).toBe('paused');

    await page.waitForTimeout(600);
    const pausedBaseline = await getDownload(request, createdItem.id);
    const progressWhilePaused = await page.getByTestId('idm-progress-value').textContent();

    await page.waitForTimeout(2000);
    const pausedItem = await getDownload(request, createdItem.id);
    expect(pausedItem.downloadedBytes).toBe(pausedBaseline.downloadedBytes);
    expect(fs.existsSync(pausedItem.tempPath)).toBeTruthy();
    await expect(page.getByTestId('idm-progress-value')).toHaveText(progressWhilePaused || '0.0%');

    await page.getByTestId('idm-resume-button').click();
    await expect.poll(async () => (await getDownload(request, createdItem.id)).status).toBe('downloading');
    await expect.poll(async () => (await getDownload(request, createdItem.id)).downloadedBytes).toBeGreaterThan(pausedItem.downloadedBytes);

    const afterResume = await getDownload(request, createdItem.id);

    await page.getByTestId('idm-hide-button').click();
    await expect(page.getByTestId('idm-progress-modal')).toBeHidden();

    await page.waitForTimeout(1500);
    const hiddenItem = await getDownload(request, createdItem.id);
    expect(hiddenItem.status).toBe('downloading');
    expect(hiddenItem.downloadedBytes).toBeGreaterThan(afterResume.downloadedBytes);
    expect(fs.existsSync(hiddenItem.tempPath)).toBeTruthy();

    await openPopupForDownload(page, createdItem.id);
    await expect(page.getByTestId('idm-filename-inline')).toHaveText(createdItem.filename);

    await expect.poll(async () => (await getDownload(request, createdItem.id)).status, { timeout: 120_000 }).toBe('completed');

    const completedItem = await getDownload(request, createdItem.id);
    await expect(page.getByTestId('idm-status')).toHaveText('Completed');
    await expect(page.getByTestId('idm-progress-value')).toHaveText('100.0%');

    expect(fs.existsSync(completedItem.finalPath)).toBeTruthy();
    expect(fs.existsSync(completedItem.tempPath)).toBeFalsy();
    expect(fs.existsSync(completedItem.stateFilePath)).toBeFalsy();
    expect(path.basename(completedItem.finalPath)).toBe(completedItem.filename);
    expect(path.extname(completedItem.finalPath)).toBe('.mp4');
    expect(fileSize(completedItem.finalPath)).toBe(10 * 1024 * 1024);
    expect(await sha256File(completedItem.finalPath)).toBe(fixtureHealth.hashes['10mb']);

    const head = readHead(completedItem.finalPath);
    expect(head.includes('<html')).toBeFalsy();
    expect(head.includes('<!doctype')).toBeFalsy();
    expect(head.includes('{"error"')).toBeFalsy();

    const openFileResponse = page.waitForResponse((response) => response.url().endsWith(`/api/downloads/${createdItem.id}/open-file`));
    await page.getByTestId('idm-open-file-button').click();
    expect((await openFileResponse).ok()).toBeTruthy();

    const openFolderResponse = page.waitForResponse((response) => response.url().endsWith(`/api/downloads/${createdItem.id}/open-folder`));
    await page.getByTestId('idm-open-folder-button').click();
    expect((await openFolderResponse).ok()).toBeTruthy();

    await page.getByTestId('idm-hide-button').click();
    await openDownloadsView(page);
    await expect(page.locator(`[data-download-id="${createdItem.id}"]`)).toBeVisible();
    await expect(page.getByTestId(`download-filename-${createdItem.id}`)).toHaveText(createdItem.filename);

    await page.locator(`[data-download-id="${createdItem.id}"]`).click();
    await expect(page.getByText(createdItem.filename).first()).toBeVisible();
    await page.getByRole('button', { name: /close/i }).last().click();
  });

  test('Cancel in the popup stops the active download without completing it', async ({ page, request }) => {
    await gotoApp(page);
    const sourceUrl = `${FIXTURE_BASE}/files/slow-media?name=Cancel%20Scenario.mp4&mime=video/mp4&profile=5mb&delayMs=70`;
    const { item } = await createDownloadViaModal(page, sourceUrl, {
      action: 'now',
      expectedFilename: /Cancel Scenario\.mp4/,
    });

    await waitForProgressToStart(page);
    await page.getByTestId('idm-cancel-button').click();
    await expect.poll(async () => (await getDownload(request, item.id)).status).toBe('cancelled');
    await expect(page.getByTestId('idm-status')).toHaveText('Cancelled');

    await page.waitForTimeout(600);
    const cancelledBaseline = await getDownload(request, item.id);
    await page.waitForTimeout(2000);
    const cancelledItem = await getDownload(request, item.id);
    expect(cancelledItem.downloadedBytes).toBe(cancelledBaseline.downloadedBytes);
    expect(cancelledItem.status).not.toBe('completed');
  });

  test('Retry in the popup resumes the same logical download ID after a controlled failure', async ({ page, request }) => {
    const fixtureHealth = await getFixtureHealth();
    await resetAppState(request, 0);
    await gotoApp(page);

    const { item } = await createDownloadViaModal(page, `${FIXTURE_BASE}/files/flaky-retry.mp4`, {
      action: 'now',
      expectedFilename: /Retryable Demo Clip\.mp4/,
    });

    await expect.poll(async () => (await getDownload(request, item.id)).status, { timeout: 30_000 }).toBe('failed');
    const failedItem = await getDownload(request, item.id);
    expect(failedItem.downloadedBytes).toBeGreaterThan(0);
    await expect(page.getByTestId('idm-status')).toHaveText('Failed');
    await expect(page.getByText(/download error/i)).toBeVisible();
    await expect(page.getByTestId('idm-retry-button')).toBeVisible();
    await expect.poll(async () => (await getDownloads(request)).length).toBe(1);

    await page.getByTestId('idm-retry-button').click();
    await expect(page.getByTestId('idm-download-id')).toHaveText(item.id);
    await expect.poll(async () => {
      const current = await getDownload(request, item.id);
      return current.status;
    }).not.toBe('failed');
    await expect.poll(async () => (await getDownload(request, item.id)).status, { timeout: 90_000 }).toBe('completed');

    const completedItem = await getDownload(request, item.id);
    expect(await sha256File(completedItem.finalPath)).toBe(fixtureHealth.hashes['1mb']);
    expect(fs.existsSync(completedItem.tempPath)).toBeFalsy();
  });

  test('refresh and websocket reconnect recover the active download without duplication or fake jumps', async ({ page, request }) => {
    await gotoApp(page);

    const { item } = await createDownloadViaModal(
      page,
      `${FIXTURE_BASE}/files/slow-media?name=Refresh%20Recovery.mp4&mime=video/mp4&profile=10mb&delayMs=600`,
      { action: 'now', expectedFilename: /Refresh Recovery\.mp4/ }
    );

    await waitForProgressToStart(page);
    const beforeReload = await getDownload(request, item.id);

    await page.reload();
    await openDownloadsView(page);
    await expect(page.locator('[data-download-id]')).toHaveCount(1);
    await expect(page.locator(`[data-download-id="${item.id}"]`)).toBeVisible();

    await expect.poll(async () => (await getDownload(request, item.id)).downloadedBytes).toBeGreaterThan(beforeReload.downloadedBytes);

    await openPopupForDownload(page, item.id);
    const beforeDisconnect = await getDownload(request, item.id);

    const disconnectResponse = await request.post('/api/test/ws/disconnect');
    expect(disconnectResponse.ok()).toBeTruthy();

    await page.waitForTimeout(1500);
    await expect.poll(async () => (await getDownload(request, item.id)).downloadedBytes).toBeGreaterThan(beforeDisconnect.downloadedBytes);
    await page.waitForTimeout(2500);

    const currentItem = await getDownload(request, item.id);
    const uiProgress = await getProgressPercent(page.getByTestId('idm-progress-value'));
    expect(Math.abs(uiProgress - currentItem.progress)).toBeLessThan(12.1);
    await expect.poll(async () => (await getDownloads(request)).length).toBe(1);
  });

  test('multiple downloads keep unique IDs and the single popup safely switches exact items', async ({ page, request }) => {
    await gotoApp(page);

    const urls = [
      `${FIXTURE_BASE}/files/slow-media?name=Download%20A.mp4&mime=video/mp4&profile=5mb&delayMs=75`,
      `${FIXTURE_BASE}/files/slow-media?name=Download%20B.webm&mime=video/webm&profile=5mb&delayMs=75`,
      `${FIXTURE_BASE}/files/slow-media?name=Download%20C.mkv&mime=video/x-matroska&profile=5mb&delayMs=75`,
    ];

    const created: any[] = [];
    for (const [index, url] of urls.entries()) {
      const { item } = await createDownloadViaModal(page, url, { action: 'now' });
      created.push(item);
      if (index < urls.length - 1) {
        await page.getByTestId('idm-hide-button').click();
      }
    }

    expect(new Set(created.map((entry) => entry.id)).size).toBe(3);
    await expect.poll(async () => (await getDownloads(request)).length).toBe(3);

    if (await page.getByTestId('idm-progress-modal').isVisible().catch(() => false)) {
      await page.getByTestId('idm-hide-button').click();
    }

    await openDownloadsView(page);
    for (const entry of created) {
      await expect(page.locator(`[data-download-id="${entry.id}"]`)).toBeVisible();
      await expect(page.getByTestId(`download-filename-${entry.id}`)).toHaveText(entry.filename);
    }

    await page.getByTestId(`open-idm-progress-${created[1].id}`).click();
    await expect(page.getByTestId('idm-download-id')).toHaveText(created[1].id);
    await expect(page.getByTestId('idm-filename-inline')).toHaveText(created[1].filename);

    await page.getByTestId('idm-hide-button').click();
    await page.getByTestId(`open-idm-progress-${created[0].id}`).click();
    await expect(page.getByTestId('idm-download-id')).toHaveText(created[0].id);
    await expect(page.getByTestId('idm-filename-inline')).toHaveText(created[0].filename);
  });

  test('probe and media quality preview do not auto-start downloads, and Start Later stays queued after refresh', async ({ page, request }) => {
    await gotoApp(page);

    await page.getByRole('button', { name: /new download|add download/i }).first().click();
    await expect(page.getByTestId('add-download-modal')).toBeVisible();
    await page.getByTestId('download-url-input').fill(`${FIXTURE_BASE}/files/idm-video.mp4`);
    await expect(page.getByTestId('download-filename-input')).toHaveValue(/Actual Video Title\.mp4/, { timeout: 20_000 });
    await expect.poll(async () => (await getDownloads(request)).length).toBe(0);
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByTestId('add-download-modal')).toBeHidden();

    await page.locator('aside').getByRole('button', { name: /media sniffer/i }).click();
    await page.getByRole('textbox').fill(`${FIXTURE_BASE}/page/video`);
    await page.getByRole('button', { name: /analyze video source/i }).click();
    await expect(page.getByText(/available dynamic resolutions/i)).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await getDownloads(request)).length).toBe(0);

    await page.getByRole('button', { name: /start later/i }).click();
    await expect.poll(async () => (await getDownloads(request)).length).toBe(1);

    let queuedItem = (await getDownloads(request))[0];
    expect(queuedItem.status).toBe('queued');
    expect(queuedItem.downloadedBytes).toBe(0);
    await expect(page.getByTestId('idm-progress-modal')).toHaveCount(0);

    await page.reload();
    queuedItem = (await getDownloads(request))[0];
    expect(queuedItem.status).toBe('queued');
    expect(queuedItem.downloadedBytes).toBe(0);

    await page.waitForTimeout(2000);
    queuedItem = (await getDownloads(request))[0];
    expect(queuedItem.status).toBe('queued');
  });

  test('the popup supports keyboard access, focus return, reduced motion, and responsive viewports', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);

    const { item } = await createDownloadViaModal(
      page,
      `${FIXTURE_BASE}/files/slow-media?name=Accessibility%20Demo.mp4&mime=video/mp4&profile=5mb&delayMs=70`,
      { action: 'now', expectedFilename: /Accessibility Demo\.mp4/ }
    );

    await page.getByTestId('idm-hide-button').click();
    const opener = await openPopupForDownload(page, item.id);
    await opener.focus();
    await opener.press('Enter');
    await expect(page.getByTestId('idm-progress-modal')).toBeVisible();
    await page.waitForTimeout(100);

    const activeInsideDialog = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const dialog = document.querySelector('[data-testid="idm-progress-modal"]');
      return !!active && !!dialog && dialog.contains(active);
    });
    expect(activeInsideDialog).toBeTruthy();

    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Tab');
      const focusedInside = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector('[data-testid="idm-progress-modal"]');
        return !!active && !!dialog && dialog.contains(active);
      });
      expect(focusedInside).toBeTruthy();
    }

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('idm-progress-modal')).toBeHidden();
    await expect(page.getByTestId(`open-idm-progress-${item.id}`)).toBeFocused();

    await openPopupForDownload(page, item.id);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      const box = await page.getByTestId('idm-progress-modal').boundingBox();
      expect(box).not.toBeNull();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByTestId('idm-hide-button')).toBeVisible();
      await expect(page.getByTestId('idm-filename-inline')).toBeVisible();
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect.poll(async () => (await getDownload(request, item.id)).status).toBe('downloading');
  });

  test('browser error UX reports real 404, 403, 500, network, invalid URL, and permission failures', async ({ page, request }) => {
    await resetAppState(request, 0);
    await gotoApp(page);

    for (const scenario of [
      { label: '404', url: `${FIXTURE_BASE}/error/404`, expected: /404/i },
      { label: '403', url: `${FIXTURE_BASE}/error/403`, expected: /403/i },
      { label: '500', url: `${FIXTURE_BASE}/error/500`, expected: /500/i },
      { label: 'network', url: `${FIXTURE_BASE}/files/network-drop.mp4`, expected: /(drop|incomplete|socket|network|failed|aborted)/i },
    ]) {
      const { item } = await createDownloadViaModal(page, scenario.url, { action: 'now' });
      await expect.poll(async () => (await getDownload(request, item.id)).status, { timeout: 30_000 }).toBe('failed');
      await expect(page.getByTestId('idm-status')).toHaveText('Failed');
      await expect(page.getByTestId('idm-error-text')).toContainText(scenario.expected);
      await page.getByTestId('idm-hide-button').click();
    }

    await page.getByRole('button', { name: /new download|add download/i }).first().click();
    await expect(page.getByTestId('add-download-modal')).toBeVisible();
    await page.getByTestId('download-url-input').fill('http://:');
    await expect(page.getByTestId('download-probe-error')).toBeVisible();
    await expect(page.getByTestId('download-probe-error')).toContainText(/invalid|url/i);
    await page.getByRole('button', { name: /^cancel$/i }).click();

    const badDestination = path.join(process.cwd(), 'package.json');
    const { item: badDestinationItem } = await createDownloadViaModal(page, `${FIXTURE_BASE}/files/idm-video.mp4`, {
      action: 'now',
      expectedFilename: /Actual Video Title\.mp4/,
      destinationDir: badDestination,
    });
    await expect.poll(async () => (await getDownload(request, badDestinationItem.id)).status, { timeout: 30_000 }).toBe('failed');
    await expect(page.getByTestId('idm-status')).toHaveText('Failed');
    await expect(page.getByTestId('idm-error-text')).toContainText(/not a directory|enotdir|permission|access|eisdir/i);
  });
});
