// G1DM Chrome/Chromium Companion Extension Background Service Worker
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api`;

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
        interceptionEnabled: false,
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

function openOrFocusG1DMTab(url) {
  chrome.tabs.query({ url: `http://127.0.0.1:${G1DM_PORT}/*` }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { url, active: true });
      if (tabs[0].windowId) {
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url });
    }
  });
}

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'g1dm-download-link') {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      if (tab && tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl },
          (response) => {
            if (chrome.runtime.lastError || !response?.success) {
              // Fallback to desktop Web UI if content script cannot execute on restricted URL
              openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}/#add?url=${encodeURIComponent(targetUrl)}`);
            }
          }
        );
      } else {
        openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}/#add?url=${encodeURIComponent(targetUrl)}`);
      }
    }
  } else if (info.menuItemId === 'g1dm-download-page-links') {
    if (tab && tab.url) {
      openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}/#batch?url=${encodeURIComponent(tab.url)}`);
    }
  } else if (info.menuItemId === 'g1dm-open-manager') {
    openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}`);
  }
});

// Download Interception Engine
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const data = await chrome.storage.local.get(['interceptionEnabled', 'interceptExtensions', 'excludeDomains']);
  // Automatic interception is disabled by default to prevent unwanted downloads
  if (!data.interceptionEnabled) return;

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
    const container = message.container || message.format || 'mp4';
    const formatSpec = message.formatSpec || message.mediaFormatSpec;
    sendToG1DM(message.url, message.filename, message.category, formatSpec, container);
    sendResponse({ success: true });
  } else if (message.type === 'OPEN_G1DM_STUDIO') {
    const target = message.url ? `http://127.0.0.1:${G1DM_PORT}/#media?url=${encodeURIComponent(message.url)}` : `http://127.0.0.1:${G1DM_PORT}/#media`;
    openOrFocusG1DMTab(target);
    sendResponse({ success: true });
  } else if (message.type === 'TEST_CONNECTION') {
    testG1DMConnection().then(sendResponse);
    return true; // async
  }
});

async function sendToG1DM(url, filename, category, formatSpec, container) {
  // First attempt: Native Messaging Host if configured
  try {
    const nativeRes = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        'com.g1dm.native_host',
        { command: 'add', url, filename, category, formatSpec, container },
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
        formatSpec,
        container,
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
