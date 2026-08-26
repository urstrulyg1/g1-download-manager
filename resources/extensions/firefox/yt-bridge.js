// G1DM YouTube In-Player Quality Bridge
// Injected safely into the main world to read quality metadata from player APIs
(function() {
  function syncQualities() {
    try {
      let maxH = 0;
      const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (ytPlayer && typeof ytPlayer.getAvailableQualityLevels === 'function') {
        const levels = ytPlayer.getAvailableQualityLevels();
        if (Array.isArray(levels) && levels.length > 0) {
          for (const lvl of levels) {
            let h = 0;
            if (lvl === 'hd4320' || lvl === 'highres') h = 4320;
            else if (lvl === 'hd2880') h = 2880;
            else if (lvl === 'hd2160') h = 2160;
            else if (lvl === 'hd1440') h = 1440;
            else if (lvl === 'hd1080') h = 1080;
            else if (lvl === 'hd720') h = 720;
            else if (lvl === 'large' || lvl === '480p') h = 480;
            else if (lvl === 'medium' || lvl === '360p') h = 360;
            else if (lvl === 'small' || lvl === '240p') h = 240;
            else if (lvl === 'tiny' || lvl === '144p') h = 144;
            if (h > maxH) maxH = h;
          }
        }
      }
      if (!maxH && window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.streamingData) {
        const formats = window.ytInitialPlayerResponse.streamingData.adaptiveFormats || [];
        for (const f of formats) {
          if (f.height && typeof f.height === 'number' && f.height > maxH) {
            maxH = f.height;
          }
        }
      }
      if (maxH > 0) {
        document.documentElement.setAttribute('data-g1dm-max-height', String(maxH));
      }
    } catch (e) {}
  }
  syncQualities();
  setInterval(syncQualities, 1500);
  window.addEventListener('load', syncQualities);
})();
