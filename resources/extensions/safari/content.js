// G1DM Content Script — Media Stream Sniffer
(function () {
  let detectedMediaUrls = new Set();
  let badgeElement = null;

  function scanMediaElements() {
    const videoElements = document.querySelectorAll('video, audio, source');
    let hasNew = false;

    videoElements.forEach((el) => {
      const src = el.src || el.getAttribute('data-src');
      if (src && !src.startsWith('blob:') && !detectedMediaUrls.has(src)) {
        detectedMediaUrls.add(src);
        hasNew = true;
      }
    });

    // Check anchor links for media files
    const links = document.querySelectorAll('a[href]');
    links.forEach((a) => {
      const href = a.href;
      if (/\.(mp4|mkv|webm|m3u8|mpd|mp3|flac|iso|zip|exe)(\?.*)?$/i.test(href) && !detectedMediaUrls.has(href)) {
        detectedMediaUrls.add(href);
        hasNew = true;
      }
    });

    if (detectedMediaUrls.size > 0 && hasNew) {
      renderFloatingBadge();
    }
  }

  function renderFloatingBadge() {
    if (badgeElement) {
      const countEl = badgeElement.querySelector('.g1dm-count');
      if (countEl) countEl.innerText = detectedMediaUrls.size;
      return;
    }

    badgeElement = document.createElement('div');
    badgeElement.id = 'g1dm-media-sniffer-badge';
    badgeElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid #3b82f6;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.3);
      padding: 10px 14px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    `;

    badgeElement.innerHTML = `
      <div style="width: 20px; height: 20px; background: #2563eb; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px;">⚡</div>
      <span>Download Media</span>
      <span class="g1dm-count" style="background: rgba(59, 130, 246, 0.25); color: #38bdf8; padding: 2px 6px; border-radius: 9999px; font-family: monospace; font-size: 11px;">${detectedMediaUrls.size}</span>
      <span style="color: #94a3b8; font-size: 14px; margin-left: 4px;" title="Dismiss">&times;</span>
    `;

    badgeElement.addEventListener('mouseenter', () => {
      badgeElement.style.transform = 'translateY(-2px) scale(1.02)';
    });
    badgeElement.addEventListener('mouseleave', () => {
      badgeElement.style.transform = 'none';
    });

    badgeElement.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN' && e.target.title === 'Dismiss') {
        badgeElement.remove();
        badgeElement = null;
        return;
      }

      // Send first detected URL or open manager
      const urlsArray = Array.from(detectedMediaUrls);
      if (urlsArray.length === 1) {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_URL',
          url: urlsArray[0],
        });
        badgeElement.innerHTML = `<span style="color: #10b981;">✓ Enqueued to G1DM</span>`;
        setTimeout(() => badgeElement?.remove(), 2500);
      } else {
        window.open(`http://127.0.0.1:3000/#media?url=${encodeURIComponent(window.location.href)}`, '_blank');
      }
    });

    document.body.appendChild(badgeElement);
  }

  // Initial scan & MutationObserver for dynamically loaded video players
  scanMediaElements();
  const observer = new MutationObserver(() => scanMediaElements());
  observer.observe(document.body, { childList: true, subtree: true });
})();
