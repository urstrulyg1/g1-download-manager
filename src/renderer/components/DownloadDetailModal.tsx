import React, { useState } from 'react';
import {
  X,
  Layers,
  Server,
  FileCheck,
  Archive,
  Shield,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Copy,
  ExternalLink,
  FolderOpen,
  Network,
  Cpu,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { DownloadItem, SegmentInfo, ChecksumInfo, ArchiveInfo, SecurityScanInfo } from '../../shared/types';
import { DownloadIntelligence, DownloadHealthReport } from '../../main/engine/DownloadIntelligence';
import { api } from '../lib/api';
import { getDownloadClarity } from '../lib/downloadClarity';

interface DownloadDetailModalProps {
  item: DownloadItem | null;
  onClose: () => void;
}

export const DownloadDetailModal: React.FC<DownloadDetailModalProps> = ({ item, onClose }) => {
  if (!item) return null;

  const [activeTab, setActiveTab] = useState<
    'segments' | 'network_map' | 'intelligence' | 'table' | 'network' | 'integrity' | 'archive' | 'security' | 'logs'
  >('segments');

  const [expectedHash, setExpectedHash] = useState(item.checksum?.expected || '');
  const [selectedAlgo, setSelectedAlgo] = useState<'sha256' | 'sha512' | 'md5'>('sha256');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveData, setArchiveData] = useState<ArchiveInfo | null>(item.archiveInfo || null);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const healthReport: DownloadHealthReport = DownloadIntelligence.calculateHealth(item, 50 * 1024 * 1024 * 1024);

  const handleVerifyChecksum = async () => {
    setIsVerifying(true);
    try {
      const res = await api.verifyChecksum(item.id, {
        algorithm: selectedAlgo,
        expected: expectedHash,
        status: 'pending',
      });
      item.checksum = res;
    } catch (err: any) {
      alert(`Checksum verification error: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleScanSecurity = async () => {
    setIsScanning(true);
    try {
      const res = await api.scanFile(item.id);
      item.securityScan = res;
    } catch (err: any) {
      alert(`Security scan error: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleInspectArchive = async () => {
    setArchiveLoading(true);
    try {
      const res = await api.inspectArchive(item.id);
      setArchiveData(res);
    } catch (err: any) {
      alert(`Archive inspect error: ${err.message}`);
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <div className="theme-overlay fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0 font-bold text-xs">
              {item.category.slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate" title={item.filename}>
                {item.filename}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                <span className="font-mono">{formatBytes(item.downloadedBytes)} / {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Stream'}</span>
                <span>•</span>
                <span className="text-cyan-400 font-mono font-semibold">{item.progress.toFixed(1)}%</span>
                {(() => {
                  const clarity = getDownloadClarity(item);
                  return clarity ? (
                    <>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-500/30">
                        {clarity}
                      </span>
                    </>
                  ) : null;
                })()}
                {item.speed > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-mono">{formatBytes(item.speed)}/s</span>
                  </>
                )}
                <span>•</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold text-[10px]">
                  Health {healthReport.healthScore}/100
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {item.status === 'completed' ? (
              <>
                <button
                  onClick={() => api.openFile(item.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  title="Open file with default application"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open File</span>
                </button>
                <button
                  onClick={() => api.openFolder(item.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  title="Reveal file in Finder / Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Show in Folder</span>
                </button>
              </>
            ) : item.status === 'downloading' ? (
              <button
                onClick={() => api.pauseDownload(item.id)}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
              >
                <Pause className="w-3.5 h-3.5 fill-white" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={() => api.resumeDownload(item.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume</span>
              </button>
            )}

            <button
              onClick={() => api.restartDownload(item.id)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all shadow-sm"
              title="Restart download from beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={async () => {
                if (confirm(`Remove download record for "${item.filename}"?`)) {
                  await api.deleteDownload(item.id, false);
                  onClose();
                }
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 active:scale-95 transition-all shadow-sm"
              title="Remove download record"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950 border-b border-slate-800 px-4 gap-1 text-xs font-medium overflow-x-auto">
          {[
            { id: 'segments', label: 'Dynamic Visualizer', icon: Layers },
            { id: 'network_map', label: 'Real-Time Network Map', icon: Network },
            { id: 'intelligence', label: 'Health & Intelligence', icon: Zap },
            { id: 'table', label: 'Segments Table', icon: Activity },
            { id: 'network', label: 'Network & Server', icon: Server },
            { id: 'integrity', label: 'File & Hash', icon: FileCheck },
            { id: 'archive', label: 'Archive Preview', icon: Archive },
            { id: 'security', label: 'Security Scan', icon: Shield },
            { id: 'logs', label: 'Activity Timeline', icon: FileText },
          ].map((tab) => {
            const IconComp = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400 font-bold bg-slate-900/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Actionable Error Recovery Banner */}
          {item.status === 'failed' && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 space-y-3 shadow-lg shadow-rose-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-rose-200">
                      Transfer Interrupted: {item.error?.code || 'ERR_DOWNLOAD_FAILED'}
                    </h4>
                    <p className="text-xs text-rose-300/90 mt-0.5">
                      {item.error?.message || 'Download encountered an unrecoverable server or socket error.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actionable Recovery Options */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    await api.retryDownload(item.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Transfer</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await api.restartDownload(item.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart Fresh (Clear State)</span>
                </button>

                {item.error?.message?.toLowerCase().includes('checksum') && (
                  <button
                    type="button"
                    onClick={handleVerifyChecksum}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Re-verify Checksum</span>
                  </button>
                )}
              </div>
            </div>
          )}
          {/* TAB 1: Dynamic Segment Visualizer */}
          {activeTab === 'segments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Dynamic Connection Segments</span>
                <span className="text-slate-400 font-mono">
                  {item.segments?.length || 0} Segment(s) allocated • {item.activeConnections} Active Sockets
                </span>
              </div>

              {item.segments && item.segments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {item.segments.map((seg) => {
                    const segTotal = seg.endOffset - seg.startOffset + 1;
                    const pct = segTotal > 0 ? Math.min(100, (seg.downloadedBytes / segTotal) * 100) : 0;
                    return (
                      <div
                        key={seg.id}
                        className={`p-3 rounded-xl border transition-all ${
                          seg.status === 'downloading'
                            ? 'bg-blue-950/40 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                            : seg.status === 'completed'
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : seg.status === 'failed'
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-2">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                            <span className="w-5 h-5 rounded-md bg-slate-800 text-blue-400 flex items-center justify-center text-[10px] font-mono">
                              #{seg.id}
                            </span>
                            <span>Worker {seg.connectionId}</span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              seg.status === 'downloading'
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : seg.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : seg.status === 'failed'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {seg.status}
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400 mb-1 flex justify-between">
                          <span>Range: [{formatBytes(seg.startOffset)} - {formatBytes(seg.endOffset)}]</span>
                          <span className="text-slate-200 font-bold">{pct.toFixed(1)}%</span>
                        </div>

                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              seg.status === 'completed'
                                ? 'bg-emerald-400'
                                : seg.status === 'downloading'
                                ? 'bg-cyan-400 animate-pulse'
                                : 'bg-slate-700'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {seg.speed > 0 && (
                          <div className="mt-2 text-[10px] text-cyan-400 font-mono flex justify-between">
                            <span>Throughput:</span>
                            <span>{formatBytes(seg.speed)}/s</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                  Single-stream mode. Range requests not available.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Real-Time Network Map */}
          {activeTab === 'network_map' && (
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-6 text-xs font-mono">
              <div className="text-slate-400 font-sans text-xs">
                Real-time topological representation of server sockets, byte ranges, and local sparse file assembly:
              </div>

              {/* Server Node */}
              <div className="flex flex-col items-center">
                <div className="px-5 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 font-bold text-center shadow-lg">
                  <div className="text-xs">🌐 Remote Server</div>
                  <div className="text-[11px] text-slate-300 font-normal">{new URL(item.url).hostname}</div>
                </div>

                <div className="h-6 w-0.5 bg-blue-500/40 my-1" />

                {/* Sockets Fan-Out Grid */}
                <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(item.segments && item.segments.length > 0 ? item.segments : [{ id: 1, connectionId: 1, speed: item.speed, status: 'downloading', startOffset: 0, endOffset: item.totalBytes }]).map((s) => (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center space-y-1 ${
                        s.status === 'completed'
                          ? 'bg-emerald-950/30 border-emerald-500/40'
                          : s.status === 'downloading'
                          ? 'bg-cyan-950/30 border-cyan-500/40 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Conn #{s.connectionId}</div>
                      <div className="text-[11px] text-cyan-300 font-bold">{s.speed > 0 ? formatBytes(s.speed) + '/s' : 'Idle'}</div>
                      <div className="text-[10px] text-slate-500">[{formatBytes(s.startOffset)} - {formatBytes(s.endOffset)}]</div>
                    </div>
                  ))}
                </div>

                <div className="h-6 w-0.5 bg-emerald-500/40 my-1" />

                {/* Local Target Assembly Node */}
                <div className="px-5 py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold text-center shadow-lg">
                  <div className="text-xs">💾 Local File Assembly ({item.progress.toFixed(1)}%)</div>
                  <div className="text-[11px] text-slate-300 font-normal truncate max-w-sm">{item.finalPath}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Intelligence & Health */}
          {activeTab === 'intelligence' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-center">
                  <div className="text-slate-400">Download Health Score</div>
                  <div className="text-3xl font-extrabold text-blue-400 font-mono">{healthReport.healthScore}/100</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-center">
                  <div className="text-slate-400">Server Reliability</div>
                  <div className="text-3xl font-extrabold text-emerald-400 font-mono">{healthReport.serverReliabilityScore}%</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-center">
                  <div className="text-slate-400">Resume Safety</div>
                  <div className="text-2xl font-extrabold text-cyan-400 font-mono">{healthReport.resumeReliability}</div>
                </div>
              </div>

              {/* Recommendations Box */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-400">Intelligence Recommendations</div>
                <ul className="space-y-1 text-slate-300">
                  {healthReport.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: Segments Table */}
          {activeTab === 'table' && (
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase">
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">Start Byte</th>
                    <th className="p-2.5">End Byte</th>
                    <th className="p-2.5">Downloaded</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Speed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {item.segments?.map((seg) => (
                    <tr key={seg.id} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-bold text-blue-400">#{seg.id}</td>
                      <td className="p-2.5">{seg.startOffset.toLocaleString()}</td>
                      <td className="p-2.5">{seg.endOffset.toLocaleString()}</td>
                      <td className="p-2.5">{seg.downloadedBytes.toLocaleString()} B</td>
                      <td className="p-2.5 capitalize">{seg.status}</td>
                      <td className="p-2.5 text-cyan-400">{seg.speed > 0 ? `${formatBytes(seg.speed)}/s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: Network & Server */}
          {activeTab === 'network' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Resource Details</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">URL:</span>
                    <div className="text-slate-200 font-mono break-all mt-0.5">{item.url}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Destination:</span>
                    <div className="text-slate-200 font-mono break-all mt-0.5">{item.finalPath}</div>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Server Capabilities</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-slate-500">Protocol</div>
                    <div className="text-slate-200 font-bold uppercase">{item.serverCapabilities.protocol}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Range Support</div>
                    <div className={item.serverCapabilities.supportsRange ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {item.serverCapabilities.supportsRange ? 'Yes (Multi-Stream)' : 'No (Single Stream)'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">HTTP Status</div>
                    <div className="text-slate-200 font-bold">{item.serverCapabilities.httpStatus || 200}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">ETag</div>
                    <div className="text-slate-200 font-mono truncate">{item.serverCapabilities.etag || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Last-Modified</div>
                    <div className="text-slate-200 font-mono truncate">{item.serverCapabilities.lastModified || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">TLS Cipher</div>
                    <div className="text-slate-200 font-mono truncate">{item.serverCapabilities.tlsCipher || 'None / Plain'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Integrity & Hash */}
          {activeTab === 'integrity' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Checksum Verification Tool</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-400 mb-1 block">Algorithm</label>
                    <select
                      value={selectedAlgo}
                      onChange={(e) => setSelectedAlgo(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200"
                    >
                      <option value="sha256">SHA-256</option>
                      <option value="sha512">SHA-512</option>
                      <option value="md5">MD5</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 mb-1 block">Expected Hash (Optional)</label>
                    <input
                      type="text"
                      placeholder="Paste expected hash to compare..."
                      value={expectedHash}
                      onChange={(e) => setExpectedHash(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 font-mono"
                    />
                  </div>
                </div>

                <button
                  onClick={handleVerifyChecksum}
                  disabled={isVerifying}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-2"
                >
                  {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Calculate & Verify Checksum</span>
                </button>

                {item.checksum?.status === 'verified' && (
                  <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Integrity Verified ✓</span>
                    </div>
                    <p className="text-xs text-emerald-200/80">
                      Calculated {item.checksum.algorithm.toUpperCase()} hash matches the expected value.
                    </p>
                  </div>
                )}

                {item.checksum?.status === 'failed' && (
                  <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
                      <XCircle className="w-5 h-5" />
                      <span>Integrity Verification Failed — Checksum Mismatch</span>
                    </div>
                    <p className="text-xs text-rose-200/90 leading-relaxed">
                      The downloaded file hash does not match expected value. The file may be corrupt or altered.
                    </p>
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        onClick={async () => {
                          await api.resolveChecksum(item.id, 'retry');
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Download</span>
                      </button>
                      <button
                        onClick={async () => {
                          await api.resolveChecksum(item.id, 'keep');
                          if (item.checksum) item.checksum.status = 'verified';
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700"
                      >
                        <span>Keep File Anyway</span>
                      </button>
                      <button
                        onClick={async () => {
                          await api.resolveChecksum(item.id, 'delete');
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 font-semibold text-xs border border-slate-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete File</span>
                      </button>
                    </div>
                  </div>
                )}

                {item.checksum?.actual && (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[10px]">Calculated {item.checksum.algorithm.toUpperCase()} Hash:</div>
                    <div className="text-emerald-400 font-mono font-bold break-all">{item.checksum.actual}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: Archive Preview */}
          {activeTab === 'archive' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Archive File Explorer</span>
                <button
                  onClick={handleInspectArchive}
                  disabled={archiveLoading}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                >
                  {archiveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Inspect Archive Entries</span>
                </button>
              </div>

              {archiveData && archiveData.isArchive ? (
                <div className="space-y-2">
                  <div className="flex gap-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                    <div>Entries: <span className="font-bold text-white">{archiveData.entryCount}</span></div>
                    <div>Uncompressed: <span className="font-bold text-white">{formatBytes(archiveData.totalUncompressedSize)}</span></div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  Click "Inspect Archive Entries" to safely view files inside this ZIP/APK without extracting.
                </div>
              )}
            </div>
          )}

          {/* TAB 8: Security Scan */}
          {activeTab === 'security' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Antivirus Security Scanner Hook</div>
                <button
                  onClick={handleScanSecurity}
                  disabled={isScanning}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-2"
                >
                  {isScanning && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Run Antivirus Scan Now</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: Activity Timeline */}
          {activeTab === 'logs' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 max-h-72 overflow-y-auto font-mono text-[11px] space-y-1">
              {item.logs && item.logs.length > 0 ? (
                item.logs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-slate-500">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span
                      className={`font-bold ${
                        l.level === 'error'
                          ? 'text-rose-400'
                          : l.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      [{l.level.toUpperCase()}]
                    </span>
                    <span className="text-slate-300">{l.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-center py-4">No events logged yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
