import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Play,
  Pause,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Filter,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { SiteGrabberProject } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface SiteGrabberViewProps {
  projects: SiteGrabberProject[];
  lang: Language;
  onRefresh: () => void;
}

export const SiteGrabberView: React.FC<SiteGrabberViewProps> = ({ projects, lang, onRefresh }) => {
  const t = translations[lang] || translations.en;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<SiteGrabberProject | null>(null);

  // New Project Form state
  const [name, setName] = useState('Docs Mirror Project');
  const [startUrl, setStartUrl] = useState('https://');
  const [maxDepth, setMaxDepth] = useState(2);
  const [stayOnDomain, setStayOnDomain] = useState(true);
  const [allowSubdomains, setAllowSubdomains] = useState(true);
  const [extensions, setExtensions] = useState('pdf, zip, png, jpg, html');
  const [destDir, setDestDir] = useState('/home/user/Downloads/Grabber');

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startUrl.trim()) return;

    const includeExts = extensions
      .split(',')
      .map((s) => s.trim().toLowerCase().replace('.', ''))
      .filter(Boolean);

    await api.saveGrabberProject({
      name: name.trim() || 'Site Project',
      startUrl: startUrl.trim(),
      maxDepth,
      stayOnDomain,
      allowSubdomains,
      filters: {
        includeExtensions: includeExts,
        excludeExtensions: [],
      },
      destinationDir: destDir,
      status: 'idle',
      discoveredUrls: [],
      totalDiscovered: 0,
      totalDownloaded: 0,
    });

    setIsModalOpen(false);
    onRefresh();
  };

  const handleStartCrawl = async (id: string) => {
    await api.startGrabberProject(id);
    onRefresh();
  };

  const handleStopCrawl = async (id: string) => {
    await api.stopGrabberProject(id);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await api.deleteGrabberProject(id);
    if (selectedProject?.id === id) setSelectedProject(null);
    onRefresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <span>Site Grabber & Public Dataset Mirror</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Recursively explore authorized public websites, extract matching assets, and mirror hierarchical resources
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
        >
          <Plus className="w-4 h-4" />
          <span>New Grabber Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Project List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="text-xs font-bold uppercase text-slate-400">Projects ({projects.length})</div>
          {projects.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-500 text-xs">
              No grabber projects created yet.
            </div>
          ) : (
            projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => setSelectedProject(proj)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedProject?.id === proj.id
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white truncate max-w-[180px]">{proj.name}</h3>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5 max-w-[200px]">
                      {proj.startUrl}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                      proj.status === 'crawling'
                        ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                        : proj.status === 'completed'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {proj.status}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Discovered: <strong className="text-slate-200">{proj.totalDiscovered}</strong></span>
                  <span>Downloaded: <strong className="text-emerald-400">{proj.totalDownloaded}</strong></span>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-end gap-1.5">
                  {proj.status === 'crawling' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStopCrawl(proj.id);
                      }}
                      className="p-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold flex items-center gap-1"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCrawl(proj.id);
                      }}
                      className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Crawl</span>
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(proj.id);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: Discovered URLs Inspector */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col min-h-[400px]">
          {selectedProject ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedProject.name} — Discovered Resources</h3>
                  <p className="text-xs text-slate-400">
                    Depth: {selectedProject.maxDepth} • Target: {selectedProject.startUrl}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    {selectedProject.totalDownloaded} / {selectedProject.totalDiscovered} Enqueued
                  </span>
                </div>
              </div>

              {/* URL Table */}
              <div className="flex-1 overflow-y-auto max-h-96 rounded-xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-sans">
                      <th className="p-2.5">Depth</th>
                      <th className="p-2.5">Resource URL</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {selectedProject.discoveredUrls && selectedProject.discoveredUrls.length > 0 ? (
                      selectedProject.discoveredUrls.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-blue-400 font-bold">D{d.depth}</td>
                          <td className="p-2.5 truncate max-w-md text-slate-300" title={d.url}>
                            {d.url}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold capitalize ${
                                d.status === 'downloaded'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : d.status === 'enqueued'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-center py-12 text-slate-500 font-sans text-xs">
                          Start crawling to discover downloadable assets.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Globe className="w-8 h-8 text-slate-600 mb-2" />
              <span>Select a project from the left or create a new one.</span>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="theme-overlay fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateProject}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">Create Site Grabber Project</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Starting Root URL</label>
              <input
                type="url"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Max Crawl Depth (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">File Extensions to Grab</label>
                <input
                  type="text"
                  value={extensions}
                  onChange={(e) => setExtensions(e.target.value)}
                  placeholder="pdf, zip, png, jpg"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stayOnDomain}
                  onChange={(e) => setStayOnDomain(e.target.checked)}
                  className="rounded text-emerald-500"
                />
                <span>Stay within target domain only (Prevent external link leaks)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSubdomains}
                  onChange={(e) => setAllowSubdomains(e.target.checked)}
                  className="rounded text-emerald-500"
                />
                <span>Allow authorized subdomains</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
