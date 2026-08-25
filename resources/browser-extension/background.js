
// G1DM Browser Companion Extension Background Service Worker
const G1DM_API_PORT = 8055;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "g1dm-download-link",
    title: "Download with G1DM",
    contexts: ["link", "image", "video", "audio"]
  });

  chrome.contextMenus.create({
    id: "g1dm-download-page",
    title: "Download all links on this page with G1DM",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "g1dm-download-link") {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      sendToG1DM(targetUrl);
    }
  } else if (info.menuItemId === "g1dm-download-page") {
    if (tab && tab.url) {
      chrome.tabs.create({ url: "http://127.0.0.1:8055/#batch?url=" + encodeURIComponent(tab.url) });
    }
  }
});

// Download Interception
chrome.downloads.onCreated.addListener((downloadItem) => {
  chrome.storage.local.get(["interceptionEnabled"], (data) => {
    if (data.interceptionEnabled !== false) {
      // The browser reports a full native path (or sometimes just a basename).
      // Extract a safe basename here; the G1DM engine then re-runs its full
      // filename resolution pipeline (user name -> media title ->
      // Content-Disposition -> page title -> URL filename -> safe fallback),
      // so a generic or empty name here does NOT lock in a bad filename.
      const suggested = sanitizeBrowserFilename(downloadItem.filename);
      sendToG1DM(downloadItem.url, suggested);
      chrome.downloads.cancel(downloadItem.id);
    }
  });
});

// Strip directory components the browser included and remove characters that
// are illegal on common filesystems. Multi-byte (Unicode) characters are kept.
function sanitizeBrowserFilename(rawName) {
  if (!rawName) return undefined;
  let name = String(rawName);
  // Both Windows and POSIX separators may appear across platforms.
  const parts = name.split(/[\\/]/);
  name = parts[parts.length - 1] || name;
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  name = name.replace(/\.{2,}/g, '_');
  if (!name || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    return undefined;
  }
  return name;
}

async function sendToG1DM(url, filename) {
  try {
    const payload = { url, startImmediately: true };
    if (filename) payload.filename = filename;
    const res = await fetch(\`http://127.0.0.1:\${G1DM_API_PORT}/api/downloads\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.log('Successfully enqueued to G1DM:', json);
  } catch (err) {
    console.warn('G1DM server not reachable:', err);
  }
}
