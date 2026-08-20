import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';

export class BrowserIntegrationService {
  public static ensureExtensionFiles(): void {
    const extensionDir = path.join(process.cwd(), 'resources', 'browser-extension');
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
    }

    // Write manifest.json
    const manifest = {
      manifest_version: 3,
      name: 'G1DM — Internet Download Manager Integration',
      version: '1.0.0',
      description: 'Official companion extension for G1DM Next-Generation Download Manager',
      permissions: ['downloads', 'contextMenus', 'storage', 'activeTab'],
      host_permissions: ['<all_urls>'],
      background: {
        service_worker: 'background.js',
      },
      action: {
        default_popup: 'popup.html',
        default_title: 'G1DM Download Manager',
      },
      icons: {
        16: 'icon16.png',
        48: 'icon48.png',
        128: 'icon128.png',
      },
    };

    fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Write background.js
    const backgroundJs = `
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
      // Send to G1DM and cancel browser download
      sendToG1DM(downloadItem.url, downloadItem.filename);
      chrome.downloads.cancel(downloadItem.id);
    }
  });
});

async function sendToG1DM(url, filename) {
  try {
    const res = await fetch(\`http://127.0.0.1:\${G1DM_API_PORT}/api/downloads\`, {
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
`;
    fs.writeFileSync(path.join(extensionDir, 'background.js'), backgroundJs);

    // Write popup.html
    const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 320px; margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
    h2 { margin: 0 0 12px 0; font-size: 16px; color: #3b82f6; display: flex; align-items: center; gap: 8px; }
    .status { font-size: 12px; color: #94a3b8; margin-bottom: 16px; }
    button { width: 100%; padding: 8px 12px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-size: 13px; }
  </style>
</head>
<body>
  <h2>⚡ G1DM Companion</h2>
  <div class="status">Connected to G1DM Core Engine</div>
  <div class="toggle-row">
    <span>Automatic Interception</span>
    <input type="checkbox" id="interceptToggle" checked>
  </div>
  <button id="openApp">Open Download Manager</button>
  <script>
    document.getElementById('openApp').addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://127.0.0.1:8055' });
    });
  </script>
</body>
</html>`;
    fs.writeFileSync(path.join(extensionDir, 'popup.html'), popupHtml);
  }
}
