// G1DM Firefox Companion Extension Background Script
const G1DM_PORT = 8055;
const G1DM_API_BASE = `http://127.0.0.1:${G1DM_PORT}/api`;
const DEFAULT_EXTENSIONS = ['zip', 'exe', 'iso', 'dmg', 'tar', 'gz', 'mp4', 'mkv', 'mp3', 'pdf', '7z', 'rar', 'msi', 'apk', 'deb', 'rpm'];

const getApi = () => (typeof browser !== 'undefined' ? browser : chrome);

const extApi = getApi();

extApi.runtime.onInstalled.addListener(() => {
  if (extApi.storage && extApi.storage.local) {
    extApi.storage.local.get(['interceptionEnabled', 'interceptExtensions', 'excludeDomains'], (data) => {
      if (extApi.runtime.lastError) return;
      if (data.interceptionEnabled === undefined) {
        extApi.storage.local.set({
          interceptionEnabled: false,
          interceptExtensions: DEFAULT_EXTENSIONS,
          excludeDomains: [],
        });
      }
    });
  }

  const menuApi = extApi.contextMenus || (typeof chrome !== 'undefined' ? chrome.contextMenus : null);
  if (menuApi) {
    if (menuApi.removeAll) {
      menuApi.removeAll(() => createMenus(menuApi));
    } else {
      createMenus(menuApi);
    }
  }
});

function createMenus(menuApi) {
  try {
    menuApi.create({
      id: 'g1dm-download-link',
      title: 'Download with G1DM',
      contexts: ['link', 'image', 'video', 'audio'],
    }, () => { if (extApi.runtime?.lastError) {} });

    menuApi.create({
      id: 'g1dm-download-page-links',
      title: 'Download all links on page with G1DM',
      contexts: ['page'],
    }, () => { if (extApi.runtime?.lastError) {} });

    menuApi.create({
      id: 'g1dm-open-manager',
      title: 'Open G1DM Download Manager',
      contexts: ['action'],
    }, () => { if (extApi.runtime?.lastError) {} });
  } catch {}
}

function openOrFocusG1DMTab(url) {
  const tabsApi = extApi.tabs || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!tabsApi) return;

  tabsApi.query({}, (tabs) => {
    if (extApi.runtime?.lastError) return;
    const targetBase = `http://127.0.0.1:${G1DM_PORT}`;
    const targetHost = `http://localhost:${G1DM_PORT}`;
    const existing = tabs?.find((t) => t.url && (t.url.startsWith(targetBase) || t.url.startsWith(targetHost)));
    if (existing && existing.id) {
      tabsApi.update(existing.id, { url: url || existing.url, active: true }, () => {
        if (extApi.runtime?.lastError) {}
      });
      if (existing.windowId && extApi.windows?.update) {
        extApi.windows.update(existing.windowId, { focused: true }, () => {
          if (extApi.runtime?.lastError) {}
        });
      }
      if (tabsApi.reload) tabsApi.reload(existing.id);
    } else {
      tabsApi.create({ url: url || targetBase }, () => {
        if (extApi.runtime?.lastError) {}
      });
    }
  });
}

// Context menu click listener
const menuApi = extApi.contextMenus || (typeof chrome !== 'undefined' ? chrome.contextMenus : null);
if (menuApi && menuApi.onClicked) {
  menuApi.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'g1dm-download-link') {
      const targetUrl = info.linkUrl || info.srcUrl;
      if (targetUrl && tab && tab.id) {
        const tabsApi = extApi.tabs || (typeof chrome !== 'undefined' ? chrome.tabs : null);
        if (tabsApi) {
          tabsApi.sendMessage(
            tab.id,
            { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl },
            (response) => {
              const err = extApi.runtime?.lastError;
              if (err || !response?.success) {
                if (tabsApi.executeScript) {
                  tabsApi.executeScript(tab.id, { file: 'content.js', allFrames: true })
                    .then(() => {
                      tabsApi.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: targetUrl }, () => {
                        if (extApi.runtime?.lastError) {}
                      });
                    })
                    .catch(() => {});
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
}

// Messages from content scripts / popup
extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

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
    return true;
  } else if (message.type === 'PROBE_URL') {
    probeUrl(message.url).then((res) => {
      sendResponse(res || { error: 'Probe failed' });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  } else if (message.type === 'SECURE_DETECT') {
    secureDetectMedia(message.url).then((res) => {
      sendResponse(res || { error: 'Secure detect failed' });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  } else if (message.type === 'OPEN_G1DM_STUDIO') {
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
    return true;
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
    console.warn('[G1DM Firefox Companion] Secure detect request failed:', err);
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
    console.warn('[G1DM Firefox Companion] Probe request failed:', err);
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

  try {
    const res = await fetch(`${G1DM_API_BASE}/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[G1DM Firefox Companion] HTTP fetch failed, trying Native Host...', err);
  }

  try {
    const nativeRes = await new Promise((resolve, reject) => {
      extApi.runtime.sendNativeMessage(
        'com.g1dm.native_host',
        { command: 'add', ...payload },
        (res) => {
          if (extApi.runtime.lastError) reject(extApi.runtime.lastError);
          else resolve(res);
        }
      );
    });
    if (nativeRes && nativeRes.success) {
      return nativeRes.result;
    }
  } catch (nativeErr) {
    console.warn('[G1DM Firefox Companion] Native host failed:', nativeErr);
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
