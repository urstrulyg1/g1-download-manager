import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Play,
  Pause,
  Square,
  Activity,
  Globe,
  Layers,
  Flame,
  HardDrive,
  Settings,
  Sun,
  Moon,
  Gauge,
  Download,
} from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { ActiveView } from './Sidebar';
import { api } from '../lib/api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  downloads: DownloadItem[];
  onNavigate: (view: ActiveView, statusFilter?: string) => void;
  onOpenNewDownload: () => void;
  onThemeToggle: () => void;
  onSelectDownload: (item: DownloadItem) => void;
  onSpeedLimitChange: (limit: number) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  downloads,
  onNavigate,
  onOpenNewDownload,
  onThemeToggle,
  onSelectDownload,
  onSpeedLimitChange,
}) => {
  if (!isOpen) return null;

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isOpen]);

  const commands = [
    {
      id: 'cmd-new',
      title: 'Add New Download',
      category: 'Actions',
      icon: Plus,
      action: () => {
        onClose();
        onOpenNewDownload();
      },
    },
    {
      id: 'cmd-resume-all',
      title: 'Resume All Downloads',
      category: 'Actions',
      icon: Play,
      action: () => {
        api.resumeAll();
        onClose();
      },
    },
    {
      id: 'cmd-pause-all',
      title: 'Pause All Downloads',
      category: 'Actions',
      icon: Pause,
      action: () => {
        api.pauseAll();
        onClose();
      },
    },
    {
      id: 'cmd-stop-all',
      title: 'Stop All Downloads',
      category: 'Actions',
      icon: Square,
      action: () => {
        api.stopAll();
        onClose();
      },
    },
    {
      id: 'cmd-nav-dashboard',
      title: 'Go to Dashboard',
      category: 'Navigation',
      icon: Download,
      action: () => {
        onNavigate('dashboard');
        onClose();
      },
    },
    {
      id: 'cmd-nav-grabber',
      title: 'Open Site Grabber',
      category: 'Navigation',
      icon: Globe,
      action: () => {
        onNavigate('siteGrabber');
        onClose();
      },
    },
    {
      id: 'cmd-nav-batch',
      title: 'Open Batch Link Extractor',
      category: 'Navigation',
      icon: Layers,
      action: () => {
        onNavigate('batchLinks');
        onClose();
      },
    },
    {
      id: 'cmd-nav-media',
      title: 'Open Media Sniffer',
      category: 'Navigation',
      icon: Flame,
      action: () => {
        onNavigate('mediaDetector');
        onClose();
      },
    },
    {
      id: 'cmd-nav-diag',
      title: 'Run System Diagnostics',
      category: 'Navigation',
      icon: Activity,
      action: () => {
        onNavigate('diagnostics');
        onClose();
      },
    },
    {
      id: 'cmd-nav-storage',
      title: 'Open Storage & Maintenance',
      category: 'Navigation',
      icon: HardDrive,
      action: () => {
        onNavigate('storageMaintenance');
        onClose();
      },
    },
    {
      id: 'cmd-nav-settings',
      title: 'Open Application Settings',
      category: 'Navigation',
      icon: Settings,
      action: () => {
        onNavigate('settings');
        onClose();
      },
    },
    {
      id: 'cmd-toggle-theme',
      title: 'Toggle Dark / Light Theme',
      category: 'Preferences',
      icon: Sun,
      action: () => {
        onThemeToggle();
        onClose();
      },
    },
    {
      id: 'cmd-speed-unlimited',
      title: 'Set Speed Limit: Unlimited',
      category: 'Bandwidth',
      icon: Gauge,
      action: () => {
        onSpeedLimitChange(0);
        onClose();
      },
    },
    {
      id: 'cmd-speed-1mb',
      title: 'Set Speed Limit: 1 MB/s',
      category: 'Bandwidth',
      icon: Gauge,
      action: () => {
        onSpeedLimitChange(1024 * 1024);
        onClose();
      },
    },
  ];

  // Also include matching downloads
  const downloadItems = downloads.map((d) => ({
    id: `dl-${d.id}`,
    title: `Download: ${d.filename} (${d.status})`,
    category: 'Downloads',
    icon: Download,
    action: () => {
      onSelectDownload(d);
      onClose();
    },
  }));

  const allItems = [...commands, ...downloadItems];

  const filtered = allItems.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="theme-overlay fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-24 p-4 animate-fade-in-up">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-modal-in">
        {/* Search input */}
        <div className="p-3.5 border-b border-slate-800 flex items-center gap-3 bg-slate-950/60">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search downloads..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-slate-200 focus:outline-none placeholder-slate-500"
          />
          <kbd className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">No matching commands or downloads.</div>
          ) : (
            filtered.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconComp className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </div>
                  <span
                    className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
