// G1DM Browser Companion — Universal In-Video Download Pill & Full Format/Codec Matrix Overlay
(function () {
  'use strict';

  if (window.__G1DM_CONTENT_SCRIPT_INITIALIZED__) return;
  window.__G1DM_CONTENT_SCRIPT_INITIALIZED__ = true;

  const detectedMediaUrls = new Set();
  const videoOverlays = new Map(); // Map<HTMLVideoElement, OverlayInfo>
  let currentFilter = 'ALL';

  // Load saved user format preference if available
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['preferredVideoFormat'], (data) => {
      if (data.preferredVideoFormat) {
        currentFilter = data.preferredVideoFormat;
      }
    });
  }

  // Filter Categories
  const FILTER_TABS = [
    { id: 'ALL', label: 'All Combinations', badge: 'ALL' },
    { id: 'MKV', label: 'MKV Container', badge: 'MKV' },
    { id: 'MP4', label: 'MP4 Container', badge: 'MP4' },
    { id: 'HEVC', label: 'HEVC / H.265', badge: 'HEVC' },
    { id: 'H264', label: 'H.264 / AVC', badge: 'H.264' },
    { id: 'AV1', label: 'AV1 Next-Gen', badge: 'AV1' },
    { id: 'WEBM', label: 'WebM (VP9/AV1)', badge: 'WebM' },
    { id: 'AUDIO', label: 'Audio Only', badge: 'AUDIO' },
    { id: 'STREAMS', label: 'Live Streams', badge: 'STREAMS' }
  ];

  // Standard resolutions
  const RESOLUTION_TIERS = [
    { height: 4320, label: '8K • 4320p (FUHD)', badge: '8K', color: '#ec4899', width: 7680, bitrate: '60-120 Mbps' },
    { height: 2160, label: '4K • 2160p (UHD)', badge: '4K', color: '#c084fc', width: 3840, bitrate: '25-45 Mbps' },
    { height: 1440, label: '2K • 1440p (QHD)', badge: '2K', color: '#a855f7', width: 2560, bitrate: '16-24 Mbps' },
    { height: 1080, label: '1080p (Full HD)', badge: '1080p', color: '#38bdf8', width: 1920, bitrate: '8-12 Mbps' },
    { height: 720, label: '720p (HD)', badge: '720p', color: '#34d399', width: 1280, bitrate: '4-6 Mbps' },
    { height: 480, label: '480p (SD)', badge: '480p', color: '#fbbf24', width: 854, bitrate: '1.5-2.5 Mbps' },
    { height: 360, label: '360p (SD)', badge: '360p', color: '#94a3b8', width: 640, bitrate: '800 kbps' },
    { height: 240, label: '240p (Low)', badge: '240p', color: '#64748b', width: 426, bitrate: '400 kbps' }
  ];

  // Codec/Container Matrix definitions per resolution
  const CONTAINER_CODEC_CONFIGS = [
    {
      container: 'mkv',
      codec: 'HEVC',
      codecLabel: 'HEVC / H.265 (High Efficiency)',
      tag: 'MKV • HEVC',
      badgeColor: '#c084fc',
      filterTags: ['MKV', 'HEVC'],
      description: 'MKV Container • HEVC/H.265 (HDR & Multi-Track)'
    },
    {
      container: 'mkv',
      codec: 'H264',
      codecLabel: 'H.264 / AVC (Standard Matroska)',
      tag: 'MKV • H.264',
      badgeColor: '#818cf8',
      filterTags: ['MKV', 'H264'],
      description: 'MKV Container • H.264 AVC (Subtitles & Chapters)'
    },
    {
      container: 'mkv',
      codec: 'AV1',
      codecLabel: 'AV1 (Next-Gen Open Codec)',
      tag: 'MKV • AV1',
      badgeColor: '#06b6d4',
      filterTags: ['MKV', 'AV1'],
      description: 'MKV Container • AV1 Royalty-Free Ultra-High Compression'
    },
    {
      container: 'mp4',
      codec: 'H264',
      codecLabel: 'H.264 / AVC (Universal Compatibility)',
      tag: 'MP4 • H.264',
      badgeColor: '#38bdf8',
      filterTags: ['MP4', 'H264'],
      description: 'MP4 Container • H.264 (Plays on all devices/TVs)'
    },
    {
      container: 'mp4',
      codec: 'HEVC',
      codecLabel: 'HEVC / H.265 (Apple/SmartTV MP4)',
      tag: 'MP4 • HEVC',
      badgeColor: '#a855f7',
      filterTags: ['MP4', 'HEVC'],
      description: 'MP4 Container • HEVC (Apple & Modern Hardware)'
    },
    {
      container: 'mp4',
      codec: 'AV1',
      codecLabel: 'AV1 (Ultra-Efficiency MP4)',
      tag: 'MP4 • AV1',
      badgeColor: '#2dd4bf',
      filterTags: ['MP4', 'AV1'],
      description: 'MP4 Container • AV1 Codec'
    },
    {
      container: 'webm',
      codec: 'VP9',
      codecLabel: 'VP9 / AV1 (Google/Web Standard)',
      tag: 'WebM • VP9',
      badgeColor: '#10b981',
      filterTags: ['WEBM'],
      description: 'WebM Container • VP9/AV1 YouTube Standard'
    },
    {
      container: 'mov',
      codec: 'H264',
      codecLabel: 'QuickTime MOV (Apple ProRes/H.264)',
      tag: 'MOV • H.264',
      badgeColor: '#f43f5e',
      filterTags: ['H264'],
      description: 'QuickTime MOV Container • macOS & Final Cut Ready'
    }
  ];

  // Audio formats
  const AUDIO_FORMATS = [
    { container: 'flac', codec: 'FLAC', label: 'FLAC • Lossless Studio Master', sublabel: '24-bit / 96kHz Lossless Audio', badge: 'FLAC', color: '#f59e0b' },
    { container: 'wav', codec: 'PCM', label: 'WAV • Uncompressed PCM', sublabel: 'Original Waveform Audio', badge: 'WAV', color: '#fbbf24' },
    { container: 'm4a', codec: 'AAC', label: 'M4A • AAC High Quality', sublabel: '320 kbps Apple Music Standard', badge: 'M4A', color: '#f97316' },
    { container: 'mp3', codec: 'MP3', label: 'MP3 • Universal High Bitrate', sublabel: '320 kbps Constant Bitrate', badge: 'MP3', color: '#eab308' },
    { container: 'opus', codec: 'OPUS', label: 'OGG • OPUS Low-Latency', sublabel: '160 kbps High Fidelity Speech/Music', badge: 'OPUS', color: '#84cc16' }
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
    } catch {
      // Ignore sandboxed errors
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
    const dur = isDefault ? 600 : durationSec; // 10m default reference

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

  function buildAllCombinations(video, filter) {
    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;
    const durationSec = video.duration;
    const bestSrc = getBestMediaSource(video);
    const results = [];

    // 1. Live Sniffed Streams (.m3u8 / .mpd / direct stream)
    if (filter === 'ALL' || filter === 'STREAMS' || filter === 'MKV' || filter === 'MP4') {
      const streamUrls = Array.from(detectedMediaUrls).filter(u =>
        u.includes('.m3u8') || u.includes('.mpd') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm')
      );

      for (const sUrl of streamUrls.slice(0, 3)) {
        const isHls = sUrl.includes('.m3u8');
        const isDash = sUrl.includes('.mpd');
        const badge = isHls ? 'HLS M3U8' : isDash ? 'DASH MPD' : 'DIRECT';
        const estSize = estimateFileSize(durationSec, vHeight, 'H264', false);
        results.push({
          label: isHls ? 'Master HLS Stream (.m3u8)' : isDash ? 'DASH Manifest (.mpd)' : 'Direct Video Stream',
          formatLabel: isHls ? 'Adaptive Bitrate • M3U8 Playlist' : isDash ? 'Multi-Track • MPD Manifest' : 'Direct Stream',
          badge,
          color: isHls ? '#10b981' : isDash ? '#f59e0b' : '#38bdf8',
          url: sUrl,
          resolution: `${vWidth}×${vHeight}`,
          container: isHls ? 'mkv' : isDash ? 'mkv' : 'mp4',
          codec: 'ORIGINAL',
          estimatedSize: estSize,
          isStream: true
        });
      }
    }

    // 2. Video Resolution & Container & Codec Combinations (Show all tiers up to 8K / 4K / HD)
    for (const res of RESOLUTION_TIERS) {
      const calcWidth = Math.round(res.height * (16 / 9));
      const isCurrentPlayback = (vHeight >= res.height * 0.9 && vHeight <= res.height * 1.1) || (res.height === 1080 && vHeight <= 1080 && vHeight > 720);

      for (const cfg of CONTAINER_CODEC_CONFIGS) {
        if (filter !== 'ALL') {
          const matchTab = cfg.filterTags.includes(filter);
          if (!matchTab) continue;
        }

        const estSize = estimateFileSize(durationSec, res.height, cfg.codec, false);

        results.push({
          label: `${res.label}${isCurrentPlayback ? ' (Current Stream)' : ''}`,
          formatLabel: cfg.description,
          badge: `${res.badge} ${cfg.codec}`,
          color: cfg.badgeColor,
          url: bestSrc,
          resolution: `${calcWidth}×${res.height} • ${res.bitrate}`,
          container: cfg.container,
          codec: cfg.codec,
          height: res.height,
          estimatedSize: estSize,
          isCurrent: isCurrentPlayback
        });
      }
    }

    // 3. Audio Extraction Formats
    if (filter === 'ALL' || filter === 'AUDIO') {
      for (const aud of AUDIO_FORMATS) {
        const estSize = estimateFileSize(durationSec, 0, aud.codec, true);
        results.push({
          label: aud.label,
          formatLabel: aud.sublabel,
          badge: aud.badge,
          color: aud.color,
          url: bestSrc,
          container: aud.container,
          codec: aud.codec,
          estimatedSize: estSize,
          isAudio: true
        });
      }
    }

    return results;
  }

  function createVideoPill(video) {
    if (videoOverlays.has(video)) return;

    let activeFilter = currentFilter || 'ALL';

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
      padding: 7px 14px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
      border: 1px solid rgba(59, 130, 246, 0.65);
      border-radius: 9999px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 16px rgba(59, 130, 246, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #f8fafc;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    pill.innerHTML = `
      <div style="width: 22px; height: 22px; background: linear-gradient(135deg, #2563eb, #38bdf8); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);">⚡</div>
      <span style="letter-spacing: 0.2px;">Download Video</span>
      <span class="g1dm-res-badge" style="background: rgba(56, 189, 248, 0.18); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; padding: 2px 7px; border-radius: 6px; font-family: monospace; font-size: 10px; font-weight: 700;">1080p • ALL</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="g1dm-chevron" style="transition: transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>
    `;

    // Dropdown Menu Panel
    const dropdown = document.createElement('div');
    dropdown.className = 'g1dm-quality-dropdown';
    dropdown.style.cssText = `
      display: none;
      width: 360px;
      margin-top: 8px;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
      border: 1px solid rgba(59, 130, 246, 0.55);
      border-radius: 14px;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.9), 0 0 24px rgba(59, 130, 246, 0.3);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 12px;
      box-sizing: border-box;
      max-height: 480px;
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
      const resStr = h >= 3600 ? '8K' : h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : `${h}p`;
      badgeEl.innerText = `${resStr} • ${activeFilter}`;
    }

    function renderDropdownContent() {
      const combinations = buildAllCombinations(video, activeFilter);
      const title = getPageVideoTitle();

      // Filter tabs bar
      const tabsHtml = FILTER_TABS.map(tab => {
        const isActive = activeFilter === tab.id;
        return `
          <button class="g1dm-filter-tab" data-filter="${tab.id}" style="
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 700;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid ${isActive ? '#38bdf8' : 'rgba(255,255,255,0.1)'};
            background: ${isActive ? 'linear-gradient(135deg, #2563eb, #0284c7)' : 'rgba(30, 41, 59, 0.65)'};
            color: ${isActive ? '#ffffff' : '#94a3b8'};
            transition: all 0.15s ease;
          ">${tab.badge}</button>
        `;
      }).join('');

      let itemsHtml = combinations.map((item, idx) => `
        <div class="g1dm-combo-item" data-idx="${idx}" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 8px;
          margin-bottom: 5px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          background: rgba(30, 41, 59, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.06);
        ">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
            <span style="
              background: ${item.color}22;
              color: ${item.color};
              border: 1px solid ${item.color}66;
              padding: 3px 6px;
              border-radius: 5px;
              font-family: monospace;
              font-size: 10px;
              font-weight: 800;
              min-width: 60px;
              text-align: center;
            ">${item.badge}</span>
            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
                <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 9px; font-weight: 700; white-space: nowrap;">${item.estimatedSize}</span>
              </div>
              <span style="font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.formatLabel} ${item.resolution ? '• ' + item.resolution : ''}</span>
            </div>
          </div>
          <button class="g1dm-dl-btn" style="
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            border: 1px solid rgba(59, 130, 246, 0.5);
            color: #fff;
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
            white-space: nowrap;
          ">
            <span>Download</span>
          </button>
        </div>
      `).join('');

      dropdown.innerHTML = `
        <div style="padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">All Formats & Codecs</span>
            </div>
            <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">${combinations.length} combinations</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${tabsHtml}
          </div>
        </div>
        <div class="g1dm-items-list" style="max-height: 280px; overflow-y: auto; padding-right: 2px;">
          ${itemsHtml.length > 0 ? itemsHtml : '<div style="font-size:11px; color:#94a3b8; text-align:center; padding:16px;">No streams found for this filter</div>'}
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; gap: 6px;">
          <button id="g1dm-open-studio" style="
            flex: 1;
            padding: 7px 8px;
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(59, 130, 246, 0.35);
            color: #38bdf8;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          ">
            <span>🎬 G1DM Media Studio</span>
          </button>
          <button id="g1dm-dl-best" style="
            flex: 1;
            padding: 7px 8px;
            background: linear-gradient(135deg, #10b981, #059669);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #fff;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          ">
            <span>⚡ Best (1-Click)</span>
          </button>
        </div>
      `;

      // Filter tab clicks
      dropdown.querySelectorAll('.g1dm-filter-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          activeFilter = tabBtn.getAttribute('data-filter') || 'ALL';
          currentFilter = activeFilter;
          updateResBadge();
          renderDropdownContent();
        });
      });

      // Item download clicks
      dropdown.querySelectorAll('.g1dm-combo-item').forEach((itemEl) => {
        itemEl.addEventListener('mouseenter', () => {
          itemEl.style.background = 'rgba(59, 130, 246, 0.2)';
          itemEl.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        });
        itemEl.addEventListener('mouseleave', () => {
          itemEl.style.background = 'rgba(30, 41, 59, 0.45)';
          itemEl.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        });
        itemEl.addEventListener('click', (e) => {
          const idx = parseInt(itemEl.getAttribute('data-idx') || '0', 10);
          const selected = combinations[idx];
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

      // Footer actions
      dropdown.querySelector('#g1dm-open-studio')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'OPEN_G1DM_STUDIO',
          url: window.location.href
        });
        closeDropdown();
      });

      dropdown.querySelector('#g1dm-dl-best')?.addEventListener('click', () => {
        if (combinations.length > 0) {
          triggerDownload(combinations[0], title);
        }
        closeDropdown();
      });
    }

    function triggerDownload(item, title) {
      const ext = item.container || (item.isAudio ? 'mp3' : 'mp4');
      const filename = `${title}.${ext}`;

      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_URL',
        url: item.url || window.location.href,
        filename,
        category: item.isAudio ? 'audio' : 'video',
        format: ext,
        formatSpec: item.formatSpec,
        codec: item.codec
      });

      // Visual feedback on pill
      pill.style.borderColor = '#10b981';
      pill.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
      const textSpan = pill.querySelector('span:not(.g1dm-res-badge)');
      if (textSpan) textSpan.innerText = `✓ Added (${ext.toUpperCase()})!`;

      setTimeout(() => {
        pill.style.borderColor = 'rgba(59, 130, 246, 0.65)';
        pill.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 16px rgba(59, 130, 246, 0.4)';
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
      pill.style.borderColor = 'rgba(59, 130, 246, 0.65)';
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
      pill.style.boxShadow = '0 12px 30px -4px rgba(0, 0, 0, 0.85), 0 0 24px rgba(59, 130, 246, 0.6)';
      clearTimeout(hideTimeout);
    });

    pill.addEventListener('mouseleave', () => {
      pill.style.transform = 'none';
      pill.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 16px rgba(59, 130, 246, 0.4)';
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

  // Inject CSS keyframes
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

  setInterval(() => {
    snifferMediaRequests();
    scanForVideos();
  }, 2000);
})();
