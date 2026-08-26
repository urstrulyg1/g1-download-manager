import React, { useState, useEffect, useRef } from 'react';
import {
  Pause,
  Play,
  Search,
  Sun,
  Moon,
  Plus,
  Radio,
  Rocket,
  Bell,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';
import { ProfileType, DownloadProfilesManager } from '../../main/engine/DownloadProfiles';
import type { ThemeMode, ViewMode } from '../design-system/tokens';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { api } from '../lib/api';

interface NavbarProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onOpenNewDownload: () => void;
  onOpenCommandPalette: () => void;
  isConnected: boolean;
  globalSpeedLimit: number;
  onSpeedLimitChange: (limit: number) => void;
  currentProfile: ProfileType;
  onProfileChange: (profile: ProfileType) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  alertCount: number;
  onToggleActionCenter: () => void;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  isPausingAll?: boolean;
  isResumingAll?: boolean;
}

const NavbarComponent: React.FC<NavbarProps> = ({
  lang,
  onLanguageChange,
  theme,
  onThemeToggle,
  onOpenNewDownload,
  onOpenCommandPalette,
  isConnected,
  globalSpeedLimit,
  onSpeedLimitChange,
  currentProfile,
  onProfileChange,
  viewMode,
  onViewModeChange,
  alertCount,
  onToggleActionCenter,
  onPauseAll,
  onResumeAll,
  isPausingAll = false,
  isResumingAll = false,
}) => {
  const t = translations[lang] || translations.en;
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);

  const viewModeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const closeAllDropdowns = () => {
    setShowProfileMenu(false);
    setShowViewModeMenu(false);
  };

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        viewModeRef.current && !viewModeRef.current.contains(target) &&
        profileRef.current && !profileRef.current.contains(target)
      ) {
        closeAllDropdowns();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllDropdowns();
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const profiles = DownloadProfilesManager.getProfiles();

  return (
    <header className="h-16 w-full shrink-0 bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Brand, Core Status & Mode */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Brand — clicking the logo navigates to dashboard, not add modal */}
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => {
            closeAllDropdowns();
          }}
        >
          <div className="w-10 h-10 flex items-center justify-center relative shrink-0">
            <img
              src="/logo-mark.png"
              alt="G1DM Logo"
              className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(52,211,153,0.35)] transition-transform hover:scale-105"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                G1DM
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                FREE & OPEN
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-none">Internet Download Manager</p>
          </div>
        </div>

        {/* Core Status Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            isConnected
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
          }`}
        >
          <Radio className={`w-3 h-3 ${isConnected ? 'animate-pulse text-emerald-400' : 'text-rose-400'}`} />
          <span className="hidden sm:inline">{isConnected ? 'Engine Online' : 'Connecting...'}</span>
        </div>

        {/* View Mode Dropdown */}
        <div className="relative" ref={viewModeRef}>
          <button
            onClick={() => {
              setShowProfileMenu(false);
              setShowViewModeMenu((prev) => !prev);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-semibold"
          >
            <span className="capitalize">{viewMode} Mode</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showViewModeMenu && (
            <div className="absolute left-0 mt-2 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {(['simple', 'advanced', 'developer'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    onViewModeChange(mode);
                    setShowViewModeMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold capitalize flex items-center justify-between ${
                    viewMode === mode ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{mode} Mode</span>
                  {viewMode === mode && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Controls & Profile Selector */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            closeAllDropdowns();
            onOpenNewDownload();
          }}
          title="Start a new download (Ctrl+N / ⌘N)"
        >
          {t.newDownload}
        </Button>

        {/* Profile Selector */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setShowViewModeMenu(false);
              setShowProfileMenu((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            title={`Current Profile: ${currentProfile}. Click to switch performance profiles.`}
          >
            <Rocket className="w-3.5 h-3.5 text-cyan-400" />
            <span className="capitalize">{currentProfile}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showProfileMenu && (
            <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 border-b border-slate-800 mb-1">
                Active Download Profile
              </div>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onProfileChange(p.id);
                    setShowProfileMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex flex-col ${
                    currentProfile === p.id ? 'bg-blue-600/30 border border-blue-500/40 text-white' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                  title={`${p.name}: ${p.description}`}
                >
                  <div className="flex justify-between items-center font-bold">
                    <span>{p.name}</span>
                    {currentProfile === p.id && <span className="text-cyan-400 font-bold">✓</span>}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5">{p.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            closeAllDropdowns();
            void onResumeAll();
          }}
          disabled={isResumingAll}
          title="Resume all queued and paused downloads immediately (Ctrl+R)"
          aria-label="Resume all downloads"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResumingAll ? (
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
          )}
          <span className="hidden md:inline">{t.resumeAll}</span>
        </button>

        <button
          onClick={() => {
            closeAllDropdowns();
            void onPauseAll();
          }}
          disabled={isPausingAll}
          title="Pause all currently active downloads (Ctrl+P)"
          aria-label="Pause all downloads"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPausingAll ? (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : (
            <Pause className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          )}
          <span className="hidden md:inline">{t.pauseAll}</span>
        </button>
      </div>

      {/* Right: Search, Action Center & Settings */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            closeAllDropdowns();
            onOpenCommandPalette();
          }}
          title="Open Command Palette & Global Search (Ctrl+K / ⌘K)"
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-all"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono">⌘K</kbd>
        </button>

        {/* Needs Attention Action Center Button */}
        <button
          onClick={() => {
            closeAllDropdowns();
            onToggleActionCenter();
          }}
          className={`relative p-2 rounded-xl border transition-colors ${
            alertCount > 0
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
          }`}
          title={alertCount > 0 ? `Action Center: ${alertCount} alert(s) require attention (Ctrl+Shift+D)` : "Action Center (Ctrl+Shift+D)"}
        >
          <Bell className="w-4 h-4" />
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
              {alertCount}
            </span>
          )}
        </button>

        {/* Theme Switcher */}
        <button
          onClick={() => {
            closeAllDropdowns();
            onThemeToggle();
          }}
          title={`Switch theme (Current: ${theme.toUpperCase()})`}
          aria-label={`Switch theme. Current theme: ${theme}`}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4 text-blue-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
};

export const Navbar = React.memo(NavbarComponent);
