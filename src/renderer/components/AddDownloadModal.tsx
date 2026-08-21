import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Loader2,
  Server,
  Shield,
  Key,
  Globe,
  HardDrive,
  FileCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Play,
  ListOrdered,
  ShieldAlert,
} from 'lucide-react';
import { DownloadQueue, CategoryRule, Priority } from '../../shared/types';
import { api } from '../lib/api';

interface AddDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  queues: DownloadQueue[];
  categories: CategoryRule[];
  defaultDownloadDir: string;
  initialUrl?: string;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  queues,
  categories,
  defaultDownloadDir,
  initialUrl = '',
}) => {
  if (!isOpen) return null;

  const [url, setUrl] = useState(initialUrl);
  const [filename, setFilename] = useState('');
  const [destinationDir, setDestinationDir] = useState(defaultDownloadDir);
  const [category, setCategory] = useState('other');
  const [queueId, setQueueId] = useState('default');
  const [priority, setPriority] = useState<Priority>('normal');
  const [maxConnections, setMaxConnections] = useState(8);
  const [speedLimitKbps, setSpeedLimitKbps] = useState(0);

  // Probe state
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<any | null>(null);

  // Advanced toggles
  const [showAuth, setShowAuth] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [authCookies, setAuthCookies] = useState('');

  const [showProxy, setShowProxy] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyType, setProxyType] = useState<'http' | 'https' | 'socks5'>('http');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState(8080);

  const [expectedChecksum, setExpectedChecksum] = useState('');
  const [checksumAlgo, setChecksumAlgo] = useState<'sha256' | 'sha512' | 'md5'>('sha256');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Debounced URL probe
  useEffect(() => {
    if (!url.trim() || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ftp://'))) {
      setProbeResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsProbing(true);
      try {
        const authPayload =
          authUsername || authPassword || authToken || authCookies
            ? {
                username: authUsername || undefined,
                password: authPassword || undefined,
                token: authToken || undefined,
                cookies: authCookies || undefined,
              }
            : undefined;

        const proxyPayload = proxyEnabled && proxyHost ? { enabled: true, type: proxyType, host: proxyHost, port: proxyPort } : undefined;

        const res = await api.probeUrl(url.trim(), authPayload, proxyPayload);
        setProbeResult(res);
        if (!filename && res.filename) {
          setFilename(res.filename);
        }
        if (res.suggestedCategory) {
          setCategory(res.suggestedCategory);
          const matchedCat = categories.find((c) => c.id === res.suggestedCategory);
          if (matchedCat && matchedCat.defaultDestination) {
            setDestinationDir(matchedCat.defaultDestination);
          }
        }
      } catch (err: any) {
        console.warn('Probe error:', err.message);
      } finally {
        setIsProbing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [url, authUsername, authPassword, authToken, authCookies, proxyEnabled, proxyHost, proxyPort, categories]);

  const handleSubmit = async (action: 'now' | 'later' | 'queue') => {
    if (!url.trim()) return;

    setIsSubmitting(true);
    try {
      const auth =
        authUsername || authPassword || authToken || authCookies
          ? {
              username: authUsername || undefined,
              password: authPassword || undefined,
              token: authToken || undefined,
              cookies: authCookies || undefined,
            }
          : undefined;

      const proxy =
        proxyEnabled && proxyHost
          ? {
              enabled: true,
              type: proxyType,
              host: proxyHost,
              port: proxyPort,
            }
          : undefined;

      const checksum = expectedChecksum.trim()
        ? { algorithm: checksumAlgo, expected: expectedChecksum.trim() }
        : undefined;

      await api.addDownload({
        url: url.trim(),
        filename: filename.trim() || undefined,
        destinationDir: destinationDir.trim() || undefined,
        category,
        queueId,
        priority,
        maxConnections,
        speedLimitBytesPerSec: speedLimitKbps > 0 ? speedLimitKbps * 1024 : 0,
        auth,
        proxy,
        checksum,
        startImmediately: action === 'now',
      });

      onClose();
    } catch (err: any) {
      alert(`Failed to add download: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Add New Download</h2>
              <p className="text-[11px] text-slate-400">Inspect server capabilities and configure download parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* URL Input */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-slate-300">Download URL</label>
              {isProbing && (
                <div className="flex items-center gap-1 text-cyan-400 text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Scanning link security & server capabilities...</span>
                </div>
              )}
            </div>
            <input
              type="text"
              placeholder="https://example.com/file.zip or ftp://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none"
              autoFocus
            />
          </div>

          {/* Pre-Download Malicious Link Threat Warning Banner */}
          {probeResult?.safetyWarning && !probeResult.safetyWarning.isSafe && (
            <div
              className={`p-4 rounded-xl border space-y-2 animate-in fade-in duration-200 ${
                probeResult.safetyWarning.riskLevel === 'CRITICAL_MALICIOUS'
                  ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                  : 'bg-amber-950/50 border-amber-500/50 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
                <span>{probeResult.safetyWarning.warningTitle}</span>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[10px] uppercase">
                  Risk Score: {probeResult.safetyWarning.riskScore}/100
                </span>
              </div>
              <p className="text-xs opacity-90">{probeResult.safetyWarning.warningDetails}</p>
              <div className="space-y-1 pt-1">
                <div className="font-semibold text-[11px]">Identified Threat Factors:</div>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 opacity-90">
                  {probeResult.safetyWarning.reasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="text-[11px] font-semibold pt-1 text-rose-300 border-t border-rose-500/30">
                💡 Guidance: {probeResult.safetyWarning.recommendation}
              </div>
            </div>
          )}

          {/* Live Server Capability Inspection Box */}
          {probeResult && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 animate-in fade-in duration-200">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span>Detected Server Capabilities</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="text-slate-500">File Size</div>
                  <div className="font-bold text-slate-200 font-mono">
                    {probeResult.size > 0 ? formatBytes(probeResult.size) : 'Unknown (Stream)'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="text-slate-500">Range Support</div>
                  <div
                    className={`font-bold ${
                      probeResult.capabilities.supportsRange ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {probeResult.capabilities.supportsRange ? 'Yes (Multi-Socket)' : 'Single Stream'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="text-slate-500">Protocol</div>
                  <div className="font-bold text-slate-200 uppercase font-mono">
                    {probeResult.capabilities.protocol}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="text-slate-500">MIME Type</div>
                  <div className="font-bold text-slate-200 truncate font-mono" title={probeResult.mimeType}>
                    {probeResult.mimeType}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filename & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">File Name</label>
              <input
                type="text"
                placeholder="filename.ext"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Destination Directory</label>
              <input
                type="text"
                value={destinationDir}
                onChange={(e) => setDestinationDir(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Category, Queue & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Target Queue</label>
              <select
                value={queueId}
                onChange={(e) => setQueueId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500 capitalize"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Sockets & Bandwidth Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="font-semibold text-slate-300">Max Sockets per File</label>
                <span className="text-cyan-400 font-mono font-bold">{maxConnections}</span>
              </div>
              <input
                type="range"
                min={1}
                max={32}
                value={maxConnections}
                onChange={(e) => setMaxConnections(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Speed Limit (KB/s)</label>
              <input
                type="number"
                min={0}
                placeholder="0 = Unlimited"
                value={speedLimitKbps || ''}
                onChange={(e) => setSpeedLimitKbps(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Advanced Accordions: Authentication, Proxy, Checksum */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            {/* Auth Toggle */}
            <button
              type="button"
              onClick={() => setShowAuth(!showAuth)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{showAuth ? 'Hide Authentication Options' : '+ Add Credentials / Headers / Cookies'}</span>
            </button>

            {showAuth && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 animate-in fade-in duration-150">
                <div>
                  <label className="text-slate-400 mb-1 block">HTTP Basic Username</label>
                  <input
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">HTTP Basic Password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-slate-400 mb-1 block">Bearer Token or Cookies Header</label>
                  <input
                    type="text"
                    placeholder="sessionid=xyz; token=abc"
                    value={authCookies}
                    onChange={(e) => setAuthCookies(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Checksum Hash Verification */}
            <div className="pt-2">
              <label className="font-semibold text-slate-300 mb-1 block">Expected Checksum Verification</label>
              <div className="flex gap-2">
                <select
                  value={checksumAlgo}
                  onChange={(e) => setChecksumAlgo(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="sha256">SHA-256</option>
                  <option value="sha512">SHA-512</option>
                  <option value="md5">MD5</option>
                </select>
                <input
                  type="text"
                  placeholder="Paste expected file hash (optional)..."
                  value={expectedChecksum}
                  onChange={(e) => setExpectedChecksum(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSubmit('later')}
              disabled={isSubmitting || !url.trim()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Download Later
            </button>

            <button
              onClick={() => handleSubmit('queue')}
              disabled={isSubmitting || !url.trim()}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Add to Queue</span>
            </button>

            <button
              onClick={() => handleSubmit('now')}
              disabled={isSubmitting || !url.trim()}
              className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 ${
                probeResult?.safetyWarning && !probeResult.safetyWarning.isSafe
                  ? 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-amber-600/30'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30'
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-white" />
              )}
              <span>
                {probeResult?.safetyWarning && !probeResult.safetyWarning.isSafe
                  ? 'Proceed Anyway'
                  : 'Start Download'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
