// G1DM Chrome/Chromium Companion Extension Background Service Worker
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api`;

chrome.runtime.onInstalled.addListener(() => {


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

// Browser downloads are intentionally not intercepted after creation.
// Context-menu/content-script actions submit URLs to G1DM before a browser
// download is started; G1DM's DownloadEngine owns the transfer.

// Messages from content scripts / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_URL') {
    const container = message.container || message.format || 'mp4';
    const formatSpec = message.formatSpec || message.mediaFormatSpec;
    sendToG1DM(
      message.url,
      message.filename,
      message.category,
      formatSpec,
      container,
      message.startImmediately !== false
    ).then((result) => {
      sendResponse({ success: true, result });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  } else if (message.type === 'PROBE_URL') {
    probeUrl(message.url).then(sendResponse);
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

async function sendToG1DM(url, filename, category, formatSpec, container, startImmediately = true) {
  const payload = {
    url,
    filename,
    category,
    formatSpec,
    container,
    startImmediately,
  };

  // Primary attempt: Direct HTTP to core daemon from service worker (fast & reliable)
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
