// G1DM Chrome/Chromium Companion Extension Background Service Worker
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api/v1`;

const DEFAULT_EXTENSIONS = [
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'tgz',
  'exe', 'msi', 'deb', 'rpm', 'apk', 'appimage', 'pkg', 'bin',
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v', 'ts', 'm3u8',
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['interceptionEnabled', 'interceptExtensions', 'excludeDomains'], (data) => {
    if (data.interceptionEnabled === undefined) {
      chrome.storage.local.set({
        interceptionEnabled: true,
        interceptExtensions: DEFAULT_EXTENSIONS,
        excludeDomains: [],
      });
    }
  });

  // Create context menus
  chrome.contextMenus.create({
    id: 'g1dm-download-link',
    title: 'Download with G1DM',
    contexts: ['link', 'image', 'video', 'audio'],
  });

  chrome.contextMenus.create({
    id: 'g1dm-download-page-links',
    title: 'Download all links on page with G1DM',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'g1dm-open-manager',
    title: 'Open G1DM Download Manager',
    contexts: ['action'],
  });
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'g1dm-download-link') {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      sendToG1DM(targetUrl);
    }
  } else if (info.menuItemId === 'g1dm-download-page-links') {
    if (tab && tab.url) {
      chrome.tabs.create({ url: `http://127.0.0.1:${G1DM_PORT}/#batch?url=${encodeURIComponent(tab.url)}` });
    }
  } else if (info.menuItemId === 'g1dm-open-manager') {
    chrome.tabs.create({ url: `http://127.0.0.1:${G1DM_PORT}` });
  }
});

// Download Interception Engine
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const data = await chrome.storage.local.get(['interceptionEnabled', 'interceptExtensions', 'excludeDomains']);
  if (data.interceptionEnabled === false) return;

  const url = downloadItem.url;
  if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome-extension:')) {
    return;
  }

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();

    // Check domain exclusions
    if (data.excludeDomains && data.excludeDomains.some((d) => domain.includes(d.toLowerCase()))) {
      return;
    }

    // Check extension rules
    const filename = downloadItem.filename || parsed.pathname;
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const exts = data.interceptExtensions || DEFAULT_EXTENSIONS;

    if (exts.includes(ext)) {
      // Cancel browser download and forward to G1DM
      chrome.downloads.cancel(downloadItem.id);
      sendToG1DM(url, filename);
    }
  } catch (err) {
    console.warn('Interception check error:', err);
  }
});

// Messages from content scripts / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_URL') {
    sendToG1DM(message.url, message.filename, message.category);
    sendResponse({ success: true });
  } else if (message.type === 'TEST_CONNECTION') {
    testG1DMConnection().then(sendResponse);
    return true; // async
  }
});

async function sendToG1DM(url, filename, category) {
  // First attempt: Native Messaging Host if configured
  try {
    const nativeRes = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        'com.g1dm.native_host',
        { command: 'add', url, filename, category },
        (res) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(res);
        }
      );
    });
    if (nativeRes && nativeRes.success) return;
  } catch {
    // Fallback to local HTTP loopback API
  }

  try {
    const res = await fetch(`${G1DM_API_BASE}/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        filename,
        category,
        startImmediately: true,
      }),
    });
    const json = await res.json();
    console.log('[G1DM Companion] Enqueued download:', json);
  } catch (err) {
    console.warn('[G1DM Companion] Core daemon unreachable at', G1DM_API_BASE, err);
  }
}

async function testG1DMConnection() {
  try {
    const res = await fetch(`http://127.0.0.1:${G1DM_PORT}/api/metrics`);
    const metrics = await res.json();
    return { success: true, metrics };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
