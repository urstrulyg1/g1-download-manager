// G1DM Chrome/Chromium Companion Extension Background Service Worker
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api`;

function logToCore(level, message, details) {
  console.log(`[G1DM Extension] ${message}`, details || '');
  fetch(`${G1DM_API_BASE}/extension/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, details, source: 'Chrome Extension' })
  }).catch(() => {});
}

// Notify backend when background service worker wakes up
logToCore('info', 'Chrome companion extension active & connected.');

chrome.runtime.onInstalled.addListener(() => {
  logToCore('info', 'Extension installed/updated — registered context menus.');

  // Cleanly remove any old context menus before re-creating
  if (chrome.contextMenus && chrome.contextMenus.removeAll) {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime?.lastError) {}
      createMenus();
    });
  } else {
    createMenus();
  }
});

function createMenus() {
  try {
    chrome.contextMenus.create({
      id: 'g1dm-download-link',
      title: 'Download with G1DM',
      contexts: ['link', 'image', 'video', 'audio'],
    }, () => { if (chrome.runtime?.lastError) {} });

    chrome.contextMenus.create({
      id: 'g1dm-download-page-links',
      title: 'Download all links on page with G1DM',
      contexts: ['page'],
    }, () => { if (chrome.runtime?.lastError) {} });

    chrome.contextMenus.create({
      id: 'g1dm-open-manager',
      title: 'Open G1DM Download Manager',
      contexts: ['action'],
    }, () => { if (chrome.runtime?.lastError) {} });
  } catch {}
}

function openOrFocusG1DMTab(url) {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime?.lastError) return;
    const targetBase = `http://127.0.0.1:${G1DM_PORT}`;
    const targetHost = `http://localhost:${G1DM_PORT}`;
    const existing = tabs?.find((t) => t.url && (t.url.startsWith(targetBase) || t.url.startsWith(targetHost)));
    if (existing && existing.id) {
      chrome.tabs.update(existing.id, { url: url || existing.url, active: true }, () => {
        if (chrome.runtime?.lastError) {}
      });
      if (existing.windowId) {
        chrome.windows.update(existing.windowId, { focused: true }, () => {
          if (chrome.runtime?.lastError) {}
        });
      }
      chrome.tabs.reload(existing.id);
    } else {
      chrome.tabs.create({ url: url || targetBase }, () => {
        if (chrome.runtime?.lastError) {}
      });
    }
  });
}

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'g1dm-download-link') {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      logToCore('info', `Right-click "Download with G1DM" selected for URL: ${targetUrl}`);
      if (tab && tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl },
          (response) => {
            if (chrome.runtime.lastError || !response?.success) {
              // Inject content script into the active page so the Download File Info modal opens directly on the page
              if (chrome.scripting && chrome.scripting.executeScript) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id, allFrames: true },
                  files: ['content.js']
                }, () => {
                  if (chrome.runtime?.lastError) return;
                  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl }, () => {
                    if (chrome.runtime?.lastError) {}
                  });
                });
              }
            }
          }
        );
      }
    }
  } else if (info.menuItemId === 'g1dm-download-page-links') {
    if (tab && tab.url) {
      logToCore('info', `Batch link extractor triggered for page: ${tab.url}`);
      openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}/#batch?url=${encodeURIComponent(tab.url)}`);
    }
  } else if (info.menuItemId === 'g1dm-open-manager') {
    openOrFocusG1DMTab(`http://127.0.0.1:${G1DM_PORT}`);
  }
});

// Messages from content scripts / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'DOWNLOAD_URL') {
    const container = message.container || message.format || 'mp4';
    const formatSpec = message.formatSpec || message.mediaFormatSpec;
    logToCore('info', `Extension submitting download: "${message.filename || message.url}" (${message.category || 'other'})`);
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
      thumbnailUrl: message.thumbnailUrl,
      source: 'browser-extension',
      startImmediately: message.startImmediately !== false
    }).then((result) => {
      logToCore('info', `Download accepted by core engine: "${message.filename || message.url}"`);
      sendResponse({ success: true, result });
    }).catch((err) => {
      logToCore('error', `Download submission failed: ${err.message}`);
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  } else if (message.type === 'PROBE_URL') {
    logToCore('info', `Probing video stream URL: ${message.url}`);
    probeUrl(message.url).then((res) => {
      sendResponse(res || { error: 'Probe failed' });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // async
  } else if (message.type === 'SECURE_DETECT') {
    secureDetectMedia(message.url).then((res) => {
      sendResponse(res || { error: 'Secure detect failed' });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // async
  } else if (message.type === 'OPEN_G1DM_STUDIO') {
    logToCore('info', `Opening G1DM Studio for URL: ${message.url || 'general'}`);
    const target = message.url ? `http://127.0.0.1:${G1DM_PORT}/#media?url=${encodeURIComponent(message.url)}` : `http://127.0.0.1:${G1DM_PORT}/#media`;
    openOrFocusG1DMTab(target);
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'GET_DOWNLOAD_PROGRESS') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}`)
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'PAUSE_DOWNLOAD') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/pause`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'RESUME_DOWNLOAD') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/resume`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'CANCEL_DOWNLOAD') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/cancel`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'RETRY_DOWNLOAD') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/retry`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'OPEN_DOWNLOAD_FILE') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/open-file`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'OPEN_DOWNLOAD_FOLDER') {
    fetch(`${G1DM_API_BASE}/downloads/${message.id}/open-folder`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'TEST_CONNECTION') {
    testG1DMConnection().then((res) => {
      sendResponse(res);
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
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
