import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useDownloadEngine } from '../hooks/useDownloadEngine';
import { Navbar } from '../components/Navbar';
import { Sidebar, ActiveView } from '../components/Sidebar';
import { DashboardView } from '../components/DashboardView';
import { DownloadsView } from '../components/DownloadsView';
import { DownloadDetailModal } from '../components/DownloadDetailModal';
import { AddDownloadModal } from '../components/AddDownloadModal';
import { OnboardingModal } from '../components/OnboardingModal';
import { QueuesView } from '../components/QueuesView';
import { SiteGrabberView } from '../components/SiteGrabberView';
import { BatchLinksView } from '../components/BatchLinksView';
import { MediaDetectorView } from '../components/MediaDetectorView';
import { DiagnosticsView } from '../components/DiagnosticsView';
import { StorageMaintenanceView } from '../components/StorageMaintenanceView';
import { SettingsView } from '../components/SettingsView';
import { CommandPalette } from '../components/CommandPalette';
import { ClipboardToast } from '../components/ClipboardToast';
import { CompatibilityCenter } from '../components/CompatibilityCenter';
import { DownloadInboxView } from '../components/DownloadInboxView';
import { AnalyticsView } from '../components/AnalyticsView';
import { AutomationView } from '../components/AutomationView';
import { MediaLibraryView } from '../components/MediaLibraryView';
import { IncidentsView } from '../components/IncidentsView';
import { SnapshotsView } from '../components/SnapshotsView';
import { PowerFeaturesView } from '../components/PowerFeaturesView';
import { IdmProgressModal } from '../components/IdmProgressModal';
import { ActionCenterDrawer } from '../components/ui/ActionCenterDrawer';
import { CrashRecoveryBanner } from '../components/CrashRecoveryBanner';
import { InboxItem } from '../../main/engine/DownloadInbox';
import { ProfileType } from '../../main/engine/DownloadProfiles';
import type { ThemeMode, ViewMode } from '../design-system/tokens';
import {
  applyTheme,
  getStoredTheme,
  isThemeMode,
  storeTheme,
} from '../design-system/theme';
import { Language } from '../lib/i18n';
import { DownloadItem } from '../../shared/types';
import { api } from '../lib/api';
import { chooseDownloadPopup } from '../lib/downloadPopupLifecycle';

