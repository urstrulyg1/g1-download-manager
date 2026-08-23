import React, { useState, useEffect } from 'react';
import { useDownloadEngine } from '../hooks/useDownloadEngine';
import { Navbar } from '../components/Navbar';
import { Sidebar, ActiveView } from '../components/Sidebar';
import { DashboardView } from '../components/DashboardView';
import { DownloadsView } from '../components/DownloadsView';
import { DownloadDetailModal } from '../components/DownloadDetailModal';
import { AddDownloadModal } from '../components/AddDownloadModal';
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

export default function Home() {
  const {
    downloads,
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
  const [addModalInitialUrl, setAddModalInitialUrl] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);
  const [activeIdmDownloadId, setActiveIdmDownloadId] = useState<string | null>(null);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [retryFailedError, setRetryFailedError] = useState<string | null>(null);

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

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);

  // Count active failures/warnings for Action Center
  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const storageAlert = metrics ? metrics.storage.freeBytes < 2 * 1024 * 1024 * 1024 : false;
  const alertCount = (failedCount > 0 ? 1 : 0) + (storageAlert ? 1 : 0);

  // Sync settings theme/lang. The server setting is authoritative after the
  // initial connection, while localStorage is used only to avoid a first-paint
  // flash before that request completes.
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

    // The top-level switch is an immediate preference, so persist it as well
    // when the engine settings are available. SettingsView still saves the
    // complete form in one operation.
    if (settings) {
      const nextSettings = {
        ...settings,
        general: { ...settings.general, theme: nextTheme },
      };
      setSettings(nextSettings);
      api.saveSettings(nextSettings).catch(() => {
        // The local preference remains active if the backend is unavailable.
      });
    }
  };

  const cycleTheme = () => {
    handleThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+N, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsAddModalOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsActionCenterOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Clipboard Polling on window focus
  useEffect(() => {
    const handleFocus = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const res = await api.checkClipboard(text);
          if (res.isDownloadable && res.url) {
            setClipboardUrl(res.url);
          }
        }
      } catch {
        // Clipboard read permission might be denied
      }
    };

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
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-slate-950/50">
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
              onOpenIdmProgress={(item) => setActiveIdmDownloadId(item.id)}
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
              onDownloadStarted={(item) => setActiveIdmDownloadId(item.id)}
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

      {/* Modals & Drawers */}
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
        onDownloadStarted={(item) => setActiveIdmDownloadId(item.id)}
      />

      <DownloadDetailModal
        item={selectedDownload}
        onClose={() => setSelectedDownload(null)}
      />

      <IdmProgressModal
        item={downloads.find((d) => d.id === activeIdmDownloadId) || null}
        onClose={() => setActiveIdmDownloadId(null)}
        onMinimize={() => setActiveIdmDownloadId(null)}
      />

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
          if (item) setActiveIdmDownloadId(item.id);
        }}
        onAddToQueue={async (u) => {
          setClipboardUrl(null);
          await api.addDownload({ url: u, startImmediately: false });
        }}
      />
    </div>
  );
}
