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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'SHOW_DOWNLOAD_MODAL',
            url: tab.url
          },
          (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              if (chrome.scripting && chrome.scripting.executeScript) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id, allFrames: true },
                  files: ['content.js']
                }, () => {
                  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: tab.url });
                });
              }
            }
          }
        );
        window.close();
      }
    });
  }

  openAppBtn.addEventListener('click', () => {
    chrome.tabs.query({}, (tabs) => {
      const existing = tabs?.find((t) => t.url && (t.url.startsWith('http://127.0.0.1:8055') || t.url.startsWith('http://localhost:8055')));
      if (existing && existing.id) {
        chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId) {
          chrome.windows.update(existing.windowId, { focused: true });
        }
        chrome.tabs.reload(existing.id);
      } else {
        chrome.tabs.create({ url: 'http://127.0.0.1:8055' });
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
