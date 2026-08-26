document.addEventListener('DOMContentLoaded', async () => {
  const daemonStatus = document.getElementById('daemonStatus');
  const currentSpeed = document.getElementById('currentSpeed');
  const interceptToggle = document.getElementById('interceptToggle');
  const openAppBtn = document.getElementById('openAppBtn');
  const downloadCurrentBtn = document.getElementById('downloadCurrentBtn');

  const getStorage = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
    } catch {}
    return null;
  };

  const storage = getStorage();
  if (storage) {
    storage.get(['interceptionEnabled'], (data) => {
      if (chrome?.runtime?.lastError) return;
      if (data && data.interceptionEnabled !== undefined && interceptToggle) {
        interceptToggle.checked = data.interceptionEnabled;
      }
    });

    if (interceptToggle) {
      interceptToggle.addEventListener('change', () => {
        storage.set({ interceptionEnabled: interceptToggle.checked });
      });
    }
  }

  if (downloadCurrentBtn) {
    downloadCurrentBtn.addEventListener('click', async () => {
      try {
        const tabsApi = (typeof chrome !== 'undefined' && chrome.tabs) ? chrome.tabs : (typeof browser !== 'undefined' && browser.tabs) ? browser.tabs : null;
        if (!tabsApi) return;

        const [tab] = await tabsApi.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          tabsApi.sendMessage(
            tab.id,
            {
              type: 'SHOW_DOWNLOAD_MODAL',
              url: tab.url
            },
            (res) => {
              const err = chrome?.runtime?.lastError || browser?.runtime?.lastError;
              if (err || !res?.success) {
                if (chrome.scripting && chrome.scripting.executeScript) {
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    files: ['content.js']
                  }, () => {
                    if (chrome.runtime?.lastError) return;
                    tabsApi.sendMessage(tab.id, { type: 'SHOW_DOWNLOAD_MODAL', url: tab.url }, () => {
                      if (chrome.runtime?.lastError) {}
                    });
                  });
                }
              }
            }
          );
          window.close();
        }
      } catch (err) {
        console.warn('[G1DM Popup] Download current tab failed:', err);
      }
    });
  }

  if (openAppBtn) {
    openAppBtn.addEventListener('click', () => {
      const tabsApi = (typeof chrome !== 'undefined' && chrome.tabs) ? chrome.tabs : (typeof browser !== 'undefined' && browser.tabs) ? browser.tabs : null;
      if (!tabsApi) return;

      tabsApi.query({}, (tabs) => {
        const existing = tabs?.find((t) => t.url && (t.url.startsWith('http://127.0.0.1:8055') || t.url.startsWith('http://localhost:8055')));
        if (existing && existing.id) {
          tabsApi.update(existing.id, { active: true });
          if (existing.windowId && chrome?.windows?.update) {
            chrome.windows.update(existing.windowId, { focused: true });
          }
          if (tabsApi.reload) tabsApi.reload(existing.id);
        } else {
          tabsApi.create({ url: 'http://127.0.0.1:8055' });
        }
        window.close();
      });
    });
  }

  const updateStatusUI = (metrics) => {
    if (daemonStatus) {
      daemonStatus.innerText = 'Connected';
      daemonStatus.className = 'status-badge status-online';
    }
    if (currentSpeed) {
      const speedBytes = metrics?.network?.activeDownloadSpeed || 0;
      if (speedBytes > 1024 * 1024) {
        currentSpeed.innerText = `${(speedBytes / 1024 / 1024).toFixed(2)} MB/s`;
      } else {
        currentSpeed.innerText = `${(speedBytes / 1024).toFixed(1)} KB/s`;
      }
    }
  };

  const setOfflineUI = () => {
    if (daemonStatus) {
      daemonStatus.innerText = 'Offline';
      daemonStatus.className = 'status-badge status-offline';
    }
    if (currentSpeed) {
      currentSpeed.innerText = '0 KB/s';
    }
  };

  const checkDirectHttpMetrics = () => {
    fetch('http://127.0.0.1:8055/api/metrics')
      .then((r) => r.json())
      .then((metrics) => updateStatusUI(metrics))
      .catch(() => setOfflineUI());
  };

  // Query engine health
  try {
    const runtime = (typeof chrome !== 'undefined' && chrome.runtime?.id) ? chrome.runtime : (typeof browser !== 'undefined' && browser.runtime?.id) ? browser.runtime : null;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'TEST_CONNECTION' }, (res) => {
        if (runtime.lastError || !res?.success) {
          checkDirectHttpMetrics();
        } else {
          updateStatusUI(res.metrics);
        }
      });
    } else {
      checkDirectHttpMetrics();
    }
  } catch {
    checkDirectHttpMetrics();
  }
});
