
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

function openOrFocusG1DMTab(url) {
  chrome.tabs.query({ url: `http://127.0.0.1:${G1DM_API_PORT}/*` }, (tabs) => {
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "g1dm-download-link") {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (targetUrl) {
      sendToG1DM(targetUrl);
    }
  } else if (info.menuItemId === "g1dm-download-page") {
    if (tab && tab.url) {
      openOrFocusG1DMTab("http://127.0.0.1:8055/#batch?url=" + encodeURIComponent(tab.url));
    }
  }
});

// Download Interception
chrome.downloads.onCreated.addListener((downloadItem) => {
  chrome.storage.local.get(["interceptionEnabled"], (data) => {
    if (data.interceptionEnabled !== false) {
      // Send to G1DM and cancel browser download
      sendToG1DM(downloadItem.url, downloadItem.filename);
      chrome.downloads.cancel(downloadItem.id);
    }
  });
});

async function sendToG1DM(url, filename) {
  try {
    const res = await fetch(`http://127.0.0.1:${G1DM_API_PORT}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, filename, startImmediately: true })
    });
    const json = await res.json();
    console.log('Successfully enqueued to G1DM:', json);
  } catch (err) {
    console.warn('G1DM server not reachable:', err);
  }
}
