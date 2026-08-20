document.addEventListener('DOMContentLoaded', async () => {
  const daemonStatus = document.getElementById('daemonStatus');
  const currentSpeed = document.getElementById('currentSpeed');
  const interceptToggle = document.getElementById('interceptToggle');
  const openAppBtn = document.getElementById('openAppBtn');

  // Load saved interception state
  chrome.storage.local.get(['interceptionEnabled'], (data) => {
    if (data.interceptionEnabled !== undefined) {
      interceptToggle.checked = data.interceptionEnabled;
    }
  });

  interceptToggle.addEventListener('change', () => {
    chrome.storage.local.set({ interceptionEnabled: interceptToggle.checked });
  });

  openAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://127.0.0.1:3000' });
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
