import React, { useState } from 'react';
import {
  Zap,
  Radio,
  Layers,
  Globe,
  Wifi,
  Lock,
  Cloud,
  Bot,
  FolderArchive,
  CheckCircle2,
  Play,
  Key,
  Loader2,
  FolderCog,
  Link2,
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';

export const PowerFeaturesView: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = translations[lang] || translations.en;
  const [activeTab, setActiveTab] = useState<'media' | 'network' | 'automation' | 'cloud' | 'vault' | 'bot'>('media');

  // Media state — separate loading flags per action
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<any>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [enqueueLoading, setEnqueueLoading] = useState(false);

  const [dvrStreamUrl, setDvrStreamUrl] = useState('');
  const [dvrTitle, setDvrTitle] = useState('');
  const [dvrDurationSec, setDvrDurationSec] = useState(300);
  const [dvrLoading, setDvrLoading] = useState(false);
  const [dvrSuccess, setDvrSuccess] = useState<string | null>(null);
  const [dvrError, setDvrError] = useState<string | null>(null);

  // Network state
  const [magnetUri, setMagnetUri] = useState('');
  const [magnetResult, setMagnetResult] = useState<any>(null);
  const [magnetError, setMagnetError] = useState<string | null>(null);
  const [magnetLoading, setMagnetLoading] = useState(false);
  const [pingThreshold, setPingThreshold] = useState(80);
  const [latencySenseActive, setLatencySenseActive] = useState(true);

  // Debrid state
  const [unrestrictUrl, setUnrestrictUrl] = useState('');
  const [unrestrictResult, setUnrestrictResult] = useState<any>(null);
  const [unrestrictError, setUnrestrictError] = useState<string | null>(null);
  const [unrestrictLoading, setUnrestrictLoading] = useState(false);

  // Automation state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvent, setWebhookEvent] = useState('DOWNLOAD_COMPLETED');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(true);
  const [autoExtractDelete, setAutoExtractDelete] = useState(false);

  // Vault state
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultItems, setVaultItems] = useState<any[]>([]);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);

  // Bot state
  const [botCommand, setBotCommand] = useState('');
  const [botLogs, setBotLogs] = useState<string[]>(['🤖 G1DM Bot Ready']);

  const handleParsePlaylist = async () => {
    if (!playlistUrl) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    try {
      const res = await fetch('/api/media/playlist/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playlistUrl }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setPlaylistResult(data);
    } catch (err: any) {
      setPlaylistError(err.message || 'Failed to parse playlist.');
    } finally {
      setPlaylistLoading(false);
    }
  };

  const handleEnqueuePlaylist = async () => {
    if (!playlistResult) return;
    setEnqueueLoading(true);
    setPlaylistError(null);
    try {
      const res = await fetch('/api/media/playlist/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: playlistResult }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setPlaylistResult({ ...playlistResult, _enqueued: data.enqueuedIds?.length || 0 });
    } catch (err: any) {
      setPlaylistError(err.message || 'Failed to enqueue playlist.');
    } finally {
      setEnqueueLoading(false);
    }
  };

  const handleScheduleDVR = async () => {
    if (!dvrStreamUrl) return;
    if (dvrDurationSec < 1) { setDvrError('Duration must be at least 1 second.'); return; }
    setDvrLoading(true);
    setDvrError(null);
    setDvrSuccess(null);
    try {
      const res = await fetch('/api/media/dvr/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl: dvrStreamUrl,
          title: dvrTitle || 'Live DVR Recording',
          startTimeEpochMs: Date.now() + 5000,
          durationSec: Number(dvrDurationSec),
          outputFilename: `dvr_${Date.now()}.mp4`,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setDvrSuccess(`DVR recording scheduled (ID: ${data.id})`);
    } catch (err: any) {
      setDvrError(err.message || 'Failed to schedule DVR recording.');
    } finally {
      setDvrLoading(false);
    }
  };

  const handleAddTorrent = async () => {
    if (!magnetUri) return;
    setMagnetLoading(true);
    setMagnetError(null);
    try {
      const res = await fetch('/api/torrent/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetOrFilePath: magnetUri }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setMagnetResult(data);
    } catch (err: any) {
      setMagnetError(err.message || 'Failed to add torrent.');
    } finally {
      setMagnetLoading(false);
    }
  };

  const handleUnrestrictLink = async () => {
    if (!unrestrictUrl) return;
    setUnrestrictLoading(true);
    setUnrestrictError(null);
    try {
      const res = await fetch('/api/debrid/unrestrict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: unrestrictUrl, provider: 'real-debrid' }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setUnrestrictResult(data);
    } catch (err: any) {
      setUnrestrictError(err.message || 'Debrid unrestrict failed.');
    } finally {
      setUnrestrictLoading(false);
    }
  };

  const handleUnlockVault = async () => {
    setVaultError(null);
    setVaultLoading(true);
    try {
      const res = await fetch('/api/security/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: vaultPassword }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      // Clear password from state immediately — do not hold it in memory
      setVaultPassword('');
      setVaultUnlocked(data.unlocked);
      if (data.unlocked) {
        const itemsRes = await fetch('/api/security/vault/items');
        setVaultItems(await itemsRes.json());
      } else {
        setVaultError('Incorrect vault password.');
      }
    } catch (err: any) {
      setVaultPassword('');
      setVaultError(err.message || 'Failed to unlock vault.');
    } finally {
      setVaultLoading(false);
    }
  };

  const handleSendBotCommand = async () => {
    if (!botCommand) return;
    const cmd = botCommand;
    setBotCommand('');
    // Cap log at 200 entries to prevent unbounded memory growth
    setBotLogs((prev) => [...prev.slice(-199), `> ${cmd}`]);
    try {
      const res = await fetch('/api/remote/bot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandText: cmd }),
      });
      const data = await res.json();
      setBotLogs((prev) => [...prev.slice(-199), data.responseText]);
    } catch (err: any) {
      setBotLogs((prev) => [...prev.slice(-199), `❌ Error: ${err.message}`]);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    setWebhookLoading(true);
    setWebhookError(null);
    setWebhookSuccess(null);
    try {
      const res = await fetch('/api/automation/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, event: webhookEvent }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      setWebhookSuccess('Webhook test delivered successfully.');
    } catch (err: any) {
      setWebhookError(err.message || 'Webhook test failed.');
    } finally {
      setWebhookLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <span>G1DM Next-Gen Power Features & Superpowers</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Playlist Batch Grabber, Live DVR, BitTorrent Acceleration, Encrypted Vault, Debrid Integrations, and Remote Control Bot
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
        {[
          { id: 'media', label: '🎥 Media & Streaming', icon: Radio },
          { id: 'network', label: '⚡ Speed & Torrent', icon: Wifi },
          { id: 'automation', label: '🤖 Automation & Webhooks', icon: FolderArchive },
          { id: 'cloud', label: '☁️ Debrid & Cloud Sync', icon: Cloud },
          { id: 'vault', label: '🔒 Encrypted Vault', icon: Lock },
          { id: 'bot', label: '📱 Remote Bot & Control', icon: Bot },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-amber-400 text-amber-400 bg-amber-400/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 1. MEDIA */}
      {activeTab === 'media' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Playlist Grabber */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Full Playlist & Channel Multi-Threaded Batch Grabber</span>
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Paste YouTube playlist, Vimeo channel, or SoundCloud URL..."
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono text-xs"
              />
              <button
                onClick={handleParsePlaylist}
                disabled={playlistLoading}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {playlistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Extract Playlist Items</span>
              </button>
            </div>

            {playlistError && (
              <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                <span>{playlistError}</span>
                <button onClick={() => setPlaylistError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
              </div>
            )}

            {playlistResult && (
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                <div className="font-bold text-slate-200">{playlistResult.playlistTitle}</div>
                <div className="text-slate-400 text-[11px]">Discovered {playlistResult.totalTracks} tracks</div>
                {playlistResult._enqueued != null && (
                  <div className="text-emerald-400 text-[11px] font-semibold">✓ {playlistResult._enqueued} tracks enqueued!</div>
                )}
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {playlistResult.tracks?.map((t: any) => (
                    <div key={t.trackNumber} className="text-[11px] font-mono text-slate-300 truncate">
                      {t.filename}
                    </div>
                  ))}
                </div>
                {!playlistResult._enqueued && (
                  <button
                    onClick={handleEnqueuePlaylist}
                    disabled={enqueueLoading}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {enqueueLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    Enqueue All Tracks to Download Manager
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Live DVR */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Live Stream Auto-DVR & Scheduled Recording</span>
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Live Stream HLS / RTMP URL (.m3u8)..."
                value={dvrStreamUrl}
                onChange={(e) => setDvrStreamUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono text-xs"
              />
              <input
                type="text"
                placeholder="Stream Title (Optional)"
                value={dvrTitle}
                onChange={(e) => setDvrTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 text-xs"
              />
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Duration (sec):</span>
                <input
                  type="number"
                  min={1}
                  value={dvrDurationSec}
                  onChange={(e) => setDvrDurationSec(Number(e.target.value))}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-slate-200 text-xs font-mono"
                />
              </div>
              <button
                onClick={handleScheduleDVR}
                disabled={dvrLoading || !dvrStreamUrl}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {dvrLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Schedule Live DVR Recording
              </button>
            </div>

            {dvrError && (
              <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                <span>{dvrError}</span>
                <button onClick={() => setDvrError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
              </div>
            )}
            {dvrSuccess && (
              <div role="status" className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs">
                {dvrSuccess}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. NETWORK */}
      {activeTab === 'network' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* BitTorrent Acceleration */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>BitTorrent & Magnet Link Acceleration Engine</span>
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Paste magnet URI (magnet:?xt=urn:btih:...)"
                value={magnetUri}
                onChange={(e) => setMagnetUri(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono text-xs"
              />
              <button
                onClick={handleAddTorrent}
                disabled={magnetLoading || !magnetUri}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {magnetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Start Accelerated Torrent Download
              </button>
            </div>

            {magnetError && (
              <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                <span>{magnetError}</span>
                <button onClick={() => setMagnetError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
              </div>
            )}
            {magnetResult && (
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400">{magnetResult.name}</div>
                <div className="text-slate-400">InfoHash: {magnetResult.infoHash}</div>
                <div className="text-slate-300">
                  Seeders: {magnetResult.seeders} | WebSeed Acceleration: Active
                </div>
              </div>
            )}
          </div>

          {/* Zero-Lag RTT Latency Sense */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span>Zero-Lag RTT Latency Sense (Ping-Adaptive Auto-Throttling)</span>
            </h3>
            <p className="text-slate-400 text-xs">
              Automatically detects gaming or video call ping spikes and throttles background downloads in real time.
            </p>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Latency Sense Active</span>
                <input
                  type="checkbox"
                  checked={latencySenseActive}
                  onChange={(e) => setLatencySenseActive(e.target.checked)}
                  className="rounded text-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Max Ping Threshold (ms):</span>
                <input
                  type="number"
                  value={pingThreshold}
                  onChange={(e) => setPingThreshold(Number(e.target.value))}
                  className="w-20 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. AUTOMATION */}
      {activeTab === 'automation' && (
        <div className="space-y-5 text-xs">
          {/* Webhooks */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-indigo-400" />
              <span>Post-Download Webhook Triggers</span>
            </h3>
            <p className="text-slate-400">
              Fire HTTP POST payloads to Discord, Slack, IFTTT, or any custom endpoint when download events occur.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Webhook URL</label>
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Trigger Event</label>
                <select
                  value={webhookEvent}
                  onChange={(e) => setWebhookEvent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200"
                >
                  <option value="DOWNLOAD_COMPLETED">Download Completed</option>
                  <option value="DOWNLOAD_FAILED">Download Failed</option>
                  <option value="DOWNLOAD_STARTED">Download Started</option>
                  <option value="BATCH_COMPLETED">Batch Completed</option>
                </select>
              </div>
              <button
                onClick={handleTestWebhook}
                disabled={webhookLoading || !webhookUrl}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl disabled:opacity-60 flex items-center gap-2"
              >
                {webhookLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Test Payload
              </button>
              {webhookError && (
                <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300">
                  <span>{webhookError}</span>
                  <button onClick={() => setWebhookError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
                </div>
              )}
              {webhookSuccess && (
                <div role="status" className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300">
                  {webhookSuccess}
                </div>
              )}
            </div>
          </div>

          {/* Auto-Extract Archives */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderCog className="w-4 h-4 text-amber-400" />
              <span>Auto-Extract Compressed Archives</span>
            </h3>
            <p className="text-slate-400">
              Automatically extract .zip, .rar, and .7z archives after download completes, using auto-matched password lists.
            </p>
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoExtract}
                  onChange={(e) => setAutoExtract(e.target.checked)}
                  className="rounded text-amber-500"
                />
                <span className="text-slate-300 font-semibold">Auto-extract archives on completion</span>
              </label>
              {autoExtract && (
                <label className="flex items-center gap-2 cursor-pointer pl-5">
                  <input
                    type="checkbox"
                    checked={autoExtractDelete}
                    onChange={(e) => setAutoExtractDelete(e.target.checked)}
                    className="rounded text-rose-500"
                  />
                  <span className="text-slate-400">Delete archive after successful extraction</span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. CLOUD & DEBRID */}
      {activeTab === 'cloud' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs shadow-xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            <span>Debrid & Multi-Host Link Unrestrictor</span>
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Paste Rapidgator, 1Fichier, or Mega restricted link..."
              value={unrestrictUrl}
              onChange={(e) => setUnrestrictUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono"
            />
            <button
              onClick={handleUnrestrictLink}
              disabled={unrestrictLoading || !unrestrictUrl}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl disabled:opacity-60 flex items-center gap-2"
            >
              {unrestrictLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Unrestrict High-Speed Link
            </button>

            {unrestrictError && (
              <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300">
                <span>{unrestrictError}</span>
                <button onClick={() => setUnrestrictError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
              </div>
            )}
            {unrestrictResult && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-xs break-all">
                Unrestricted: {unrestrictResult.downloadUrl}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. VAULT */}
      {activeTab === 'vault' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs shadow-xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Hardware-Encrypted AES-256 Download Vault</span>
          </h3>

          {!vaultUnlocked ? (
            <div className="space-y-3 max-w-md">
              <input
                type="password"
                placeholder="Enter Vault Master Password"
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
              />
              <button
                onClick={handleUnlockVault}
                disabled={vaultLoading || !vaultPassword}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {vaultLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                <span>Unlock Hardware Encrypted Vault</span>
              </button>
              {vaultError && (
                <div role="alert" className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300">
                  {vaultError}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Vault Unlocked & Active</span>
              </div>
              {vaultItems.length === 0 ? (
                <p className="text-slate-400 text-xs">
                  No encrypted items stored yet. Use the download manager to move files into the vault after completion.
                </p>
              ) : (
                <p className="text-slate-300 text-xs">
                  {vaultItems.length} encrypted item{vaultItems.length === 1 ? '' : 's'} stored in disk vault.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. BOT */}
      {activeTab === 'bot' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs shadow-xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            <span>Telegram & Discord Remote Control Bot Terminal</span>
          </h3>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-48 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-1">
            {botLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter bot command (e.g. /add <url>, /status, /pause, /resume)..."
              value={botCommand}
              onChange={(e) => setBotCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendBotCommand()}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono text-xs"
            />
            <button
              onClick={handleSendBotCommand}
              disabled={!botCommand}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
