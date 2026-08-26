// G1DM Browser Companion — Ultra-Premium In-Video Quality Matrix & Media Hub
(function () {
  'use strict';

  // Do not execute companion overlay on G1DM Manager application UI itself
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.port === '8055') {
    return;
  }

  // ── Context Validity & Lifetime Management ───────────────────────────────
  function isExtensionContextValid() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        return true;
      }
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) {
        return true;
      }
    } catch {}
    return false;
  }

  function getRuntimeApi() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        return chrome.runtime;
      }
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) {
        return browser.runtime;
      }
    } catch {}
    return null;
  }

  let isCleanedUp = false;
  let domObserver = null;
  let mainIntervalId = null;
  const detectedMediaUrls = new Set();
  const videoOverlays = new Map(); // Map<HTMLVideoElement, OverlayInfo>
  let currentCategoryFilter = 'ALL';
  let searchQuery = '';

  function cleanupOrphanedContentScript() {
    if (isCleanedUp) return;
    isCleanedUp = true;

    if (domObserver) {
      try { domObserver.disconnect(); } catch {}
      domObserver = null;
    }
    if (mainIntervalId) {
      try { clearInterval(mainIntervalId); } catch {}
      mainIntervalId = null;
    }
    try {
      for (const [video, info] of videoOverlays.entries()) {
        if (info && info.overlay && info.overlay.parentNode) {
          info.overlay.remove();
        }
      }
      videoOverlays.clear();
    } catch {}
    try {
      const modal = document.getElementById('g1dm-file-info-modal-root');
      if (modal) modal.remove();
      const prog = document.getElementById('g1dm-progress-overlay');
      if (prog) prog.remove();
      const pill = document.getElementById('g1dm-progress-pill');
      if (pill) pill.remove();
      const toast = document.getElementById('g1dm-toast-root');
      if (toast) toast.remove();
    } catch {}
    window.__G1DM_CONTENT_SCRIPT_INITIALIZED__ = false;
  }

  // Safe wrapper for chrome.runtime.sendMessage / browser.runtime.sendMessage
  function safeSendMessage(message, callback, fallback) {
    if (!isExtensionContextValid()) {
      cleanupOrphanedContentScript();
      if (typeof fallback === 'function') {
        try { fallback(new Error('Extension context invalidated')); } catch {}
      }
      return;
    }

    const runtime = getRuntimeApi();
    if (!runtime || !runtime.sendMessage) {
      if (typeof fallback === 'function') {
        try { fallback(new Error('Runtime not available')); } catch {}
      }
      return;
    }

    try {
      runtime.sendMessage(message, (response) => {
        const err = runtime.lastError;
        if (err) {
          const errMsg = err.message || '';
          if (errMsg.includes('context invalidated') || errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
            cleanupOrphanedContentScript();
          }
          if (typeof fallback === 'function') {
            try { fallback(err); } catch {}
            return;
          }
        }
        if (typeof callback === 'function') {
          try { callback(response); } catch (cbErr) {
            console.warn('[G1DM] Callback execution error:', cbErr);
          }
        }
      });
    } catch (err) {
      if (err && err.message && err.message.includes('context invalidated')) {
        cleanupOrphanedContentScript();
      }
      if (typeof fallback === 'function') {
        try { fallback(err); } catch {}
      }
    }
  }

  function safeGetURL(path) {
    if (!isExtensionContextValid()) return null;
    try {
      const runtime = getRuntimeApi();
      if (runtime && runtime.getURL) {
        return runtime.getURL(path);
      }
    } catch {}
    return null;
  }

  function safeGetStorage(keys, callback) {
    if (!isExtensionContextValid()) return;
    try {
      const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime?.id) ? chrome.storage.local :
                      (typeof browser !== 'undefined' && browser.storage && browser.runtime?.id) ? browser.storage.local : null;
      if (storage && storage.get) {
        storage.get(keys, (data) => {
          const runtime = getRuntimeApi();
          if (runtime && runtime.lastError) return;
          if (callback && data) callback(data);
        });
      }
    } catch {}
  }

  if (window.__G1DM_CONTENT_SCRIPT_INITIALIZED__) return;
  window.__G1DM_CONTENT_SCRIPT_INITIALIZED__ = true;

  // Resolution Tiers with Rich Metadata
  const RESOLUTION_TIERS = [
    { height: 4320, label: '8K • 4320p Ultra HD', badge: '8K UHD', color: '#ec4899', width: 7680, bitrate: '60-120 Mbps', fps: '60fps' },
    { height: 2160, label: '4K • 2160p Ultra HD', badge: '4K UHD', color: '#c084fc', width: 3840, bitrate: '25-45 Mbps', fps: '60fps' },
    { height: 1440, label: '2K • 1440p Quad HD', badge: '2K QHD', color: '#a855f7', width: 2560, bitrate: '16-24 Mbps', fps: '60fps' },
    { height: 1080, label: '1080p • Full HD', badge: '1080p FHD', color: '#38bdf8', width: 1920, bitrate: '8-12 Mbps', fps: '60fps' },
    { height: 720, label: '720p • High Definition', badge: '720p HD', color: '#34d399', width: 1280, bitrate: '4-6 Mbps', fps: '60fps' },
    { height: 480, label: '480p • Standard Definition', badge: '480p SD', color: '#fbbf24', width: 854, bitrate: '1.5-2.5 Mbps', fps: '30fps' },
    { height: 360, label: '360p • Mobile Crisp', badge: '360p', color: '#94a3b8', width: 640, bitrate: '800 kbps', fps: '30fps' },
    { height: 240, label: '240p • Data Saver', badge: '240p', color: '#64748b', width: 426, bitrate: '400 kbps', fps: '30fps' }
  ];

  // Codec/Container Matrix definitions per resolution
  const CODEC_CHIPS = [
    {
      id: 'mp4-h264',
      container: 'mp4',
      codec: 'H264',
      name: 'MP4 Universal',
      badge: 'MP4 • H.264',
      badgeColor: '#38bdf8',
      desc: 'H.264 AVC (Plays on all TVs & Devices)',
      formatSpec: (h) => `bestvideo[height<=${h}][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${h}][vcodec^=avc]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
    },
    {
      id: 'mkv-hevc',
      container: 'mkv',
      codec: 'HEVC',
      name: 'MKV HEVC',
      badge: 'MKV • H.265',
      badgeColor: '#c084fc',
      desc: 'HEVC HDR & Multi-Track Audio',
      formatSpec: (h) => `bestvideo[height<=${h}][vcodec^=hev1]+bestaudio[ext=m4a]/bestvideo[height<=${h}][vcodec^=hvc1]+bestaudio/bestvideo[height<=${h}][vcodec^=h265]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
    },
    {
      id: 'mkv-av1',
      container: 'mkv',
      codec: 'AV1',
      name: 'MKV AV1',
      badge: 'MKV • AV1',
      badgeColor: '#06b6d4',
      desc: 'Next-Gen Ultra High Efficiency',
      formatSpec: (h) => `bestvideo[height<=${h}][vcodec^=av01]+bestaudio[ext=m4a]/bestvideo[height<=${h}][vcodec^=av1]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
    },
    {
      id: 'webm-vp9',
      container: 'webm',
      codec: 'VP9',
      name: 'WebM VP9',
      badge: 'WebM • VP9',
      badgeColor: '#10b981',
      desc: 'Web Standard Video',
      formatSpec: (h) => `bestvideo[height<=${h}][vcodec^=vp9]+bestaudio[ext=webm]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
    }
  ];

  // Studio-Quality Audio formats
  const AUDIO_FORMATS = [
    { container: 'flac', codec: 'FLAC', label: 'FLAC Lossless Master', sublabel: '24-bit / 96kHz Studio Master Audio', badge: 'FLAC 24-bit', color: '#f59e0b', icon: '🎧' },
    { container: 'mp3', codec: 'MP3', label: 'MP3 Constant Bitrate', sublabel: '320 kbps Universal Audio', badge: 'MP3 320k', color: '#eab308', icon: '🎵' },
    { container: 'm4a', codec: 'AAC', label: 'M4A High Quality', sublabel: '320 kbps Apple Music Standard', badge: 'M4A AAC', color: '#f97316', icon: '🍎' },
    { container: 'opus', codec: 'OPUS', label: 'OPUS Low Latency', sublabel: '160 kbps Ultra High-Fidelity', badge: 'OPUS 160k', color: '#84cc16', icon: '⚡' },
    { container: 'wav', codec: 'PCM', label: 'WAV Uncompressed PCM', sublabel: 'Original Pristine Waveform', badge: 'WAV Master', color: '#fbbf24', icon: '🎙️' }
  ];

  // Sniff media network requests
  function snifferMediaRequests() {
    try {
      const entries = performance.getEntriesByType('resource');
      for (const entry of entries) {
        const url = entry.name;
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) continue;
        if (/\.(m3u8|mpd|mp4|mkv|webm|mov|ts|m4s|mp3|flac|aac|m4a|opus|wav)(\?.*)?$/i.test(url) ||
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
    } catch {}
  }

  function cleanPageTitle(raw) {
    if (!raw) return '';
    return raw.replace(/\s*[-–—|]\s*(YouTube|Vimeo|Dailymotion|Twitch|TikTok|SoundCloud|Reddit)$/i, '').trim();
  }

  function getPageVideoTitle() {
    const ytTitleEl = document.querySelector('ytd-watch-metadata #title h1, #title.ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1 yt-formatted-string, #video-title');
    const ytText = ytTitleEl?.innerText?.trim() || ytTitleEl?.textContent?.trim();
    if (ytText && ytText.length > 0 && ytText.toLowerCase() !== 'youtube') {
      return cleanPageTitle(ytText).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
    if (ogTitle && ogTitle.length > 0 && ogTitle.toLowerCase() !== 'youtube') {
      return cleanPageTitle(ogTitle).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    }

    const metaTitle = document.querySelector('meta[name="title"], meta[name="twitter:title"]')?.getAttribute('content')?.trim();
    if (metaTitle && metaTitle.length > 0 && metaTitle.toLowerCase() !== 'youtube') {
      return cleanPageTitle(metaTitle).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    }

    const h1 = document.querySelector('h1')?.innerText?.trim();
    if (h1 && h1.length > 0 && h1.toLowerCase() !== 'youtube') {
      return cleanPageTitle(h1).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    }

    const docTitle = document.title?.trim();
    if (docTitle && docTitle.length > 0) {
      const cleaned = cleanPageTitle(docTitle);
      if (cleaned && cleaned.toLowerCase() !== 'youtube') {
        return cleaned.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
      }
    }

    return 'Media Download';
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
    for (const url of detectedMediaUrls) {
      if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('.mp4') || url.includes('videoplayback')) {
        return url;
      }
    }
    return window.location.href;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return 'Variable Size';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function estimateFileSize(durationSec, height, codec, isAudio) {
    const isDefault = !durationSec || durationSec <= 0 || !isFinite(durationSec);
    const dur = isDefault ? 600 : durationSec;

    let bps = 4000000;
    if (isAudio) {
      if (codec === 'FLAC') bps = 950000;
      else if (codec === 'PCM') bps = 1411200;
      else if (codec === 'AAC' || codec === 'MP3') bps = 320000;
      else if (codec === 'OPUS') bps = 160000;
      else bps = 256000;
    } else {
      const isEfficient = codec === 'HEVC' || codec === 'AV1' || codec === 'VP9';
      if (height >= 4320) bps = isEfficient ? 48000000 : 85000000;
      else if (height >= 2160) bps = isEfficient ? 18000000 : 32000000;
      else if (height >= 1440) bps = isEfficient ? 10000000 : 16000000;
      else if (height >= 1080) bps = isEfficient ? 4500000 : 8000000;
      else if (height >= 720) bps = isEfficient ? 2200000 : 4000000;
      else if (height >= 480) bps = isEfficient ? 1200000 : 2000000;
      else if (height >= 360) bps = isEfficient ? 600000 : 1000000;
      else bps = 400000;
    }

    const totalBytes = Math.round((bps / 8) * dur);
    const formatted = formatBytes(totalBytes);
    return isDefault ? `~${formatted} (10m)` : `~${formatted}`;
  }

  // ── Main World Bridge (Reads YouTube/Site Player APIs directly) ───────────
  function injectMainWorldBridge() {
    if (!/youtube\.com|youtu\.be/i.test(window.location.hostname)) return;
    if (document.getElementById('g1dm-main-bridge')) return;
    try {
      const bridgeUrl = safeGetURL('yt-bridge.js');
      if (bridgeUrl) {
        const script = document.createElement('script');
        script.id = 'g1dm-main-bridge';
        script.src = bridgeUrl;
        (document.head || document.documentElement).appendChild(script);
      }
    } catch {}
  }

  let probedMaxResolution = 0;
  let lastProbedUrl = '';

  function fetchBackendMediaAnalysis(pageUrl) {
    if (!pageUrl || !pageUrl.startsWith('http') || pageUrl === lastProbedUrl) return;
    lastProbedUrl = pageUrl;

    const handleData = (data) => {
      if (data && !data.error) {
        const recH = data.recommendedQuality?.height;
        const availH = Array.isArray(data.availableVideoQualities) && data.availableVideoQualities.length > 0
          ? Math.max(...data.availableVideoQualities.map(q => q.height || 0))
          : 0;
        const maxH = recH || availH;
        if (maxH > 0) {
          probedMaxResolution = maxH;
          document.documentElement.setAttribute('data-g1dm-max-height', String(maxH));
          updateAllOverlays();
        }
      }
    };

    const directHttpFallback = () => {
      fetch('http://127.0.0.1:8055/api/media/secure-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pageUrl })
      })
        .then(res => res.json())
        .then(handleData)
        .catch(() => {});
    };

    safeSendMessage(
      { type: 'SECURE_DETECT', url: pageUrl },
      (response) => {
        if (response && !response.error) {
          handleData(response);
        } else {
          directHttpFallback();
        }
      },
      directHttpFallback
    );
  }

  function detectMaxAvailableResolution(video) {
    let detected = 0;

    if (probedMaxResolution > 0) {
      detected = Math.max(detected, probedMaxResolution);
    }

    const domMax = document.documentElement.getAttribute('data-g1dm-max-height');
    if (domMax) {
      const parsed = parseInt(domMax, 10);
      if (parsed > 0) detected = Math.max(detected, parsed);
    }

    const ytMenuItems = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem, .ytp-quality-menu .ytp-menuitem');
    if (ytMenuItems && ytMenuItems.length > 0) {
      for (const item of ytMenuItems) {
        const text = item.textContent || '';
        const m = text.match(/(4320|2880|2160|1440|1080|720|480|360|240|144)p?/i);
        if (m && m[1]) {
          const val = parseInt(m[1], 10);
          if (val > detected) detected = val;
        }
      }
    }

    if (video && video.videoHeight && video.videoHeight > 0) {
      detected = Math.max(detected, video.videoHeight);
    }

    return detected > 0 ? detected : 1080;
  }

  // ── Ultra-Premium In-Video Floating Pill & Quality Matrix ────────────────
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

    // Modern Frosted Floating Pill
    const pill = document.createElement('div');
    pill.className = 'g1dm-video-pill';
    pill.style.cssText = `
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 16px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.94) 100%);
      border: 1px solid rgba(56, 189, 248, 0.55);
      border-radius: 9999px;
      box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: #f8fafc;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    pill.innerHTML = `
      <div style="width: 22px; height: 22px; background: linear-gradient(135deg, #2563eb, #06b6d4); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #fff; box-shadow: 0 0 12px rgba(6, 182, 212, 0.6);">⚡</div>
      <span style="letter-spacing: 0.2px;">Download Video</span>
      <span class="g1dm-res-badge" style="background: rgba(56, 189, 248, 0.18); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 2px 8px; border-radius: 9999px; font-family: monospace; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;">1080p FHD</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="g1dm-chevron" style="transition: transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>
    `;

    // Dropdown Matrix Panel (Spacious 450px with VisionOS glassmorphism)
    const dropdown = document.createElement('div');
    dropdown.className = 'g1dm-quality-dropdown';
    dropdown.style.cssText = `
      display: none;
      width: 450px;
      margin-top: 10px;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.97) 0%, rgba(2, 6, 23, 0.98) 100%);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      box-shadow: 0 30px 70px -15px rgba(0, 0, 0, 0.95), 0 0 35px rgba(56, 189, 248, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      padding: 14px;
      box-sizing: border-box;
      max-height: 520px;
      overflow-y: auto;
      transform-origin: top right;
      animation: g1dm-scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    overlay.appendChild(pill);
    overlay.appendChild(dropdown);
    (document.fullscreenElement || document.body || document.documentElement).appendChild(overlay);

    let isDropdownOpen = false;
    let hideTimeout = null;

    function updateResBadge() {
      const badgeEl = pill.querySelector('.g1dm-res-badge');
      if (!badgeEl) return;
      const h = detectMaxAvailableResolution(video);
      const resStr = h >= 3600 ? '8K FUHD' : h >= 2000 ? '4K UHD' : h >= 1400 ? '2K QHD' : h >= 1000 ? '1080p FHD' : h >= 700 ? '720p HD' : `${h}p`;
      badgeEl.innerText = resStr;
    }

    function renderDropdownContent() {
      const maxAvailableHeight = detectMaxAvailableResolution(video);
      const rawTitle = getPageVideoTitle();
      const durationSec = video.duration;
      const isStreamSite = /youtube\.com|youtu\.be|googlevideo\.com|vimeo\.com|twitch\.tv|twitter\.com|x\.com|tiktok\.com|instagram\.com|facebook\.com|dailymotion\.com|reddit\.com|bilibili\.com|rumble\.com|bitchute\.com|odysee\.com/i.test(window.location.hostname);
      const bestSrc = getBestMediaSource(video);
      const pageUrl = window.location.href;

      const q = searchQuery.toLowerCase().trim();

      // Top Quality Badge
      const topBadge = maxAvailableHeight >= 3600 ? '8K FUHD Master' :
                       maxAvailableHeight >= 2000 ? '4K UHD Cinema' :
                       maxAvailableHeight >= 1400 ? '2K Quad HD' :
                       maxAvailableHeight >= 1000 ? '1080p Full HD' : '720p HD';

      // 1. Build Filtered Video Resolutions
      const activeResolutions = RESOLUTION_TIERS.filter(r => r.height <= maxAvailableHeight);
      let resCardsHtml = '';

      if (currentCategoryFilter === 'ALL' || currentCategoryFilter === 'VIDEO') {
        for (const res of activeResolutions) {
          if (q && !res.label.toLowerCase().includes(q) && !res.badge.toLowerCase().includes(q) && !'video'.includes(q)) {
            // Check if any codec chip matches query
            const matchesChip = CODEC_CHIPS.some(c => c.name.toLowerCase().includes(q) || c.container.includes(q) || c.codec.toLowerCase().includes(q));
            if (!matchesChip) continue;
          }

          const estSize = estimateFileSize(durationSec, res.height, 'HEVC', false);
          const isHighest = res.height === activeResolutions[0]?.height;

          const chipsHtml = CODEC_CHIPS.map(c => {
            if (q && !c.name.toLowerCase().includes(q) && !c.container.includes(q) && !c.codec.toLowerCase().includes(q) && !res.label.toLowerCase().includes(q)) {
              return '';
            }

            const formatSpec = c.formatSpec(res.height);
            return `
              <button class="g1dm-codec-chip"
                data-height="${res.height}"
                data-container="${c.container}"
                data-codec="${c.codec}"
                data-quality="${res.badge}"
                data-resolution="${res.width}×${res.height}"
                data-formatspec="${formatSpec}"
                data-url="${isStreamSite ? pageUrl : bestSrc}"
                title="${c.desc}"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 6px;
                  padding: 6px 10px;
                  background: rgba(30, 41, 59, 0.55);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 8px;
                  color: #f1f5f9;
                  font-size: 11px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
                ">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: ${c.badgeColor}; box-shadow: 0 0 6px ${c.badgeColor};"></span>
                  <span>${c.badge}</span>
                </div>
                <span style="font-size: 9.5px; color: #94a3b8; font-family: monospace;">Download</span>
              </button>
            `;
          }).filter(Boolean).join('');

          resCardsHtml += `
            <div class="g1dm-res-card" style="
              background: ${isHighest ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.7))' : 'rgba(30, 41, 59, 0.35)'};
              border: 1px solid ${isHighest ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.06)'};
              border-radius: 12px;
              padding: 10px 12px;
              margin-bottom: 8px;
              transition: all 0.18s ease;
            ">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="
                    background: ${res.color}22;
                    border: 1px solid ${res.color}55;
                    color: ${res.color};
                    padding: 2px 7px;
                    border-radius: 6px;
                    font-family: monospace;
                    font-size: 10.5px;
                    font-weight: 800;
                  ">${res.badge}</span>
                  <span style="font-size: 12px; font-weight: 700; color: #f8fafc;">${res.label}</span>
                  ${isHighest ? `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px;">MAX</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 6px; font-family: monospace; font-size: 10px;">
                  <span style="color: #94a3b8;">${res.bitrate}</span>
                  <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; padding: 1px 6px; border-radius: 4px; font-weight: 700;">${estSize}</span>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                ${chipsHtml}
              </div>
            </div>
          `;
        }
      }

      // 2. Audio Extraction Items
      let audioCardsHtml = '';
      if (currentCategoryFilter === 'ALL' || currentCategoryFilter === 'AUDIO') {
        const audioItems = AUDIO_FORMATS.filter(a => {
          if (!q) return true;
          return a.label.toLowerCase().includes(q) || a.container.includes(q) || a.codec.toLowerCase().includes(q) || 'audio'.includes(q);
        });

        if (audioItems.length > 0) {
          audioCardsHtml = `
            <div style="margin-top: 10px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px;">🎵 Master Studio Audio</span>
              <span style="font-size: 10px; color: #94a3b8;">Lossless & Universal</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${audioItems.map(aud => {
                const estSize = estimateFileSize(durationSec, 0, aud.codec, true);
                const formatSpec = aud.container === 'm4a' || aud.codec === 'AAC' ? 'bestaudio[ext=m4a]/bestaudio/best' : 'bestaudio/best';
                return `
                  <div class="g1dm-audio-row"
                    data-container="${aud.container}"
                    data-codec="${aud.codec}"
                    data-quality="${aud.badge}"
                    data-formatspec="${formatSpec}"
                    data-url="${isStreamSite ? pageUrl : bestSrc}"
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      padding: 8px 10px;
                      background: rgba(30, 41, 59, 0.4);
                      border: 1px solid rgba(255, 255, 255, 0.06);
                      border-radius: 8px;
                      cursor: pointer;
                      transition: all 0.16s ease;
                    ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 14px;">${aud.icon}</span>
                      <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 11.5px; font-weight: 700; color: #f8fafc;">${aud.label}</span>
                        <span style="font-size: 10px; color: #94a3b8;">${aud.sublabel}</span>
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-family: monospace; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px;">${estSize}</span>
                      <button class="g1dm-mini-dl-btn" style="
                        background: linear-gradient(135deg, #d97706, #b45309);
                        border: 1px solid rgba(245, 158, 11, 0.5);
                        color: #fff;
                        padding: 4px 9px;
                        border-radius: 6px;
                        font-size: 10px;
                        font-weight: 700;
                        cursor: pointer;
                        white-space: nowrap;
                      ">Extract</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      }

      // 3. Live Streams (if sniffed)
      let streamCardsHtml = '';
      if (currentCategoryFilter === 'ALL' || currentCategoryFilter === 'STREAMS') {
        const streamUrls = Array.from(detectedMediaUrls).filter(u => u.includes('.m3u8') || u.includes('.mpd'));
        if (streamUrls.length > 0) {
          streamCardsHtml = `
            <div style="margin-top: 10px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px;">📡 Live Streams & Manifests</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${streamUrls.map((sUrl, sIdx) => {
                const isHls = sUrl.includes('.m3u8');
                return `
                  <div class="g1dm-stream-row"
                    data-container="${isHls ? 'mkv' : 'mp4'}"
                    data-codec="ORIGINAL"
                    data-quality="${isHls ? 'HLS Stream' : 'DASH Stream'}"
                    data-formatspec="bestvideo+bestaudio/best"
                    data-url="${sUrl}"
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      padding: 8px 10px;
                      background: rgba(16, 185, 129, 0.1);
                      border: 1px solid rgba(16, 185, 129, 0.25);
                      border-radius: 8px;
                      cursor: pointer;
                      transition: all 0.16s ease;
                    ">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                      <span style="font-size: 14px;">📡</span>
                      <div style="display: flex; flex-direction: column; overflow: hidden;">
                        <span style="font-size: 11.5px; font-weight: 700; color: #34d399;">${isHls ? 'Master HLS Stream (.m3u8)' : 'DASH Manifest (.mpd)'}</span>
                        <span style="font-size: 9.5px; color: #94a3b8; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sUrl}</span>
                      </div>
                    </div>
                    <button class="g1dm-mini-dl-btn" style="
                      background: linear-gradient(135deg, #059669, #047857);
                      border: 1px solid rgba(16, 185, 129, 0.5);
                      color: #fff;
                      padding: 4px 9px;
                      border-radius: 6px;
                      font-size: 10px;
                      font-weight: 700;
                      cursor: pointer;
                      white-space: nowrap;
                    ">Stream</button>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      }

      dropdown.innerHTML = `
        <!-- Top Header Bar -->
        <div style="padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 20px; height: 20px; border-radius: 6px; background: linear-gradient(135deg, #2563eb, #06b6d4); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff;">⚡</div>
              <span style="font-size: 12px; font-weight: 800; color: #f8fafc; letter-spacing: 0.3px;">G1DM MEDIA HUB</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="
                background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(192, 132, 252, 0.2));
                border: 1px solid rgba(236, 72, 153, 0.4);
                color: #f472b6;
                padding: 2px 8px;
                border-radius: 9999px;
                font-family: monospace;
                font-size: 10px;
                font-weight: 800;
              ">✨ ${topBadge}</span>
            </div>
          </div>

          <!-- Video Title Preview -->
          <div style="font-size: 12px; font-weight: 600; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;" title="${rawTitle}">
            ${rawTitle}
          </div>

          <!-- Search Input Bar -->
          <div style="display: flex; align-items: center; gap: 6px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 4px 8px; margin-bottom: 8px;">
            <span style="font-size: 11px; color: #94a3b8;">🔍</span>
            <input id="g1dm-search-input" type="text" placeholder="Filter quality, format, codec (e.g. 4k, mp4, flac, hevc)..." value="${searchQuery.replace(/"/g, '&quot;')}" style="
              flex: 1;
              background: transparent;
              border: none;
              outline: none;
              color: #f8fafc;
              font-size: 11px;
              font-family: inherit;
            " />
            ${searchQuery ? `<button id="g1dm-search-clear" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 11px; padding: 0 4px;">✕</button>` : ''}
          </div>

          <!-- Segmented Filter Tabs -->
          <div style="display: flex; gap: 5px;">
            ${[
              { id: 'ALL', label: 'All Combinations' },
              { id: 'VIDEO', label: '🎬 Video Matrix' },
              { id: 'AUDIO', label: '🎵 Master Audio' },
              { id: 'STREAMS', label: '📡 Streams' }
            ].map(tab => {
              const isActive = currentCategoryFilter === tab.id;
              return `
                <button class="g1dm-seg-tab" data-filter="${tab.id}" style="
                  flex: 1;
                  padding: 4px 6px;
                  font-size: 10.5px;
                  font-weight: 700;
                  border-radius: 6px;
                  cursor: pointer;
                  border: 1px solid ${isActive ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'};
                  background: ${isActive ? 'linear-gradient(135deg, #2563eb, #0284c7)' : 'rgba(30, 41, 59, 0.5)'};
                  color: ${isActive ? '#ffffff' : '#94a3b8'};
                  transition: all 0.15s ease;
                  white-space: nowrap;
                  text-align: center;
                ">${tab.label}</button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Scrollable Resolutions & Media Cards -->
        <div class="g1dm-items-list" style="max-height: 310px; overflow-y: auto; padding-right: 2px;">
          ${resCardsHtml}
          ${audioCardsHtml}
          ${streamCardsHtml}
          ${(!resCardsHtml && !audioCardsHtml && !streamCardsHtml) ? '<div style="font-size:11px; color:#94a3b8; text-align:center; padding:20px;">No matching formats found for this search filter.</div>' : ''}
        </div>

        <!-- Bottom Action Bar -->
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; gap: 8px;">
          <button id="g1dm-open-studio" style="
            flex: 1;
            padding: 8px 10px;
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #38bdf8;
            border-radius: 9px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.15s ease;
          ">
            <span>🎬 G1DM Media Studio</span>
          </button>
          <button id="g1dm-dl-best" style="
            flex: 1.2;
            padding: 8px 12px;
            background: linear-gradient(135deg, #10b981, #059669);
            border: 1px solid rgba(16, 185, 129, 0.5);
            color: #fff;
            border-radius: 9px;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
            transition: all 0.15s ease;
          ">
            <span>⚡ Best Quality (1-Click)</span>
          </button>
        </div>
      `;

      // Event Handlers
      // Search input
      const searchInput = dropdown.querySelector('#g1dm-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          renderDropdownContent();
          const nextInput = dropdown.querySelector('#g1dm-search-input');
          if (nextInput) {
            nextInput.focus();
            nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
          }
        });
      }

      dropdown.querySelector('#g1dm-search-clear')?.addEventListener('click', () => {
        searchQuery = '';
        renderDropdownContent();
      });

      // Filter tabs
      dropdown.querySelectorAll('.g1dm-seg-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentCategoryFilter = tabBtn.getAttribute('data-filter') || 'ALL';
          renderDropdownContent();
        });
      });

      // Hover and Click on Codec Chips
      dropdown.querySelectorAll('.g1dm-codec-chip').forEach((chip) => {
        chip.addEventListener('mouseenter', () => {
          chip.style.background = 'rgba(56, 189, 248, 0.2)';
          chip.style.borderColor = 'rgba(56, 189, 248, 0.5)';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.background = 'rgba(30, 41, 59, 0.55)';
          chip.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        });
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = {
            container: chip.getAttribute('data-container'),
            codec: chip.getAttribute('data-codec'),
            badge: chip.getAttribute('data-quality'),
            resolution: chip.getAttribute('data-resolution'),
            height: parseInt(chip.getAttribute('data-height') || '0', 10),
            formatSpec: chip.getAttribute('data-formatspec'),
            url: chip.getAttribute('data-url'),
            isAudio: false
          };
          triggerDownload(item, rawTitle);

          chip.innerHTML = '<span style="color:#34d399; font-weight:800;">✓ Added to G1DM</span>';
          chip.style.background = 'rgba(16, 185, 129, 0.25)';
          chip.style.borderColor = '#10b981';
          setTimeout(() => closeDropdown(), 1000);
        });
      });

      // Audio Rows Click
      dropdown.querySelectorAll('.g1dm-audio-row').forEach((row) => {
        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(245, 158, 11, 0.15)';
          row.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        });
        row.addEventListener('mouseleave', () => {
          row.style.background = 'rgba(30, 41, 59, 0.4)';
          row.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = {
            container: row.getAttribute('data-container'),
            codec: row.getAttribute('data-codec'),
            badge: row.getAttribute('data-quality'),
            formatSpec: row.getAttribute('data-formatspec'),
            url: row.getAttribute('data-url'),
            isAudio: true
          };
          triggerDownload(item, rawTitle);

          const btn = row.querySelector('.g1dm-mini-dl-btn');
          if (btn) {
            btn.innerText = '✓ Added';
            btn.style.background = '#10b981';
          }
          setTimeout(() => closeDropdown(), 1000);
        });
      });

      // Stream Rows Click
      dropdown.querySelectorAll('.g1dm-stream-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = {
            container: row.getAttribute('data-container'),
            codec: row.getAttribute('data-codec'),
            badge: row.getAttribute('data-quality'),
            formatSpec: row.getAttribute('data-formatspec'),
            url: row.getAttribute('data-url'),
            isDirectStream: true,
            isAudio: false
          };
          triggerDownload(item, rawTitle);

          const btn = row.querySelector('.g1dm-mini-dl-btn');
          if (btn) {
            btn.innerText = '✓ Added';
            btn.style.background = '#10b981';
          }
          setTimeout(() => closeDropdown(), 1000);
        });
      });

      // Footer actions
      dropdown.querySelector('#g1dm-open-studio')?.addEventListener('click', () => {
        safeSendMessage(
          { type: 'OPEN_G1DM_STUDIO', url: window.location.href },
          () => {},
          () => {
            window.open(`http://127.0.0.1:8055/#media?url=${encodeURIComponent(window.location.href)}`, '_blank');
          }
        );
        closeDropdown();
      });

      dropdown.querySelector('#g1dm-dl-best')?.addEventListener('click', () => {
        const bestRes = activeResolutions[0] || RESOLUTION_TIERS[0];
        const bestItem = {
          container: 'mp4',
          codec: 'H264',
          badge: bestRes.badge,
          resolution: `${bestRes.width}×${bestRes.height}`,
          height: bestRes.height,
          formatSpec: CODEC_CHIPS[0].formatSpec(bestRes.height),
          url: isStreamSite ? pageUrl : bestSrc,
          isAudio: false
        };
        triggerDownload(bestItem, rawTitle);
        closeDropdown();
      });
    }

    function triggerDownload(item, title) {
      const ext = item.container || (item.isAudio ? 'mp3' : 'mp4');
      const filename = `${title}.${ext}`;
      const isStreamSite = /youtube\.com|youtu\.be|googlevideo\.com|vimeo\.com|twitch\.tv|twitter\.com|x\.com|tiktok\.com|instagram\.com|facebook\.com|dailymotion\.com|reddit\.com|bilibili\.com|rumble\.com|bitchute\.com|odysee\.com/i.test(window.location.hostname);
      const targetUrl = (isStreamSite && !item.isDirectStream) ? window.location.href : (item.url || window.location.href);

      const msg = {
        type: 'DOWNLOAD_URL',
        url: targetUrl,
        filename,
        category: item.isAudio ? 'audio' : 'video',
        format: ext,
        container: ext,
        formatSpec: item.formatSpec || (item.isAudio ? 'bestaudio/best' : 'bestvideo+bestaudio/best'),
        mediaFormatSpec: item.formatSpec || (item.isAudio ? 'bestaudio/best' : 'bestvideo+bestaudio/best'),
        codec: item.codec,
        height: item.height,
        qualityLabel: item.badge || (item.height ? `${item.height}p` : undefined),
        clarity: item.badge || (item.height ? `${item.height}p` : undefined),
        resolution: item.resolution,
      };

      // Show the IDM-style Download File Info dialog box popup
      showDownloadFileInfoModal(msg);

      // Visual feedback on pill
      pill.style.borderColor = '#10b981';
      pill.style.boxShadow = '0 0 24px rgba(16, 185, 129, 0.6)';
      const textSpan = pill.querySelector('span:not(.g1dm-res-badge)');
      if (textSpan) textSpan.innerText = `✓ Selected (${ext.toUpperCase()})!`;

      setTimeout(() => {
        pill.style.borderColor = 'rgba(56, 189, 248, 0.55)';
        pill.style.boxShadow = '0 12px 28px -4px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.35)';
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
      pill.style.borderColor = 'rgba(56, 189, 248, 0.55)';
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
      pill.style.boxShadow = '0 14px 34px -4px rgba(0, 0, 0, 0.85), 0 0 28px rgba(56, 189, 248, 0.6)';
      clearTimeout(hideTimeout);
    });

    pill.addEventListener('mouseleave', () => {
      pill.style.transform = 'none';
      pill.style.boxShadow = '0 12px 28px -4px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.35)';
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

  // ── Download File Info Modal Dialog (IDM-Style Popup) ────────────────────
  function showDownloadFileInfoModal(params) {
    const existing = document.getElementById('g1dm-file-info-modal-root');
    if (existing) existing.remove();

    const url = params.url || window.location.href;
    let filename = params.filename || '';
    if (!filename) {
      try {
        const p = new URL(url).pathname.split('/').pop();
        if (p) filename = decodeURIComponent(p);
      } catch {}
      if (!filename) filename = 'download.bin';
    }

    let category = params.category || 'other';
    const formatSpec = params.formatSpec;
    const container = params.container;

    const root = document.createElement('div');
    root.id = 'g1dm-file-info-modal-root';
    root.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      animation: g1dm-fade-in 0.15s ease-out;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      width: 530px;
      max-width: 95vw;
      background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 14px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12);
      color: #f3f4f6;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: g1dm-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    dialog.innerHTML = `
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: linear-gradient(90deg, #1e293b, #0f172a); border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 22px; height: 22px; border-radius: 5px; background: linear-gradient(135deg, #2563eb, #38bdf8); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; box-shadow: 0 0 8px rgba(56,189,248,0.5);">⚡</div>
          <span style="font-weight: 700; font-size: 14px; color: #f8fafc; letter-spacing: 0.3px;">Download File Info</span>
        </div>
        <button id="g1dm-modal-close" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.15s;">✕</button>
      </div>

      <!-- Form Body -->
      <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
        <!-- URL Row -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="width: 70px; font-weight: 600; color: #cbd5e1; flex-shrink: 0;">URL</label>
          <input id="g1dm-input-url" type="text" value="${url.replace(/"/g, '&quot;')}" style="flex: 1; padding: 7px 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f1f5f9; font-size: 12px; font-family: monospace; outline: none;" />
        </div>

        <!-- Category Row -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="width: 70px; font-weight: 600; color: #cbd5e1; flex-shrink: 0;">Category</label>
          <select id="g1dm-select-cat" style="flex: 1; padding: 7px 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f1f5f9; font-size: 12px; outline: none; cursor: pointer;">
            <option value="compressed" ${category === 'compressed' || category === 'archive' ? 'selected' : ''}>📦 Compressed / Archives</option>
            <option value="document" ${category === 'document' ? 'selected' : ''}>📄 Documents</option>
            <option value="audio" ${category === 'audio' ? 'selected' : ''}>🎵 Music & Audio</option>
            <option value="video" ${category === 'video' ? 'selected' : ''}>🎬 Video & Media</option>
            <option value="program" ${category === 'program' ? 'selected' : ''}>💻 Programs & Software</option>
            <option value="other" ${category === 'other' ? 'selected' : ''}>📁 General / Other</option>
          </select>
        </div>

        <!-- Save As Row -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="width: 70px; font-weight: 600; color: #cbd5e1; flex-shrink: 0;">Save As</label>
          <div style="flex: 1; display: flex; gap: 6px;">
            <input id="g1dm-input-filename" type="text" value="${filename.replace(/"/g, '&quot;')}" style="flex: 1; padding: 7px 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f1f5f9; font-size: 12px; outline: none;" />
            <button id="g1dm-btn-browse" style="padding: 0 10px; background: #334155; border: 1px solid #475569; border-radius: 6px; color: #f1f5f9; font-size: 12px; font-weight: 600; cursor: pointer;">📂</button>
          </div>
        </div>

        <!-- File Info Preview Card -->
        <div style="padding: 10px 14px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div id="g1dm-cat-icon" style="font-size: 22px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.8); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">📦</div>
            <div>
              <div id="g1dm-filesize-label" style="font-size: 13px; font-weight: 700; color: #38bdf8;">⏳ Probing file size...</div>
              <div id="g1dm-resumable-label" style="font-size: 11px; color: #94a3b8;">Detecting transfer speed & range support...</div>
            </div>
          </div>
          <div id="g1dm-safety-badge" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; display: none;">✓ Verified Safe</div>
        </div>

        <!-- Description Row -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="width: 70px; font-weight: 600; color: #cbd5e1; flex-shrink: 0;">Description</label>
          <input id="g1dm-input-desc" type="text" placeholder="Optional notes / tags" style="flex: 1; padding: 7px 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f1f5f9; font-size: 12px; outline: none;" />
        </div>
      </div>

      <!-- Action Buttons Footer -->
      <div style="padding: 12px 20px; background: #0f172a; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
        <button id="g1dm-btn-later" style="padding: 8px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #cbd5e1; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;">Download Later</button>
        <button id="g1dm-btn-start" style="padding: 8px 20px; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: 1px solid rgba(59, 130, 246, 0.6); border-radius: 6px; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); transition: all 0.15s;">Start Download</button>
        <button id="g1dm-btn-cancel" style="padding: 8px 16px; background: transparent; border: 1px solid #334155; border-radius: 6px; color: #94a3b8; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;">Cancel</button>
      </div>
    `;

    root.appendChild(dialog);
    (document.fullscreenElement || document.body || document.documentElement).appendChild(root);

    const urlInput = dialog.querySelector('#g1dm-input-url');
    const filenameInput = dialog.querySelector('#g1dm-input-filename');
    const catSelect = dialog.querySelector('#g1dm-select-cat');
    const catIcon = dialog.querySelector('#g1dm-cat-icon');
    const filesizeLabel = dialog.querySelector('#g1dm-filesize-label');
    const resumableLabel = dialog.querySelector('#g1dm-resumable-label');
    const safetyBadge = dialog.querySelector('#g1dm-safety-badge');

    const updateCategoryIcon = (cat) => {
      const icons = {
        compressed: '📦',
        archive: '📦',
        document: '📄',
        audio: '🎵',
        video: '🎬',
        program: '💻',
        other: '📁'
      };
      if (catIcon) catIcon.innerText = icons[cat] || '📁';
    };

    updateCategoryIcon(catSelect.value);
    catSelect.addEventListener('change', () => updateCategoryIcon(catSelect.value));

    const handleProbeResult = (data) => {
      if (data && !data.error) {
        if (data.filename && (!filename || filename === 'download.bin' || filename.startsWith('watch.') || filename.startsWith('video.'))) {
          filenameInput.value = data.filename;
        }
        if (data.suggestedCategory && data.suggestedCategory !== 'other' && data.suggestedCategory !== 'document') {
          catSelect.value = data.suggestedCategory;
          updateCategoryIcon(data.suggestedCategory);
        } else if (category === 'video' || category === 'audio') {
          catSelect.value = category;
          updateCategoryIcon(category);
        }
        if (data.size && data.size > 0) {
          filesizeLabel.innerText = formatBytes(data.size);
        } else {
          filesizeLabel.innerText = 'Dynamic Stream';
        }
        if (data.capabilities) {
          resumableLabel.innerText = data.capabilities.supportsRange
            ? '✓ Multi-Threaded Turbo Resumable'
            : 'Single-Stream Download';
        }
        if (data.safetyWarning && data.safetyWarning.isSafe) {
          safetyBadge.style.display = 'block';
        }
      }
    };

    const directProbeFallback = () => {
      fetch('http://127.0.0.1:8055/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
        .then(res => res.json())
        .then(handleProbeResult)
        .catch(() => {});
    };

    safeSendMessage(
      { type: 'PROBE_URL', url },
      (data) => {
        if (data && !data.error) {
          handleProbeResult(data);
        } else {
          directProbeFallback();
        }
      },
      directProbeFallback
    );

    const closeModal = () => {
      root.style.opacity = '0';
      root.style.transition = 'opacity 0.2s ease';
      setTimeout(() => root.remove(), 200);
    };

    const submit = (startImmediately) => {
      const finalUrl = urlInput.value.trim() || url;
      const finalName = filenameInput.value.trim() || filename;
      let finalCat = catSelect.value || category;
      if (finalCat === 'document' && (params.category === 'video' || params.category === 'audio' || /\.(mp4|mkv|webm|mov|mp3|flac|wav|m4a|aac)$/i.test(finalName))) {
        finalCat = params.category || (/\.(mp3|flac|wav|m4a|aac)$/i.test(finalName) ? 'audio' : 'video');
      }

      const payload = {
        url: finalUrl,
        filename: finalName,
        category: finalCat,
        formatSpec: params.formatSpec || params.mediaFormatSpec || formatSpec,
        mediaFormatSpec: params.formatSpec || params.mediaFormatSpec || formatSpec,
        container: params.container || container,
        codec: params.codec,
        height: params.height,
        qualityLabel: params.qualityLabel || (params.height ? `${params.height}p` : undefined),
        clarity: params.clarity || params.qualityLabel || (params.height ? `${params.height}p` : undefined),
        resolution: params.resolution,
        startImmediately: startImmediately
      };

      const startBtn = dialog.querySelector('#g1dm-btn-start');
      const laterBtn = dialog.querySelector('#g1dm-btn-later');
      if (startBtn) startBtn.disabled = true;
      if (laterBtn) laterBtn.disabled = true;

      closeModal();
      let activeProgressInstance = null;
      if (startImmediately) {
        activeProgressInstance = showInPageProgressModal(payload, payload);
      } else {
        showDownloadToast('✓ Queued in G1DM', finalName);
      }

      const onSuccess = (createdItem) => {
        if (createdItem && activeProgressInstance?.updateItem) {
          activeProgressInstance.updateItem(createdItem);
        }
      };

      const onError = (errMsg) => {
        console.warn('[G1DM Extension] Submission notification:', errMsg);
      };

      const sendViaFetch = () => {
        fetch('http://127.0.0.1:8055/api/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((createdItem) => onSuccess(createdItem))
          .catch((err) => onError(err.message));
      };

      safeSendMessage(
        { type: 'DOWNLOAD_URL', ...payload },
        (res) => {
          if (res && res.success !== false) {
            onSuccess(res?.result);
          } else {
            sendViaFetch();
          }
        },
        sendViaFetch
      );
    };

    dialog.querySelector('#g1dm-btn-start').addEventListener('click', () => submit(true));
    dialog.querySelector('#g1dm-btn-later').addEventListener('click', () => submit(false));
    dialog.querySelector('#g1dm-btn-cancel').addEventListener('click', closeModal);
    dialog.querySelector('#g1dm-modal-close').addEventListener('click', closeModal);

    root.addEventListener('click', (e) => {
      if (e.target === root) closeModal();
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', keyHandler);
      } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        submit(true);
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  // Intercept downloadable link clicks
  const DOWNLOAD_LINK_REGEX = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|dmg|pkg|exe|msi|apk|deb|rpm|mp4|mkv|webm|avi|mov|mp3|flac|wav|aac|ogg|opus|pdf|epub|mobi)(\?.*)?$/i;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || !link.href) return;
    const href = link.href;
    if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('ftp://')) return;

    const hasDownloadAttr = link.hasAttribute('download');
    const isDownloadUrl = DOWNLOAD_LINK_REGEX.test(href);

    if (hasDownloadAttr || isDownloadUrl) {
      if (e.altKey || isDownloadUrl || hasDownloadAttr) {
        e.preventDefault();
        e.stopPropagation();

        let inferredName = '';
        try {
          const u = new URL(href);
          const pathname = u.pathname;
          const leaf = pathname.split('/').filter(Boolean).pop();
          if (leaf) inferredName = decodeURIComponent(leaf);
        } catch {}

        showDownloadFileInfoModal({
          url: href,
          filename: inferredName || link.getAttribute('download') || 'download',
          category: 'other'
        });
      }
    }
  }, true);

  // ── IN-PAGE LIVE IDM DOWNLOAD PROGRESS POPUP DIALOG ─────────────────────────
  function showInPageProgressModal(initialItem, submitPayload) {
    const existing = document.getElementById('g1dm-progress-overlay');
    if (existing) existing.remove();
    const existingPill = document.getElementById('g1dm-progress-pill');
    if (existingPill) existingPill.remove();

    let downloadId = initialItem?.id || initialItem?.downloadId;
    let item = initialItem || {};
    let pollInterval = null;

    const overlay = document.createElement('div');
    overlay.id = 'g1dm-progress-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(2, 6, 23, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: g1dm-fade-in 0.2s ease-out;
      box-sizing: border-box;
    `;

    const dialog = document.createElement('div');
    dialog.id = 'g1dm-progress-dialog';
    dialog.style.cssText = `
      width: 620px;
      max-width: 95vw;
      background: #0f172a;
      border: 1px solid rgba(51, 65, 85, 0.9);
      border-radius: 18px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(14, 165, 233, 0.25);
      color: #f8fafc;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: g1dm-scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      position: relative;
    `;

    const formatBytes = (bytes) => {
      if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const formatEta = (seconds) => {
      if (!seconds || seconds <= 0 || !isFinite(seconds)) return '—';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hrs > 0) {
        return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
      }
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} remaining`;
    };

    const title = item?.mediaMetadata?.title || item?.filename || submitPayload?.filename || 'Media Download';
    const qualityBadge = item?.qualityLabel || item?.clarity || item?.resolution || submitPayload?.qualityLabel || submitPayload?.clarity || '';
    const codecBadge = item?.codec || item?.mediaMetadata?.codec || submitPayload?.codec || '';
    const filenameExt = (item?.filename || submitPayload?.filename || '').split('.').pop();
    const containerBadge = (item?.container || submitPayload?.container || filenameExt || 'MKV').toUpperCase();
    const thumbnailUrl = item?.thumbnailUrl || submitPayload?.thumbnailUrl || '';

    dialog.innerHTML = `
      <!-- Top Window Bar -->
      <div id="g1dm-prog-drag-bar" style="padding: 12px 18px; border-bottom: 1px solid rgba(51, 65, 85, 0.8); background: rgba(2, 6, 23, 0.95); display: flex; align-items: center; justify-content: space-between; cursor: move;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, #2563eb, #06b6d4); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px rgba(6, 182, 212, 0.4);">
            <span style="color: #fff; font-size: 14px; font-weight: 900;">⚡</span>
          </div>
          <span id="g1dm-prog-status-title" style="font-size: 12px; font-weight: 800; letter-spacing: 0.05em; color: #fff; text-transform: uppercase;">DOWNLOADING</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="g1dm-prog-btn-min" title="Minimize" style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(51, 65, 85, 0.8); border-radius: 8px; width: 28px; height: 28px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s ease;">−</button>
          <button id="g1dm-prog-btn-close" title="Close" style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(51, 65, 85, 0.8); border-radius: 8px; width: 28px; height: 28px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: all 0.15s ease;">✕</button>
        </div>
      </div>

      <!-- Body Content -->
      <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
        <!-- Metadata Header Card -->
        <div style="padding: 12px 14px; border-radius: 12px; background: rgba(2, 6, 23, 0.7); border: 1px solid rgba(51, 65, 85, 0.8); display: flex; align-items: center; gap: 14px;">
          ${thumbnailUrl ? `
            <div style="width: 80px; height: 54px; border-radius: 8px; overflow: hidden; background: #0f172a; border: 1px solid rgba(51, 65, 85, 0.8); flex-shrink: 0; position: relative;">
              <img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
              ${qualityBadge ? `<div style="position: absolute; bottom: 2px; right: 2px; padding: 1px 4px; border-radius: 4px; background: rgba(2, 6, 23, 0.9); font-size: 9px; font-weight: 800; color: #38bdf8; font-family: monospace;">${qualityBadge}</div>` : ''}
            </div>
          ` : `
            <div style="width: 54px; height: 54px; border-radius: 12px; background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(6, 182, 212, 0.2)); border: 1px solid rgba(6, 182, 212, 0.3); display: flex; align-items: center; justify-content: center; font-size: 24px; color: #38bdf8; flex-shrink: 0;">🎬</div>
          `}
          <div style="min-width: 0; flex: 1;">
            <div id="g1dm-prog-title" style="font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;" title="${title}">${title}</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; font-family: monospace; font-size: 11px;">
              ${qualityBadge ? `<span id="g1dm-prog-badge-res" style="padding: 2px 8px; border-radius: 6px; background: rgba(37, 99, 235, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-weight: 800;">${qualityBadge}</span>` : ''}
              ${codecBadge ? `<span id="g1dm-prog-badge-codec" style="padding: 2px 8px; border-radius: 6px; background: rgba(147, 51, 234, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #d8b4fe; font-weight: 800;">${codecBadge}</span>` : ''}
              ${containerBadge ? `<span id="g1dm-prog-badge-cont" style="padding: 2px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.4); color: #6ee7b7; font-weight: 800;">${containerBadge}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Info Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; font-size: 11px;">
          <div style="padding: 9px 12px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Download ID</span>
            <span id="g1dm-prog-id" style="font-weight: 700; color: #e2e8f0; word-break: break-all;">${downloadId || 'Initializing...'}</span>
          </div>
          <div style="padding: 9px 12px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Status</span>
            <span id="g1dm-prog-status-label" style="font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 4px;"><span class="g1dm-loader-ring"></span> Initializing Turbo Engine...</span>
          </div>
          <div style="padding: 9px 12px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Filename</span>
            <span id="g1dm-prog-filename" style="font-weight: 700; color: #e2e8f0; word-break: break-all;">${item?.filename || submitPayload?.filename || ''}</span>
          </div>
          <div style="padding: 9px 12px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">File Type</span>
            <span id="g1dm-prog-filetype" style="font-weight: 700; color: #e2e8f0;">${containerBadge}</span>
          </div>
        </div>

        <!-- Size & Percentage Banner -->
        <div style="display: flex; align-items: baseline; justify-content: space-between; font-family: monospace; font-size: 12px;">
          <div style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;">
            <span id="g1dm-prog-downloaded" style="font-weight: 800; color: #fff; font-size: 13px;">0 B</span>
            <span style="color: #64748b;">/</span>
            <span id="g1dm-prog-total" style="color: #94a3b8;">Connecting...</span>
          </div>
          <div id="g1dm-prog-percent" style="font-size: 16px; font-weight: 900; color: #22d3ee; letter-spacing: -0.02em;">0.0%</div>
        </div>

        <!-- Progress Bar with Shimmer Loading Effect -->
        <div style="position: relative; width: 100%; height: 14px; background: #020617; border-radius: 8px; padding: 2px; border: 1px solid rgba(51, 65, 85, 0.9); box-shadow: inset 0 2px 6px rgba(0,0,0,0.6); overflow: hidden; box-sizing: border-box;">
          <div id="g1dm-prog-shimmer" style="position: absolute; top: 0; left: 0; width: 55%; height: 100%; background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.75), rgba(129, 140, 248, 0.75), transparent); animation: g1dm-shimmer 1.4s infinite ease-in-out; border-radius: 6px; pointer-events: none; z-index: 2;"></div>
          <div id="g1dm-prog-bar" style="width: 0%; height: 100%; border-radius: 5px; background: linear-gradient(90deg, #2563eb, #06b6d4, #8b5cf6, #06b6d4); background-size: 300% 100%; animation: g1dm-flow-gradient 3s ease infinite; transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 14px rgba(6, 182, 212, 0.6); position: relative; z-index: 1;"></div>
        </div>

        <!-- Telemetry Matrix -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-family: monospace; font-size: 11px;">
          <div style="padding: 9px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 9px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Current Speed</span>
            <span id="g1dm-prog-speed" style="font-weight: 800; color: #34d399; font-size: 11px;"><span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #38bdf8;">⚡ Connecting...</span></span>
          </div>
          <div style="padding: 9px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 9px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Time Remaining</span>
            <span id="g1dm-prog-eta" style="font-weight: 700; color: #e2e8f0; font-size: 11px;"><span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #94a3b8;">Allocating streams...</span></span>
          </div>
          <div style="padding: 9px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 9px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Connections</span>
            <span id="g1dm-prog-conns" style="font-weight: 700; color: #38bdf8; font-size: 11px;"><span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #38bdf8;">Probing mirrors...</span></span>
          </div>
          <div style="padding: 9px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.6);">
            <span style="font-size: 9px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">Average Speed</span>
            <span id="g1dm-prog-avgspeed" style="font-weight: 700; color: #cbd5e1; font-size: 11px;">—</span>
          </div>
        </div>

        <!-- Destination Path -->
        <div id="g1dm-prog-dest-box" style="padding: 8px 12px; border-radius: 10px; background: rgba(2, 6, 23, 0.4); border: 1px solid rgba(51, 65, 85, 0.4); font-family: monospace; font-size: 10.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          📁 <span id="g1dm-prog-dest-path">${item?.finalPath || item?.destinationDir || 'Saving to default downloads directory...'}</span>
        </div>
      </div>

      <!-- Footer Action Buttons -->
      <div style="padding: 12px 20px; border-top: 1px solid rgba(51, 65, 85, 0.8); background: rgba(2, 6, 23, 0.95); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="g1dm-prog-btn-pause" style="padding: 7px 16px; border-radius: 9px; background: #d97706; border: none; color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35); transition: all 0.15s ease;">
            <span id="g1dm-prog-pause-icon">⏸</span> <span id="g1dm-prog-pause-text">Pause</span>
          </button>
          <button id="g1dm-prog-btn-open-file" style="display: none; padding: 7px 16px; border-radius: 9px; background: linear-gradient(135deg, #059669, #0d9488); border: none; color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4); transition: all 0.15s ease;">
            <span>✓</span> <span>Open File</span>
          </button>
          <button id="g1dm-prog-btn-open-folder" style="display: none; padding: 7px 14px; border-radius: 9px; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(51, 65, 85, 0.9); color: #e2e8f0; font-size: 12px; font-weight: 700; cursor: pointer; align-items: center; gap: 6px; transition: all 0.15s ease;">
            <span>📁</span> <span>Open Folder</span>
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="g1dm-prog-btn-cancel" style="padding: 7px 14px; border-radius: 9px; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(51, 65, 85, 0.9); color: #cbd5e1; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s ease;">Cancel</button>
          <button id="g1dm-prog-btn-hide" style="padding: 7px 16px; border-radius: 9px; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(51, 65, 85, 0.9); color: #f8fafc; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s ease;">Hide</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    (document.fullscreenElement || document.body || document.documentElement).appendChild(overlay);

    const closeProgress = () => {
      if (pollInterval) clearInterval(pollInterval);
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s ease';
      setTimeout(() => overlay.remove(), 200);
      const pill = document.getElementById('g1dm-progress-pill');
      if (pill) pill.remove();
    };

    // Minimized pill in bottom right
    const minimizeProgress = () => {
      overlay.style.display = 'none';
      let pill = document.getElementById('g1dm-progress-pill');
      if (!pill) {
        pill = document.createElement('div');
        pill.id = 'g1dm-progress-pill';
        pill.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
          border: 1px solid rgba(14, 165, 233, 0.5);
          box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(14, 165, 233, 0.35);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 12px;
          padding: 10px 16px;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          cursor: pointer;
          animation: g1dm-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        pill.innerHTML = `
          <div style="width: 24px; height: 24px; border-radius: 6px; background: linear-gradient(135deg, #2563eb, #06b6d4); display: flex; align-items: center; justify-content: center; font-size: 13px;">⚡</div>
          <div style="min-width: 140px; max-width: 200px;">
            <div style="font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-family: monospace; font-size: 10px; color: #22d3ee; margin-top: 2px;">
              <span id="g1dm-pill-percent">0.0%</span>
              <span id="g1dm-pill-speed" style="color: #34d399;">0 B/s</span>
            </div>
          </div>
          <button id="g1dm-pill-close" style="background: none; border: none; color: #64748b; font-size: 14px; cursor: pointer; padding: 2px 4px; margin-left: 4px;">✕</button>
        `;
        (document.fullscreenElement || document.body || document.documentElement).appendChild(pill);

        pill.addEventListener('click', (e) => {
          if (e.target.id === 'g1dm-pill-close') {
            closeProgress();
          } else {
            overlay.style.display = 'flex';
            pill.remove();
          }
        });
      }
    };

    dialog.querySelector('#g1dm-prog-btn-min').addEventListener('click', minimizeProgress);
    dialog.querySelector('#g1dm-prog-btn-close').addEventListener('click', closeProgress);
    dialog.querySelector('#g1dm-prog-btn-hide').addEventListener('click', closeProgress);

    // Draggable dialog header
    const dragBar = dialog.querySelector('#g1dm-prog-drag-bar');
    let isDragging = false, startX, startY, initLeft, initTop;
    dragBar.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      initLeft = rect.left;
      initTop = rect.top;
      dialog.style.position = 'fixed';
      dialog.style.left = `${initLeft}px`;
      dialog.style.top = `${initTop}px`;
      dialog.style.margin = '0';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      dialog.style.left = `${initLeft + (e.clientX - startX)}px`;
      dialog.style.top = `${initTop + (e.clientY - startY)}px`;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    // Action handlers
    const pauseBtn = dialog.querySelector('#g1dm-prog-btn-pause');
    const pauseText = dialog.querySelector('#g1dm-prog-pause-text');
    const pauseIcon = dialog.querySelector('#g1dm-prog-pause-icon');
    const cancelBtn = dialog.querySelector('#g1dm-prog-btn-cancel');
    const openFileBtn = dialog.querySelector('#g1dm-prog-btn-open-file');
    const openFolderBtn = dialog.querySelector('#g1dm-prog-btn-open-folder');

    pauseBtn.addEventListener('click', () => {
      if (!downloadId) return;
      const isCurrentlyPaused = item.status === 'paused';
      const actionType = isCurrentlyPaused ? 'RESUME_DOWNLOAD' : 'PAUSE_DOWNLOAD';
      const fallbackEndpoint = isCurrentlyPaused ? 'resume' : 'pause';
      safeSendMessage(
        { type: actionType, id: downloadId },
        () => {},
        () => {
          fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}/${fallbackEndpoint}`, { method: 'POST' }).catch(() => {});
        }
      );
    });

    cancelBtn.addEventListener('click', () => {
      if (downloadId) {
        safeSendMessage(
          { type: 'CANCEL_DOWNLOAD', id: downloadId },
          () => {},
          () => {
            fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}/cancel`, { method: 'POST' }).catch(() => {});
          }
        );
      }
      closeProgress();
    });

    openFileBtn.addEventListener('click', () => {
      if (!downloadId) return;
      safeSendMessage(
        { type: 'OPEN_DOWNLOAD_FILE', id: downloadId },
        () => {},
        () => {
          fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}/open-file`, { method: 'POST' }).catch(() => {});
        }
      );
    });

    openFolderBtn.addEventListener('click', () => {
      if (!downloadId) return;
      safeSendMessage(
        { type: 'OPEN_DOWNLOAD_FOLDER', id: downloadId },
        () => {},
        () => {
          fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}/open-folder`, { method: 'POST' }).catch(() => {});
        }
      );
    });

    // Update UI from live item data
    const updateUI = (data) => {
      if (!data) return;
      item = data;
      if (!downloadId && data.id) downloadId = data.id;

      const titleEl = dialog.querySelector('#g1dm-prog-status-title');
      const statusLabel = dialog.querySelector('#g1dm-prog-status-label');
      const progId = dialog.querySelector('#g1dm-prog-id');
      const progName = dialog.querySelector('#g1dm-prog-filename');
      const progDownloaded = dialog.querySelector('#g1dm-prog-downloaded');
      const progTotal = dialog.querySelector('#g1dm-prog-total');
      const progPercent = dialog.querySelector('#g1dm-prog-percent');
      const progBar = dialog.querySelector('#g1dm-prog-bar');
      const progSpeed = dialog.querySelector('#g1dm-prog-speed');
      const progEta = dialog.querySelector('#g1dm-prog-eta');
      const progConns = dialog.querySelector('#g1dm-prog-conns');
      const progAvg = dialog.querySelector('#g1dm-prog-avgspeed');
      const progDest = dialog.querySelector('#g1dm-prog-dest-path');
      const progShimmer = dialog.querySelector('#g1dm-prog-shimmer');

      if (progId) progId.innerText = data.id || downloadId || '—';
      if (progName && data.filename) progName.innerText = data.filename;
      if (progDest && (data.finalPath || data.destinationDir)) progDest.innerText = data.finalPath || data.destinationDir;

      const isCompleted = data.status === 'completed';
      const isPaused = data.status === 'paused';
      const isFailed = data.status === 'failed';
      const isMerging = data.phase === 'merging';
      const isVerifying = data.phase === 'verifying';
      const isActivelyStreaming = (data.speed && data.speed > 0) || (data.progress && data.progress > 0.1);

      if (isCompleted) {
        if (titleEl) titleEl.innerText = 'DOWNLOAD COMPLETE';
        if (statusLabel) { statusLabel.innerHTML = '<span style="color: #34d399; font-weight: 800;">✓ Completed</span>'; }
        if (progPercent) { progPercent.innerText = '100.0%'; progPercent.style.color = '#34d399'; }
        if (progBar) {
          progBar.style.width = '100%';
          progBar.style.background = 'linear-gradient(90deg, #059669, #10b981)';
        }
        if (progShimmer) progShimmer.style.display = 'none';
        if (progSpeed) progSpeed.innerText = 'Finished';
        if (progEta) progEta.innerText = 'Done';
        pauseBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        openFileBtn.style.display = 'flex';
        openFolderBtn.style.display = 'flex';
        dialog.querySelector('#g1dm-prog-btn-hide').innerText = 'Close';
      } else if (isMerging) {
        if (titleEl) titleEl.innerText = 'MULTIPLEXING MEDIA';
        if (statusLabel) { statusLabel.innerHTML = '<span class="g1dm-loader-ring" style="border-top-color:#c084fc;"></span> <span style="color:#c084fc;">Muxing Video + Audio</span>'; }
        if (progShimmer) progShimmer.style.display = 'block';
        if (progSpeed) progSpeed.innerText = 'Processing';
      } else if (isVerifying) {
        if (titleEl) titleEl.innerText = 'VERIFYING CONTAINER';
        if (statusLabel) { statusLabel.innerHTML = '<span class="g1dm-loader-ring" style="border-top-color:#fbbf24;"></span> <span style="color:#fbbf24;">Verifying Container</span>'; }
        if (progShimmer) progShimmer.style.display = 'block';
      } else if (isPaused) {
        if (titleEl) titleEl.innerText = 'DOWNLOAD PAUSED';
        if (statusLabel) { statusLabel.innerHTML = '<span style="color:#fbbf24; font-weight: 800;">⏸ Paused</span>'; }
        if (progShimmer) progShimmer.style.display = 'none';
        if (pauseIcon) pauseIcon.innerText = '▶';
        if (pauseText) pauseText.innerText = 'Resume';
        pauseBtn.style.background = '#059669';
      } else if (isFailed) {
        if (titleEl) titleEl.innerText = 'DOWNLOAD FAILED';
        if (statusLabel) { statusLabel.innerHTML = `<span style="color:#f87171; font-weight: 800;">✕ ${data.error?.message || 'Failed'}</span>`; }
        if (progShimmer) progShimmer.style.display = 'none';
      } else {
        if (titleEl) titleEl.innerText = 'DOWNLOADING';
        if (isActivelyStreaming) {
          if (statusLabel) {
            statusLabel.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#38bdf8; box-shadow:0 0 8px #38bdf8; animation:g1dm-pulse-ring 1.5s infinite; margin-right:6px;"></span> Downloading';
            statusLabel.style.color = '#38bdf8';
          }
          if (progShimmer) progShimmer.style.display = 'none';
        } else {
          if (statusLabel) {
            statusLabel.innerHTML = '<span class="g1dm-loader-ring"></span> Initializing Turbo Streams...';
            statusLabel.style.color = '#38bdf8';
          }
          if (progShimmer) progShimmer.style.display = 'block';
        }
        if (pauseIcon) pauseIcon.innerText = '⏸';
        if (pauseText) pauseText.innerText = 'Pause';
        pauseBtn.style.background = '#d97706';
      }

      if (progDownloaded && data.downloadedBytes !== undefined) {
        progDownloaded.innerText = formatBytes(data.downloadedBytes);
      }
      if (progTotal) {
        progTotal.innerText = data.totalBytes > 0 ? formatBytes(data.totalBytes) : 'Dynamic Stream';
      }
      if (progPercent && !isCompleted) {
        const pct = data.progress !== undefined ? data.progress.toFixed(1) : '0.0';
        progPercent.innerText = `${pct}%`;
      }
      if (progBar && !isCompleted) {
        const pct = Math.max(0, Math.min(100, data.progress || 0));
        progBar.style.width = `${pct}%`;
      }
      if (progSpeed && !isCompleted && !isPaused) {
        if (data.speed > 0) {
          progSpeed.innerText = `↓ ${formatBytes(data.speed)}/s`;
        } else {
          progSpeed.innerHTML = '<span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #38bdf8;">⚡ Connecting...</span>';
        }
      }
      if (progEta && !isCompleted) {
        if (isPaused) {
          progEta.innerText = 'Paused';
        } else if (data.eta && data.eta > 0) {
          progEta.innerText = formatEta(data.eta);
        } else {
          progEta.innerHTML = '<span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #94a3b8;">Allocating streams...</span>';
        }
      }
      if (progConns) {
        if (data.activeConnections && data.activeConnections > 0) {
          progConns.innerText = `${data.activeConnections} streams`;
        } else {
          progConns.innerHTML = '<span style="animation: g1dm-pulse-text 1.2s infinite ease-in-out; color: #38bdf8;">Probing mirrors...</span>';
        }
      }
      if (progAvg && data.avgSpeed !== undefined) {
        progAvg.innerText = data.avgSpeed > 0 ? `${formatBytes(data.avgSpeed)}/s` : '—';
      }

      const pillPct = document.getElementById('g1dm-pill-percent');
      const pillSpd = document.getElementById('g1dm-pill-speed');
      if (pillPct) pillPct.innerText = `${data.progress !== undefined ? data.progress.toFixed(1) : 0}%`;
      if (pillSpd) pillSpd.innerText = data.speed > 0 ? `${formatBytes(data.speed)}/s` : (isCompleted ? 'Done' : '0 B/s');
    };

    // Live poller
    const poll = () => {
      if (!downloadId) {
        const lookupDirectHttp = () => {
          fetch('http://127.0.0.1:8055/api/downloads')
            .then((r) => r.json())
            .then((list) => {
              if (Array.isArray(list) && list.length > 0) {
                const match = list.find((d) => d.url === submitPayload.url) || list[0];
                if (match) {
                  downloadId = match.id;
                  updateUI(match);
                }
              }
            })
            .catch(() => {});
        };

        safeSendMessage(
          { type: 'TEST_CONNECTION' },
          (res) => { lookupDirectHttp(); },
          lookupDirectHttp
        );
        return;
      }

      safeSendMessage(
        { type: 'GET_DOWNLOAD_PROGRESS', id: downloadId },
        (res) => {
          if (res?.success && res.data) {
            updateUI(res.data);
          } else {
            fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}`)
              .then((r) => r.json())
              .then(updateUI)
              .catch(() => {});
          }
        },
        () => {
          fetch(`http://127.0.0.1:8055/api/downloads/${downloadId}`)
            .then((r) => r.json())
            .then(updateUI)
            .catch(() => {});
        }
      );
    };

    pollInterval = setInterval(poll, 350);
    poll();

    return {
      updateItem: (data) => updateUI(data),
      close: closeProgress,
    };
  }

  function showDownloadToast(status, filename) {
    const existing = document.getElementById('g1dm-toast-root');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'g1dm-toast-root';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
      border: 1px solid rgba(16, 185, 129, 0.5);
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(16, 185, 129, 0.35);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 10px;
      padding: 12px 18px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: g1dm-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
      <div style="width: 24px; height: 24px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff;">✓</div>
      <div>
        <div style="font-size: 13px; font-weight: 700; color: #34d399;">${status}</div>
        <div style="font-size: 11px; color: #cbd5e1; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${filename}</div>
      </div>
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Runtime message listener for background actions
  const msgListener = (message, sender, sendResponse) => {
    if (message?.type === 'SHOW_DOWNLOAD_MODAL') {
      showDownloadFileInfoModal(message);
      if (typeof sendResponse === 'function') sendResponse({ success: true });
    }
  };

  try {
    if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
      browser.runtime.onMessage.addListener(msgListener);
    } else if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(msgListener);
    }
  } catch {}

  // Inject CSS keyframes
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes g1dm-scale-in {
      from { opacity: 0; transform: scale(0.94) translateY(-8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes g1dm-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes g1dm-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(250%); }
    }
    @keyframes g1dm-flow-gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes g1dm-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes g1dm-pulse-ring {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(6, 182, 212, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
    }
    @keyframes g1dm-pulse-text {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    .g1dm-loader-ring {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 2px solid rgba(56, 189, 248, 0.25);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: g1dm-spin 0.75s linear infinite;
      vertical-align: middle;
      margin-right: 5px;
    }
  `;
  (document.head || document.documentElement)?.appendChild(styleEl);

  // Initialize
  injectMainWorldBridge();
  fetchBackendMediaAnalysis(window.location.href);
  scanForVideos();
  snifferMediaRequests();

  // Polling sniffer and mutation observer
  domObserver = new MutationObserver(() => {
    if (!isExtensionContextValid()) {
      cleanupOrphanedContentScript();
      return;
    }
    injectMainWorldBridge();
    fetchBackendMediaAnalysis(window.location.href);
    scanForVideos();
  });

  try {
    domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {}

  mainIntervalId = setInterval(() => {
    if (!isExtensionContextValid()) {
      cleanupOrphanedContentScript();
      return;
    }
    injectMainWorldBridge();
    snifferMediaRequests();
    scanForVideos();
  }, 2000);
})();
