document.addEventListener('DOMContentLoaded', () => {
  const extInput = document.getElementById('extensionsInput');
  const domInput = document.getElementById('domainsInput');
  const formatSelect = document.getElementById('preferredFormatSelect');
  const saveBtn = document.getElementById('saveBtn');
  const savedMsg = document.getElementById('savedMsg');

  const getStorage = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
    } catch {}
    return null;
  };

  const storage = getStorage();
  if (storage) {
    storage.get(['interceptExtensions', 'excludeDomains', 'preferredVideoFormat'], (data) => {
      if (chrome?.runtime?.lastError) return;
      if (data?.interceptExtensions && extInput) {
        extInput.value = data.interceptExtensions.join(', ');
      }
      if (data?.excludeDomains && domInput) {
        domInput.value = data.excludeDomains.join(', ');
      }
      if (data?.preferredVideoFormat && formatSelect) {
        formatSelect.value = data.preferredVideoFormat;
      }
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const extensions = extInput.value
          .split(',')
          .map((s) => s.trim().replace('.', ''))
          .filter(Boolean);

        const domains = domInput.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const preferredVideoFormat = formatSelect ? formatSelect.value : 'MKV';

        storage.set({
          interceptExtensions: extensions,
          excludeDomains: domains,
          preferredVideoFormat
        }, () => {
          if (savedMsg) {
            savedMsg.style.display = 'block';
            setTimeout(() => (savedMsg.style.display = 'none'), 2500);
          }
        });
      });
    }
  }
});