export default function Home() {
  const {
    downloads,
    setDownloads,
    queues,
    categories,
    settings,
    metrics,
    grabberProjects,
    isConnected,
    refreshAll,
    setSettings,
  } = useDownloadEngine();

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');

  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme() || 'dark');
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>(() => theme);
  const [lang, setLang] = useState<Language>('en');
  const [currentProfile, setCurrentProfile] = useState<ProfileType>('TURBO');
  const [viewMode, setViewMode] = useState<ViewMode>('advanced');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [addModalInitialUrl, setAddModalInitialUrl] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);
  const [activeIdmDownloadId, setActiveIdmDownloadId] = useState<string | null>(null);
  const [cachedActiveItem, setCachedActiveItem] = useState<DownloadItem | null>(null);
  // Presentation-only lifecycle. Download state itself remains exclusively in
  // useDownloadEngine / the server WebSocket stream.
  const [minimizedDownloadIds, setMinimizedDownloadIds] = useState<Set<string>>(() => new Set());
  const [dismissedDownloadIds, setDismissedDownloadIds] = useState<Set<string>>(() => new Set());
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [retryFailedError, setRetryFailedError] = useState<string | null>(null);

  const handleOpenDownloadPopup = React.useCallback((itemOrId: DownloadItem | string) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
    if (typeof itemOrId !== 'string') {
      setCachedActiveItem(itemOrId);
      setDownloads((previous) => {
        const idx = previous.findIndex((d) => d.id === id);
        if (idx === -1) return [itemOrId, ...previous];
        const updated = [...previous];
        updated[idx] = itemOrId;
        return updated;
      });
    }
    setMinimizedDownloadIds((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setDismissedDownloadIds((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setActiveIdmDownloadId(id);
  }, [setDownloads]);

  const retryAllFailed = async () => {
    if (isRetryingFailed) return;
    const failed = downloads.filter((download) => download.status === 'failed');
    if (failed.length === 0) return;
    setRetryFailedError(null);
    setIsRetryingFailed(true);
    try {
      await Promise.all(failed.map((download) => api.retryDownload(download.id)));
      await refreshAll();
    } catch (error) {
      setRetryFailedError(error instanceof Error ? error.message : 'Retry failed. Please try again.');
    } finally {
      setIsRetryingFailed(false);
    }
  };

  // Deterministic popup lifecycle: newly active engine items open a popup;
  // minimizing never mutates the engine; completion restores a minimized item.
  useEffect(() => {
    const popupDecision = chooseDownloadPopup(downloads, activeIdmDownloadId, minimizedDownloadIds, dismissedDownloadIds);
    const completedWhileMinimized = popupDecision.restoreCompletedId ? downloads.find((item) => item.id === popupDecision.restoreCompletedId) : undefined;
    if (completedWhileMinimized) {
      setMinimizedDownloadIds((previous) => {
        const next = new Set(previous); next.delete(completedWhileMinimized.id); return next;
      });
      setDismissedDownloadIds((previous) => { const next = new Set(previous); next.delete(completedWhileMinimized.id); return next; });
      setActiveIdmDownloadId(completedWhileMinimized.id);
      return;
    }
    if (!activeIdmDownloadId && popupDecision.openId) setActiveIdmDownloadId(popupDecision.openId);
  }, [downloads, activeIdmDownloadId, minimizedDownloadIds, dismissedDownloadIds]);

  // Keep cached active item synchronized with live download state
  useEffect(() => {
    if (activeIdmDownloadId) {
      const match = downloads.find((d) => d.id === activeIdmDownloadId);
      if (match) setCachedActiveItem(match);
    }
  }, [downloads, activeIdmDownloadId]);

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [isWindowDraggingOver, setIsWindowDraggingOver] = useState(false);

  // Global Drag and Drop Handler (Drop URL or Link anywhere)
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.length > 0) {
        setIsWindowDraggingOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsWindowDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDraggingOver(false);
      if (!e.dataTransfer) return;

      const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (
        uri &&
        (uri.startsWith('http://') ||
          uri.startsWith('https://') ||
          uri.startsWith('ftp://') ||
          uri.startsWith('ftps://'))
      ) {
        setAddModalInitialUrl(uri.trim());
        setIsAddModalOpen(true);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Check first-run onboarding status on initial mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem('g1dm_onboarding_completed')) {
        setIsOnboardingOpen(true);
      }
    } catch {}
  }, []);

  // Count active failures/warnings for Action Center
  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const storageAlert = metrics ? metrics.storage.freeBytes < 2 * 1024 * 1024 * 1024 : false;
  const alertCount = (failedCount > 0 ? 1 : 0) + (storageAlert ? 1 : 0);

  // Sync settings theme/lang.
  useEffect(() => {
    if (settings) {
      const configuredTheme = isThemeMode(settings.general.theme) ? settings.general.theme : 'dark';
      setTheme(configuredTheme);
      storeTheme(configuredTheme);
      if (settings.general.language) setLang(settings.general.language as Language);
    }
  }, [settings]);

  // Keep the document root and the app state in lockstep.
  useEffect(() => {
    const nextResolvedTheme = applyTheme(theme);
    setResolvedTheme(nextResolvedTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      nextResolvedTheme === 'light' ? '#f8fafc' : '#090d16',
    );
  }, [theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    storeTheme(nextTheme);

    if (settings) {
      const nextSettings = {
        ...settings,
        general: { ...settings.general, theme: nextTheme },
      };
      setSettings(nextSettings);
      api.saveSettings(nextSettings).catch(() => {});
    }
  };

  const cycleTheme = () => {
    handleThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+N, Ctrl+P, Ctrl+R, Ctrl+F, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsAddModalOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        api.pauseAll().then(refreshAll).catch(console.error);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !e.shiftKey) {
        // Prevent accidental full page refresh if on downloads view
        if (activeView === 'downloads' || activeView === 'queues') {
          e.preventDefault();
          api.resumeAll().then(refreshAll).catch(console.error);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !isInput) {
        e.preventDefault();
        setActiveView('downloads');
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
        if (searchInput) searchInput.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsActionCenterOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsAddModalOpen(false);
        setIsCommandPaletteOpen(false);
        setIsActionCenterOpen(false);
        setSelectedDownload(null);
        setActiveIdmDownloadId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, refreshAll]);

  // Zero-Leakage Clipboard Sniffer on window focus
  useEffect(() => {
    const handleFocus = async () => {
      try {
        if (typeof window !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (!text || typeof text !== 'string') return;
          const trimmed = text.trim().replace(/^["'<]|["'>]$/g, '');
          // Privacy check: only process if client-side regex confirms it is an actual URL (< 2048 chars)
          if (trimmed.length > 0 && trimmed.length <= 2048 && /^(https?|ftp|ftps):\/\/[^\s$.?#].[^\s]*$/i.test(trimmed)) {
            const res = await api.checkClipboard(trimmed);
            if (res.isDownloadable && res.url) {
              setClipboardUrl(res.url);
            }
          }
        }
      } catch {
        // Clipboard read permission might be denied or window not focused
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Hash Navigation Handler (#add?url=..., #batch, #media)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#add')) {
        const queryIdx = hash.indexOf('?');
        if (queryIdx !== -1) {
          const params = new URLSearchParams(hash.slice(queryIdx));
          const urlParam = params.get('url');
          if (urlParam) {
            setAddModalInitialUrl(decodeURIComponent(urlParam));
          }
        }
        setIsAddModalOpen(true);
      } else if (hash.startsWith('#batch')) {
        setActiveView('batchLinks');
      } else if (hash.startsWith('#media')) {
        setActiveView('mediaDetector');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSpeedLimitChange = async (limit: number) => {
    await api.setSpeedLimit(limit);
    refreshAll();
  };

  const handleNavigate = (view: ActiveView, status?: string) => {
    setActiveView(view);
    if (status) setStatusFilter(status);
  };

  return (
    <div
      className="theme-app h-screen flex flex-col overflow-hidden w-full"
      data-active-theme={resolvedTheme}
      suppressHydrationWarning
    >
      {/* Top Navbar */}
      <Navbar
        lang={lang}
        onLanguageChange={setLang}
        theme={theme}
        onThemeToggle={cycleTheme}
        onOpenNewDownload={() => setIsAddModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isConnected={isConnected}
        globalSpeedLimit={settings?.downloads.globalSpeedLimitBytesPerSec || 0}
        onSpeedLimitChange={handleSpeedLimitChange}
        currentProfile={currentProfile}
        onProfileChange={setCurrentProfile}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        alertCount={alertCount}
        onToggleActionCenter={() => setIsActionCenterOpen(!isActionCenterOpen)}
      />

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          queueFilter={queueFilter}
          onQueueFilterChange={setQueueFilter}
          downloads={downloads}
          queues={queues}
          categories={categories}
          metrics={metrics}
          lang={lang}
        />

        {/* Center Viewport */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-slate-950/50 flex flex-col">
          {/* Startup Crash Recovery Banner */}
          <CrashRecoveryBanner
            onRefresh={refreshAll}
            onSelectDownload={(item) => setSelectedDownload(item)}
          />

          {activeView === 'dashboard' && (
            <DashboardView
              downloads={downloads}
              metrics={metrics}
              categories={categories}
              lang={lang}
              onNavigate={handleNavigate}
              onOpenNewDownload={() => setIsAddModalOpen(true)}
              onSelectDownload={(item) => setSelectedDownload(item)}
            />
          )}

          {activeView === 'downloads' && (
            <DownloadsView
              downloads={downloads}
              queues={queues}
              categories={categories}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              queueFilter={queueFilter}
              onQueueFilterChange={setQueueFilter}
              lang={lang}
              onSelectDownload={(item) => setSelectedDownload(item)}
              onOpenIdmProgress={handleOpenDownloadPopup}
              onRefresh={refreshAll}
            />
          )}

          {activeView === 'inbox' && (
            <DownloadInboxView
              inboxItems={inboxItems}
              queues={queues}
              categories={categories}
              lang={lang}
              onClearInbox={() => setInboxItems([])}
              onRefresh={refreshAll}
            />
          )}

          {activeView === 'mediaLibrary' && (
            <MediaLibraryView downloads={downloads} lang={lang} />
          )}

          {activeView === 'automation' && (
            <AutomationView downloads={downloads} lang={lang} />
          )}

          {activeView === 'powerFeatures' && (
            <PowerFeaturesView lang={lang} />
          )}

          {activeView === 'analytics' && (
            <AnalyticsView downloads={downloads} metrics={metrics} lang={lang} />
          )}

          {activeView === 'incidents' && (
            <IncidentsView lang={lang} />
          )}

          {activeView === 'snapshots' && (
            <SnapshotsView downloads={downloads} lang={lang} onRefresh={refreshAll} />
          )}

          {activeView === 'queues' && (
            <QueuesView
              queues={queues}
              downloads={downloads}
              settings={settings}
              lang={lang}
              onRefresh={refreshAll}
            />
          )}

          {activeView === 'siteGrabber' && (
            <SiteGrabberView
              projects={grabberProjects}
              lang={lang}
              onRefresh={refreshAll}
            />
          )}

          {activeView === 'batchLinks' && (
            <BatchLinksView
              queues={queues}
              categories={categories}
              lang={lang}
              onAdded={refreshAll}
            />
          )}

          {activeView === 'mediaDetector' && (
            <MediaDetectorView
              lang={lang}
              onDownloadAdded={refreshAll}
              onDownloadStarted={handleOpenDownloadPopup}
            />
          )}

          {activeView === 'compatibility' && (
            <CompatibilityCenter lang={lang} />
          )}

          {activeView === 'diagnostics' && (
            <DiagnosticsView lang={lang} />
          )}

          {activeView === 'storageMaintenance' && (
            <StorageMaintenanceView metrics={metrics} lang={lang} />
          )}

          {activeView === 'settings' && (
            <SettingsView
              settings={settings}
              lang={lang}
              onSave={(newSettings) => setSettings(newSettings)}
            />
          )}
        </main>
      </div>

      {/* Bottom Center Credits Footer */}
      <footer className="w-full py-3.5 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex items-center justify-center text-xs text-slate-400 select-none">
        <div className="flex items-center gap-1.5 font-medium tracking-wide">
          <span>Made with</span>
          <span className="text-rose-500 animate-pulse inline-block text-sm">❤️</span>
          <span>by</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 font-bold hover:brightness-125 transition-all">
            Jeevan
          </span>
        </div>
      </footer>

      {/* Global Drag & Drop Overlay */}
      {isWindowDraggingOver && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-8 pointer-events-none animate-in fade-in duration-150">
          <div className="max-w-md w-full border-2 border-dashed border-blue-400 bg-blue-950/50 rounded-3xl p-8 flex flex-col items-center text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Download className="w-8 h-8 animate-bounce" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Drop URL or file here</h3>
              <p className="text-xs text-blue-200 mt-1">
                Release link to inspect server capabilities and start download
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        settings={settings}
        onSettingsUpdated={(newSettings) => {
          setSettings(newSettings);
          refreshAll();
        }}
      />

      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddModalInitialUrl('');
        }}
        queues={queues}
        categories={categories}
        defaultDownloadDir={settings?.general.defaultDownloadDir || '/home/user/Downloads'}
        initialUrl={addModalInitialUrl}
        onDownloadStarted={handleOpenDownloadPopup}
      />

      <DownloadDetailModal
        item={selectedDownload}
        onClose={() => setSelectedDownload(null)}
      />

      <IdmProgressModal
        item={downloads.find((d) => d.id === activeIdmDownloadId) || (cachedActiveItem?.id === activeIdmDownloadId ? cachedActiveItem : null)}
        onClose={() => {
          if (activeIdmDownloadId) setDismissedDownloadIds((previous) => new Set(previous).add(activeIdmDownloadId));
          setActiveIdmDownloadId(null);
          setCachedActiveItem(null);
        }}
        onMinimize={() => {
          if (activeIdmDownloadId) setMinimizedDownloadIds((previous) => new Set(previous).add(activeIdmDownloadId));
          setActiveIdmDownloadId(null);
        }}
      />

      {minimizedDownloadIds.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-blue-400/30 bg-slate-950/95 shadow-2xl shadow-blue-950/50 backdrop-blur p-2 animate-in fade-in slide-in-from-bottom-2 duration-150" data-testid="idm-minimized-center" aria-label="Minimized download progress">
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">G1DM Downloads · {minimizedDownloadIds.size}</div>
          {downloads.filter((item) => minimizedDownloadIds.has(item.id)).map((item) => (
            <button key={item.id} onClick={() => { setMinimizedDownloadIds((previous) => { const next = new Set(previous); next.delete(item.id); return next; }); setActiveIdmDownloadId(item.id); }} className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400" aria-label={`Restore ${item.filename} progress popup`}>
              <div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold text-slate-100">{item.filename}</span><span className="shrink-0 text-cyan-300">{item.progress.toFixed(0)}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} /></div>
              <div className="mt-1 text-[10px] text-slate-400">↓ {item.speed > 0 ? `${(item.speed / 1024 / 1024).toFixed(1)} MB/s` : 'Waiting'} · {item.status}</div>
            </button>
          ))}
        </div>
      )}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        downloads={downloads}
        onNavigate={handleNavigate}
        onOpenNewDownload={() => setIsAddModalOpen(true)}
        onThemeToggle={cycleTheme}
        onSelectDownload={(item) => setSelectedDownload(item)}
        onSpeedLimitChange={handleSpeedLimitChange}
      />

      <ActionCenterDrawer
        isOpen={isActionCenterOpen}
        onClose={() => setIsActionCenterOpen(false)}
        downloads={downloads}
        metrics={metrics}
        onRepairBrowser={() => setActiveView('compatibility')}
        onCleanStorage={() => setActiveView('storageMaintenance')}
        onRetryFailed={retryAllFailed}
        isRetrying={isRetryingFailed}
        retryError={retryFailedError}
      />

      <ClipboardToast
        url={clipboardUrl}
        onDismiss={() => setClipboardUrl(null)}
        onDownloadNow={async (u) => {
          setClipboardUrl(null);
          const item = await api.addDownload({ url: u, startImmediately: true });
          if (item) handleOpenDownloadPopup(item);
        }}
        onAddToQueue={async (u) => {
          setClipboardUrl(null);
          await api.addDownload({ url: u, startImmediately: false });
        }}
      />
    </div>
  );
}
