import React, { useState } from 'react';
import {
  ListOrdered,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  Settings,
  FolderOpen,
  Gauge,
  Network,
  ArrowUpDown,
} from 'lucide-react';
import { DownloadQueue, DownloadItem, AppSettings } from '../../shared/types';
import { Language } from '../lib/i18n';
import { api } from '../lib/api';

interface QueuesViewProps {
  queues: DownloadQueue[];
  downloads: DownloadItem[];
  settings: AppSettings | null;
  lang: Language;
  onRefresh: () => void;
}

export const QueuesView: React.FC<QueuesViewProps> = ({ queues, downloads, settings, onRefresh }) => {
  const [editingQueue, setEditingQueue] = useState<Partial<DownloadQueue> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const defaultDir = settings?.general.defaultDownloadDir ?? '';

  const handleOpenAdd = () => {
    setEditingQueue({
      id: `q_${Date.now()}`,
      name: '',
      priority: 3,
      mode: 'parallel',
      maxConcurrentDownloads: settings?.downloads.maxConcurrentDownloads ?? 4,
      maxConnectionsPerDownload: settings?.downloads.defaultConnectionsPerDownload ?? 8,
      speedLimitBytesPerSec: 0,
      destinationDir: defaultDir,
      status: 'active',
      schedule: {
        enabled: false,
        startTime: '00:00',
        stopTime: '06:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        onCompleteAction: 'nothing',
      },
      downloadIds: [],
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQueue) return;
    await api.saveQueue(editingQueue);
    setIsModalOpen(false);
    setEditingQueue(null);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (id === 'default') {
      alert('Cannot delete the default download queue.');
      return;
    }
    await api.deleteQueue(id);
    onRefresh();
  };

  const toggleQueueStatus = async (queue: DownloadQueue) => {
    const newStatus = queue.status === 'active' ? 'stopped' : 'active';
    await api.saveQueue({ ...queue, status: newStatus });
    onRefresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-indigo-400" />
            <span>Download Queues & Enterprise Scheduler</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Organize downloads into dedicated parallel or sequential queues with custom bandwidth schedules
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/50 transition-all duration-200 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Queue</span>
        </button>
      </div>

      {/* Queues Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {queues.map((queue) => {
          const queueItems = downloads.filter((d) => d.queueId === queue.id);
          const activeItems = queueItems.filter((d) => d.status === 'downloading');
          const queuedItems = queueItems.filter((d) => d.status === 'queued');
          const completedItems = queueItems.filter((d) => d.status === 'completed');

          return (
            <div
              key={queue.id}
              className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg shadow-indigo-500/10 space-y-4 relative overflow-hidden transition-all duration-200 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/20 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{queue.name}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        queue.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {queue.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                    <span>Mode: <strong className="text-slate-200 capitalize">{queue.mode}</strong></span>
                    <span>•</span>
                    <span>Concurrency: <strong className="text-slate-200">{queue.maxConcurrentDownloads}</strong></span>
                    <span>•</span>
                    <span>Priority: <strong className="text-slate-200">{queue.priority}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleQueueStatus(queue)}
                    className={`p-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      queue.status === 'active'
                        ? 'bg-amber-500/20 text-amber-300 shadow-sm shadow-amber-500/20 hover:bg-amber-500/30 hover:shadow-md hover:shadow-amber-500/35'
                        : 'bg-emerald-500/20 text-emerald-300 shadow-sm shadow-emerald-500/20 hover:bg-emerald-500/30 hover:shadow-md hover:shadow-emerald-500/35'
                    }`}
                    title={queue.status === 'active' ? 'Pause Queue' : 'Start Queue'}
                  >
                    {queue.status === 'active' ? <Pause className="w-4 h-4 fill-amber-400" /> : <Play className="w-4 h-4 fill-emerald-400" />}
                  </button>

                  <button
                    onClick={() => {
                      setEditingQueue(queue);
                      setIsModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white shadow-sm shadow-slate-900/20 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 active:scale-95"
                    title="Queue Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {queue.id !== 'default' && (
                    <button
                      onClick={() => handleDelete(queue.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 shadow-sm shadow-slate-900/20 hover:shadow-md hover:shadow-rose-500/30 transition-all duration-200 active:scale-95"
                      title="Delete Queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Status Breakdown Bar */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>{activeItems.length} Active / {queuedItems.length} Queued / {completedItems.length} Done</span>
                  <span>Total {queueItems.length} items</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                  <div
                    className="bg-cyan-400 transition-all duration-300"
                    style={{ width: `${(activeItems.length / (queueItems.length || 1)) * 100}%` }}
                    title="Active"
                  />
                  <div
                    className="bg-purple-400 transition-all duration-300"
                    style={{ width: `${(queuedItems.length / (queueItems.length || 1)) * 100}%` }}
                    title="Queued"
                  />
                  <div
                    className="bg-emerald-400 transition-all duration-300"
                    style={{ width: `${(completedItems.length / (queueItems.length || 1)) * 100}%` }}
                    title="Completed"
                  />
                </div>
              </div>

              {/* Schedule Info Box */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    <span>Automated Schedule</span>
                  </div>
                  <span className={`text-[10px] font-bold ${queue.schedule?.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {queue.schedule?.enabled ? 'Active Window' : 'Disabled'}
                  </span>
                </div>
                {queue.schedule?.enabled && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    Runs between <strong>{queue.schedule.startTime}</strong> and <strong>{queue.schedule.stopTime}</strong> (Days: {queue.schedule.daysOfWeek.join(', ')})
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && editingQueue && (
        <div className="theme-overlay fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs overflow-y-auto max-h-[90vh]"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">
                {editingQueue.createdAt ? 'Edit Queue' : 'Create New Queue'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors duration-150"
              >
                ✕
              </button>
            </div>

            {/* Queue Name */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Queue Name</label>
              <input
                type="text"
                value={editingQueue.name || ''}
                onChange={(e) => setEditingQueue({ ...editingQueue, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                placeholder="e.g. Large Files, Night Downloads…"
                required
              />
            </div>

            {/* Destination Directory */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                Destination Folder
              </label>
              <input
                type="text"
                value={editingQueue.destinationDir || ''}
                onChange={(e) => setEditingQueue({ ...editingQueue, destinationDir: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono text-[11px] focus:border-blue-500/50 focus:outline-none transition-colors"
                placeholder={defaultDir || '/path/to/downloads'}
                required
              />
            </div>

            {/* Mode + Concurrency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Execution Mode</label>
                <select
                  value={editingQueue.mode || 'parallel'}
                  onChange={(e) => setEditingQueue({ ...editingQueue, mode: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                >
                  <option value="parallel">Parallel (Simultaneous)</option>
                  <option value="sequential">Sequential (One at a time)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Max Active Downloads</label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={editingQueue.maxConcurrentDownloads ?? 4}
                  onChange={(e) =>
                    setEditingQueue({ ...editingQueue, maxConcurrentDownloads: parseInt(e.target.value, 10) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Connections per download + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-cyan-400" />
                  Connections / File
                </label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={editingQueue.maxConnectionsPerDownload ?? 8}
                  onChange={(e) =>
                    setEditingQueue({ ...editingQueue, maxConnectionsPerDownload: parseInt(e.target.value, 10) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                  Priority
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editingQueue.priority ?? 3}
                  onChange={(e) =>
                    setEditingQueue({ ...editingQueue, priority: parseInt(e.target.value, 10) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Speed Limit */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-rose-400" />
                Speed Limit (KB/s) — <span className="text-slate-400 font-normal">0 = unlimited</span>
              </label>
              <input
                type="number"
                min={0}
                value={Math.round((editingQueue.speedLimitBytesPerSec ?? 0) / 1024)}
                onChange={(e) =>
                  setEditingQueue({ ...editingQueue, speedLimitBytesPerSec: parseInt(e.target.value, 10) * 1024 })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Schedule section */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Enable Automated Schedule Window</span>
                </label>
                <input
                  type="checkbox"
                  checked={editingQueue.schedule?.enabled || false}
                  onChange={(e) =>
                    setEditingQueue({
                      ...editingQueue,
                      schedule: { ...(editingQueue.schedule || ({} as any)), enabled: e.target.checked },
                    })
                  }
                  className="rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-900 cursor-pointer"
                />
              </div>

              {editingQueue.schedule?.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 mb-1 block">Start Time</label>
                      <input
                        type="time"
                        value={editingQueue.schedule?.startTime || '00:00'}
                        onChange={(e) =>
                          setEditingQueue({
                            ...editingQueue,
                            schedule: { ...editingQueue.schedule!, startTime: e.target.value },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">Stop Time</label>
                      <input
                        type="time"
                        value={editingQueue.schedule?.stopTime || '06:00'}
                        onChange={(e) =>
                          setEditingQueue({
                            ...editingQueue,
                            schedule: { ...editingQueue.schedule!, stopTime: e.target.value },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 block">On Complete Action</label>
                    <select
                      value={editingQueue.schedule?.onCompleteAction || 'nothing'}
                      onChange={(e) =>
                        setEditingQueue({
                          ...editingQueue,
                          schedule: { ...editingQueue.schedule!, onCompleteAction: e.target.value as any },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:border-blue-500/50 focus:outline-none transition-colors"
                    >
                      <option value="nothing">Do nothing</option>
                      <option value="notification">Send notification</option>
                      <option value="sleep">Sleep system</option>
                      <option value="shutdown">Shutdown system</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold shadow-sm shadow-slate-900/20 hover:shadow-md hover:shadow-slate-500/20 transition-all duration-200 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-200 active:scale-95"
              >
                Save Queue
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
