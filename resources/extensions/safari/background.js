// G1DM Safari Companion Extension Background Service Worker
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api`;
const DEFAULT_EXTENSIONS = ['zip', 'exe', 'iso', 'dmg', 'tar', 'gz', 'mp4', 'mkv', 'mp3', 'pdf', '7z', 'rar', 'msi', 'apk', 'deb', 'rpm'];

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get(['interceptionEnabled', 'interceptExtensions', 'excludeDomains'], (data) => {
    if (data.interceptionEnabled === undefined) {
      browser.storage.local.set({
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
  chrome.tabs.query({}, (tabs) => {
    const targetBase = `http://127.0.0.1:${G1DM_PORT}`;
    const targetHost = `http://localhost:${G1DM_PORT}`;
    const existing = tabs?.find((t) => t.url && (t.url.startsWith(targetBase) || t.url.startsWith(targetHost)));
    if (existing && existing.id) {
      chrome.tabs.update(existing.id, { url: url || existing.url, active: true });
      if (existing.windowId) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
      chrome.tabs.reload(existing.id);
    } else {
      chrome.tabs.create({ url: url || targetBase });
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
              if (chrome.tabs && chrome.tabs.executeScript) {
                chrome.tabs.executeScript(tab.id, { file: 'content.js', allFrames: true }, () => {
                  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl });
                });
              }
            }
          }
        );
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

// Browser downloads are intentionally not intercepted after creation.
// Context-menu/content-script actions submit URLs to G1DM before a browser
// download is started; G1DM's DownloadEngine owns the transfer.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_URL') {
    const container = message.container || message.format || 'mp4';
    const formatSpec = message.formatSpec || message.mediaFormatSpec;
    sendToG1DM({
      url: message.url,
      filename: message.filename,
      category: message.category,
      formatSpec,
      mediaFormatSpec: formatSpec,
      container,
      codec: message.codec,
      height: message.height,
      qualityLabel: message.qualityLabel,
      clarity: message.clarity,
      resolution: message.resolution,
      startImmediately: message.startImmediately !== false
    }).then((result) => {
      sendResponse({ success: true, result });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  } else if (message.type === 'PROBE_URL') {
    probeUrl(message.url).then(sendResponse);
    return true; // async
  } else if (message.type === 'SECURE_DETECT') {
    secureDetectMedia(message.url).then(sendResponse);
    return true; // async
  } else if (message.type === 'OPEN_G1DM_STUDIO') {
    const target = message.url ? `http://127.0.0.1:${G1DM_PORT}/#media?url=${encodeURIComponent(message.url)}` : `http://127.0.0.1:${G1DM_PORT}/#media`;
    openOrFocusG1DMTab(target);
    sendResponse({ success: true });
  } else if (message.type === 'TEST_CONNECTION') {
    testG1DMConnection().then(sendResponse);
    return true; // async
  }
});

async function secureDetectMedia(url) {
  try {
    const res = await fetch(`${G1DM_API_BASE}/media/secure-detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[G1DM Companion] Secure detect request failed:', err);
  }
  return { error: 'Secure detect failed' };
}

async function probeUrl(url) {
  try {
    const res = await fetch(`${G1DM_API_BASE}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[G1DM Companion] Probe request failed:', err);
  }
  return { error: 'Probe failed' };
}

async function sendToG1DM(payloadOrUrl, filename, category, formatSpec, container, startImmediately = true) {
  const payload = typeof payloadOrUrl === 'object' && payloadOrUrl !== null
    ? { startImmediately: true, ...payloadOrUrl }
    : {
        url: payloadOrUrl,
        filename,
        category,
        formatSpec,
        mediaFormatSpec: formatSpec,
        container,
        startImmediately,
      };

  // Primary attempt: Direct HTTP to core daemon
  try {
    const res = await fetch(`${G1DM_API_BASE}/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json();
      console.log('[G1DM Companion] Successfully enqueued download:', json);
      return json;
    }
  } catch (err) {
    console.warn('[G1DM Companion] HTTP fetch failed, trying Native Messaging Host...', err);
  }

  // Secondary attempt: Native Messaging Host
  try {
    const nativeRes = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        'com.g1dm.native_host',
        { command: 'add', ...payload },
        (res) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(res);
        }
      );
    });
    if (nativeRes && nativeRes.success) {
      return nativeRes.result;
    }
  } catch (nativeErr) {
    console.warn('[G1DM Companion] Native host also failed:', nativeErr);
  }

  throw new Error('Could not connect to G1DM core engine.');
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
