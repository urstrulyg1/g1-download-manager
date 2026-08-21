// G1DM Browser Companion — Universal In-Video Download Pill & Stream Intelligence Overlay
(function () {
  'use strict';

  if (window.__G1DM_CONTENT_SCRIPT_INITIALIZED__) return;
  window.__G1DM_CONTENT_SCRIPT_INITIALIZED__ = true;

  const detectedMediaUrls = new Set();
  const videoOverlays = new Map(); // Map<HTMLVideoElement, OverlayInfo>
  let snifferInterval = null;

  // Standard resolution definitions
  const STANDARD_RESOLUTIONS = [
    { height: 2160, label: '4K • 2160p', format: 'MP4 (UHD)', color: '#a855f7', badge: '4K' },
    { height: 1440, label: '2K • 1440p', format: 'MP4 (QHD)', color: '#8b5cf6', badge: '2K' },
    { height: 1080, label: '1080p Full HD', format: 'MP4 (1080p)', color: '#38bdf8', badge: '1080p' },
    { height: 720, label: '720p HD', format: 'MP4 (720p)', color: '#34d399', badge: '720p' },
    { height: 480, label: '480p SD', format: 'MP4 (480p)', color: '#94a3b8', badge: '480p' },
    { height: 360, label: '360p SD', format: 'MP4 (360p)', color: '#64748b', badge: '360p' }
  ];

  // Sniff media requests from performance API
  function snifferMediaRequests() {
    try {
      const entries = performance.getEntriesByType('resource');
      for (const entry of entries) {
        const url = entry.name;
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) continue;
        if (/\.(m3u8|mpd|mp4|webm|mkv|mov|ts|m4s|mp3|flac|aac|m4a)(\?.*)?$/i.test(url) ||
            url.includes('videoplayback') ||
            url.includes('/manifest/') ||
            url.includes('.m3u8') ||
            url.includes('.mpd')) {
          if (!detectedMediaUrls.has(url)) {
            detectedMediaUrls.add(url);
            updateAllOverlays();
          }
        }
      }
    } catch {
      // Ignore performance API errors in sandboxed iframes
    }
  }

  function getPageVideoTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const docTitle = document.title;
    const h1 = document.querySelector('h1')?.innerText;
    return (ogTitle || h1 || docTitle || 'video').trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 100);
  }

  function getBestMediaSource(video) {
    if (video.currentSrc && !video.currentSrc.startsWith('blob:')) {
      return video.currentSrc;
    }
    if (video.src && !video.src.startsWith('blob:')) {
      return video.src;
    }
    const sources = video.querySelectorAll('source');
    for (const s of sources) {
      const src = s.src || s.getAttribute('data-src');
      if (src && !src.startsWith('blob:')) return src;
    }
    // Check detected media URLs for matching manifests or streams
    for (const url of detectedMediaUrls) {
      if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('.mp4') || url.includes('videoplayback')) {
        return url;
      }
    }
    return window.location.href;
  }

  function determineQualities(video) {
    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;
    const bestSrc = getBestMediaSource(video);
    const qualities = [];

    // 1. Add detected real streams (HLS / DASH / Direct MP4)
    const streamUrls = Array.from(detectedMediaUrls).filter(u =>
      u.includes('.m3u8') || u.includes('.mpd') || u.includes('.mp4') || u.includes('.webm')
    );

    if (streamUrls.length > 0) {
      for (const sUrl of streamUrls.slice(0, 3)) {
        const isHls = sUrl.includes('.m3u8');
        const isDash = sUrl.includes('.mpd');
        const badge = isHls ? 'HLS' : isDash ? 'DASH' : 'STREAM';
        const color = isHls ? '#10b981' : isDash ? '#f59e0b' : '#38bdf8';
        qualities.push({
          label: isHls ? 'Master HLS Stream (.m3u8)' : isDash ? 'DASH Manifest (.mpd)' : 'Direct Video Stream',
          format: isHls ? 'Adaptive Bitrate' : isDash ? 'Multi-Quality DASH' : 'MP4/WebM',
          badge,
          color,
          url: sUrl,
          resolution: `${vWidth}×${vHeight}`,
          isDirect: true
        });
      }
    }

    // 2. Add available resolution tiers based on current video dimensions
    const maxRes = vHeight >= 1800 ? 2160 : vHeight >= 1200 ? 1440 : vHeight >= 900 ? 1080 : vHeight >= 600 ? 720 : 480;

    for (const res of STANDARD_RESOLUTIONS) {
      if (res.height <= Math.max(maxRes, 1080)) {
        qualities.push({
          label: res.label,
          format: res.format,
          badge: res.badge,
          color: res.color,
          url: bestSrc,
          resolution: `${Math.round(res.height * (16 / 9))}×${res.height}`,
          height: res.height
        });
      }
    }

    // 3. Audio Extraction option
    qualities.push({
      label: 'Audio Only • High Quality',
      format: 'M4A / MP3 (320 kbps)',
      badge: 'AUDIO',
      color: '#f59e0b',
      url: bestSrc,
      isAudio: true
    });

    return qualities;
  }

  function createVideoPill(video) {
    if (videoOverlays.has(video)) return;

    const overlay = document.createElement('div');
    overlay.className = 'g1dm-invideo-container';
    overlay.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Pill Button
    const pill = document.createElement('div');
    pill.className = 'g1dm-video-pill';
    pill.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.94));
      border: 1px solid rgba(59, 130, 246, 0.55);
      border-radius: 9999px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 16px rgba(59, 130, 246, 0.35);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #f8fafc;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    pill.innerHTML = `
      <div style="width: 20px; height: 20px; background: linear-gradient(135deg, #2563eb, #38bdf8); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);">⚡</div>
      <span style="letter-spacing: 0.2px;">Download Video</span>
      <span class="g1dm-res-badge" style="background: rgba(56, 189, 248, 0.18); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; padding: 2px 6px; border-radius: 6px; font-family: monospace; font-size: 10px; font-weight: 700;">1080p</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="g1dm-chevron" style="transition: transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>
    `;

    // Dropdown Menu Panel
    const dropdown = document.createElement('div');
    dropdown.className = 'g1dm-quality-dropdown';
    dropdown.style.cssText = `
      display: none;
      width: 280px;
      margin-top: 8px;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
      border: 1px solid rgba(59, 130, 246, 0.45);
      border-radius: 14px;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.25);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 8px;
      box-sizing: border-box;
      max-height: 360px;
      overflow-y: auto;
      transform-origin: top right;
      animation: g1dm-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    overlay.appendChild(pill);
    overlay.appendChild(dropdown);
    document.body.appendChild(overlay);

    let isDropdownOpen = false;
    let hideTimeout = null;

    function updateResBadge() {
      const badgeEl = pill.querySelector('.g1dm-res-badge');
      if (!badgeEl) return;
      const h = video.videoHeight || 1080;
      badgeEl.innerText = h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : `${h}p`;
    }

    function renderDropdownContent() {
      const qualities = determineQualities(video);
      const title = getPageVideoTitle();

      let itemsHtml = qualities.map((q, idx) => `
        <div class="g1dm-drop-item" data-idx="${idx}" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 8px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: background 0.15s ease;
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
        ">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
            <span style="
              background: ${q.color}22;
              color: ${q.color};
              border: 1px solid ${q.color}55;
              padding: 2px 6px;
              border-radius: 5px;
              font-family: monospace;
              font-size: 10px;
              font-weight: 700;
              min-width: 38px;
              text-align: center;
            ">${q.badge}</span>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 11px; font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q.label}</span>
              <span style="font-size: 10px; color: #94a3b8;">${q.format} ${q.resolution ? '• ' + q.resolution : ''}</span>
            </div>
          </div>
          <button class="g1dm-dl-btn" style="
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            border: 1px solid rgba(59, 130, 246, 0.5);
            color: #fff;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
          ">
            <span>Download</span>
          </button>
        </div>
      `).join('');

      dropdown.innerHTML = `
        <div style="padding: 6px 8px 8px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">Select Quality & Format</span>
          </div>
          <span style="font-size: 10px; color: #64748b;">${qualities.length} options</span>
        </div>
        <div class="g1dm-items-list">${itemsHtml}</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; gap: 6px;">
          <button id="g1dm-open-studio" style="
            flex: 1;
            padding: 6px 8px;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(59, 130, 246, 0.3);
            color: #38bdf8;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          ">
            <span>🎬 Open in G1DM</span>
          </button>
          <button id="g1dm-dl-best" style="
            flex: 1;
            padding: 6px 8px;
            background: linear-gradient(135deg, #10b981, #059669);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #fff;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          ">
            <span>⚡ Best Quality</span>
          </button>
        </div>
      `;

      // Attach click listeners to download items
      dropdown.querySelectorAll('.g1dm-drop-item').forEach((itemEl) => {
        itemEl.addEventListener('mouseenter', () => {
          itemEl.style.background = 'rgba(59, 130, 246, 0.2)';
        });
        itemEl.addEventListener('mouseleave', () => {
          itemEl.style.background = 'rgba(30, 41, 59, 0.4)';
        });
        itemEl.addEventListener('click', (e) => {
          const idx = parseInt(itemEl.getAttribute('data-idx') || '0', 10);
          const selected = qualities[idx];
          triggerDownload(selected, title);

          const btn = itemEl.querySelector('.g1dm-dl-btn');
          if (btn) {
            btn.innerHTML = '<span>✓ Added</span>';
            btn.style.background = '#10b981';
            btn.style.borderColor = '#34d399';
          }
          setTimeout(() => closeDropdown(), 1200);
        });
      });

      // Quick actions
      dropdown.querySelector('#g1dm-open-studio')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'OPEN_G1DM_STUDIO',
          url: window.location.href
        });
        closeDropdown();
      });

      dropdown.querySelector('#g1dm-dl-best')?.addEventListener('click', () => {
        if (qualities.length > 0) {
          triggerDownload(qualities[0], title);
        }
        closeDropdown();
      });
    }

    function triggerDownload(quality, title) {
      const filename = `${title}_${quality.badge || 'video'}.mp4`.replace(/\s+/g, '_');
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_URL',
        url: quality.url,
        filename,
        category: quality.isAudio ? 'audio' : 'video'
      });

      // Visual feedback on the pill
      pill.style.borderColor = '#10b981';
      pill.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
      const textSpan = pill.querySelector('span:not(.g1dm-res-badge)');
      if (textSpan) textSpan.innerText = '✓ Sent to G1DM!';

      setTimeout(() => {
        pill.style.borderColor = 'rgba(59, 130, 246, 0.55)';
        pill.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 16px rgba(59, 130, 246, 0.35)';
        if (textSpan) textSpan.innerText = 'Download Video';
      }, 2500);
    }

    function openDropdown() {
      renderDropdownContent();
      dropdown.style.display = 'block';
      isDropdownOpen = true;
      const chevron = pill.querySelector('.g1dm-chevron');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
      pill.style.borderColor = '#38bdf8';
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
      isDropdownOpen = false;
      const chevron = pill.querySelector('.g1dm-chevron');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
      pill.style.borderColor = 'rgba(59, 130, 246, 0.55)';
    }

    function toggleDropdown(e) {
      e.stopPropagation();
      if (isDropdownOpen) closeDropdown();
      else openDropdown();
    }

    function showOverlay() {
      updatePosition();
      updateResBadge();
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';
      resetHideTimer();
    }

    function hideOverlay() {
      if (isDropdownOpen) return;
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateY(-6px)';
    }

    function resetHideTimer() {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isDropdownOpen) hideOverlay();
      }, 3500);
    }

    function updatePosition() {
      const rect = video.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        overlay.style.display = 'none';
        return;
      }
      overlay.style.display = 'flex';

      // Check if in fullscreen
      const isFullscreen = document.fullscreenElement === video || video.contains(document.fullscreenElement);
      if (isFullscreen) {
        overlay.style.position = 'fixed';
        overlay.style.top = '20px';
        overlay.style.right = '20px';
      } else {
        overlay.style.position = 'absolute';
        overlay.style.top = `${Math.max(8, window.scrollY + rect.top + 12)}px`;
        overlay.style.right = `${Math.max(8, document.documentElement.clientWidth - (window.scrollX + rect.right) + 12)}px`;
      }
    }

    pill.addEventListener('click', toggleDropdown);

    pill.addEventListener('mouseenter', () => {
      pill.style.transform = 'scale(1.04)';
      pill.style.boxShadow = '0 12px 30px -4px rgba(0, 0, 0, 0.8), 0 0 24px rgba(59, 130, 246, 0.55)';
      clearTimeout(hideTimeout);
    });

    pill.addEventListener('mouseleave', () => {
      pill.style.transform = 'none';
      pill.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 16px rgba(59, 130, 246, 0.35)';
      resetHideTimer();
    });

    video.addEventListener('mouseenter', showOverlay);
    video.addEventListener('mousemove', showOverlay);
    video.addEventListener('play', showOverlay);
    video.addEventListener('loadedmetadata', updateResBadge);
    video.addEventListener('mouseleave', resetHideTimer);

    document.addEventListener('click', (e) => {
      if (isDropdownOpen && !overlay.contains(e.target)) {
        closeDropdown();
        hideOverlay();
      }
    });

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    videoOverlays.set(video, { overlay, showOverlay, hideOverlay, updatePosition, updateResBadge });
    updatePosition();
    updateResBadge();
    showOverlay();
  }

  function updateAllOverlays() {
    videoOverlays.forEach(({ updateResBadge, updatePosition }) => {
      updateResBadge();
      updatePosition();
    });
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (!videoOverlays.has(video)) {
        createVideoPill(video);
      }
    });
  }

  // Inject CSS keyframes for smooth dropdown pop-in
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes g1dm-scale-in {
      from { opacity: 0; transform: scale(0.92) translateY(-8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head?.appendChild(styleEl);

  // Initialize
  scanForVideos();
  snifferMediaRequests();

  // Polling sniffer and mutation observer
  const observer = new MutationObserver(() => scanForVideos());
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  snifferInterval = setInterval(() => {
    snifferMediaRequests();
    scanForVideos();
  }, 2000);
})();
