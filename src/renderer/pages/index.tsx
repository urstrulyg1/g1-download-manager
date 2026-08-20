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
import { ActionCenterDrawer } from '../components/ui/ActionCenterDrawer';
import { InboxItem } from '../../main/engine/DownloadInbox';
import { ProfileType } from '../../main/engine/DownloadProfiles';
import { ViewMode } from '../design-system/tokens';
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

  const [theme, setTheme] = useState<'dark' | 'light' | 'oled'>('dark');
  const [lang, setLang] = useState<Language>('en');
  const [currentProfile, setCurrentProfile] = useState<ProfileType>('TURBO');
  const [viewMode, setViewMode] = useState<ViewMode>('advanced');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);

  // Count active failures/warnings for Action Center
  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const storageAlert = metrics ? metrics.storage.freeBytes < 2 * 1024 * 1024 * 1024 : false;
  const alertCount = (failedCount > 0 ? 1 : 0) + (storageAlert ? 1 : 0);

  // Sync settings theme/lang
  useEffect(() => {
    if (settings) {
      if (settings.general.theme === 'light') setTheme('light');
      if (settings.general.language) setLang(settings.general.language as Language);
    }
  }, [settings]);

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

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleSpeedLimitChange = async (limit: number) => {
    await api.setSpeedLimit(limit);
    refreshAll();
  };

  const handleNavigate = (view: ActiveView, status?: string) => {
    setActiveView(view);
    if (status) setStatusFilter(status);
  };

  const themeClasses =
    theme === 'oled'
      ? 'bg-black text-slate-100'
      : theme === 'dark'
      ? 'dark bg-slate-950 text-slate-100'
      : 'bg-slate-50 text-slate-900';

  return (
    <div className={`min-h-screen ${themeClasses}`}>
      {/* Top Navbar */}
      <Navbar
        lang={lang}
        onLanguageChange={setLang}
        theme={theme}
        onThemeToggle={() => setTheme(theme === 'dark' ? 'oled' : theme === 'oled' ? 'light' : 'dark')}
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
      <div className="flex">
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
        <main className="flex-1 bg-slate-950/50">
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

      {/* Modals & Drawers */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        queues={queues}
        categories={categories}
        defaultDownloadDir={settings?.general.defaultDownloadDir || '/home/user/Downloads'}
      />

      <DownloadDetailModal
        item={selectedDownload}
        onClose={() => setSelectedDownload(null)}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        downloads={downloads}
        onNavigate={handleNavigate}
        onOpenNewDownload={() => setIsAddModalOpen(true)}
        onThemeToggle={() => setTheme(theme === 'dark' ? 'oled' : theme === 'oled' ? 'light' : 'dark')}
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
      />

      <ClipboardToast
        url={clipboardUrl}
        onDismiss={() => setClipboardUrl(null)}
        onDownloadNow={async (u) => {
          setClipboardUrl(null);
          await api.addDownload({ url: u, startImmediately: true });
        }}
        onAddToQueue={async (u) => {
          setClipboardUrl(null);
          await api.addDownload({ url: u, startImmediately: false });
        }}
      />
    </div>
  );
}
