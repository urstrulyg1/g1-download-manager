document.addEventListener('DOMContentLoaded', () => {
  const extInput = document.getElementById('extensionsInput');
  const domInput = document.getElementById('domainsInput');
  const saveBtn = document.getElementById('saveBtn');
  const savedMsg = document.getElementById('savedMsg');

  chrome.storage.local.get(['interceptExtensions', 'excludeDomains'], (data) => {
    if (data.interceptExtensions) {
      extInput.value = data.interceptExtensions.join(', ');
    }
    if (data.excludeDomains) {
      domInput.value = data.excludeDomains.join(', ');
    }
  });

  saveBtn.addEventListener('click', () => {
    const extensions = extInput.value
      .split(',')
      .map((s) => s.trim().replace('.', ''))
      .filter(Boolean);

    const domains = domInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    chrome.storage.local.set({ interceptExtensions: extensions, excludeDomains: domains }, () => {
      savedMsg.style.display = 'block';
      setTimeout(() => (savedMsg.style.display = 'none'), 2500);
    });
  });
});
