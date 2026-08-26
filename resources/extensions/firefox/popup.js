document.addEventListener('DOMContentLoaded', async () => {
  const daemonStatus = document.getElementById('daemonStatus');
  const currentSpeed = document.getElementById('currentSpeed');
  const interceptToggle = document.getElementById('interceptToggle');
  const openAppBtn = document.getElementById('openAppBtn');
  const downloadCurrentBtn = document.getElementById('downloadCurrentBtn');

  // Load saved interception state
  chrome.storage.local.get(['interceptionEnabled'], (data) => {
    if (data.interceptionEnabled !== undefined) {
      interceptToggle.checked = data.interceptionEnabled;
    }
  });

  interceptToggle.addEventListener('change', () => {
    chrome.storage.local.set({ interceptionEnabled: interceptToggle.checked });
  });

  if (downloadCurrentBtn) {
    downloadCurrentBtn.addEventListener('click', async () => {
      const runtimeTabs = (typeof browser !== 'undefined' && browser.tabs) ? browser.tabs : chrome.tabs;
      const [tab] = await runtimeTabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        runtimeTabs.sendMessage(
          tab.id,
          {
            type: 'SHOW_DOWNLOAD_MODAL',
            url: tab.url
          },
          (res) => {
            if (runtimeTabs.executeScript) {
              runtimeTabs.executeScript(tab.id, { file: 'content.js', allFrames: true })
                .then(() => runtimeTabs.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: tab.url }))
                .catch(() => {});
            }
          }
        );
        window.close();
      }
    });
  }

  openAppBtn.addEventListener('click', () => {
    const runtimeTabs = (typeof browser !== 'undefined' && browser.tabs) ? browser.tabs : chrome.tabs;
    runtimeTabs.query({}, (tabs) => {
      const existing = tabs?.find((t) => t.url && (t.url.startsWith('http://127.0.0.1:8055') || t.url.startsWith('http://localhost:8055')));
      if (existing && existing.id) {
        runtimeTabs.update(existing.id, { active: true });
        if (existing.windowId) {
          chrome.windows.update(existing.windowId, { focused: true });
        }
        if (runtimeTabs.reload) runtimeTabs.reload(existing.id);
      } else {
        runtimeTabs.create({ url: 'http://127.0.0.1:8055' });
      }
      window.close();
    });
  });

  // Query engine health
  chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' }, (res) => {
    if (res && res.success) {
      daemonStatus.innerText = 'Connected';
      daemonStatus.className = 'status-badge status-online';

      const speedBytes = res.metrics?.network?.activeDownloadSpeed || 0;
      if (speedBytes > 1024 * 1024) {
        currentSpeed.innerText = `${(speedBytes / 1024 / 1024).toFixed(2)} MB/s`;
      } else {
        currentSpeed.innerText = `${(speedBytes / 1024).toFixed(1)} KB/s`;
      }
    } else {
      daemonStatus.innerText = 'Offline';
      daemonStatus.className = 'status-badge status-offline';
    }
  });
});
