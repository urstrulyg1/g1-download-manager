
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

// This companion never invokes browser download APIs. It only submits URLs
// to G1DM; the core DownloadEngine performs the transfer.

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
