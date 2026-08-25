import React, { useState } from 'react';
import {
  Zap,
  Shield,
  HardDrive,
  Download,
  Clipboard,
  Globe,
  ArrowRight,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { AppSettings } from '../../shared/types';
import { api } from '../lib/api';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsUpdated,
}) => {
  const [step, setStep] = useState<'welcome' | 'configure' | 'done'>('welcome');
  const [downloadDir, setDownloadDir] = useState(
    settings?.general.defaultDownloadDir || '/home/user/Downloads'
  );
  const [maxConcurrent, setMaxConcurrent] = useState(
    settings?.downloads.maxConcurrentDownloads || 3
  );
  const [clipboardEnabled, setClipboardEnabled] = useState(true);
  const [browserConfig, setBrowserConfig] = useState<'now' | 'later'>('later');

  if (!isOpen) return null;

  const handleFinish = async () => {
    if (settings) {
      const updated: AppSettings = {
        ...settings,
        general: {
          ...settings.general,
          defaultDownloadDir: downloadDir,
        },
        downloads: {
          ...settings.downloads,
          maxConcurrentDownloads: maxConcurrent,
        },
      };
      await api.saveSettings(updated).catch(console.error);
      onSettingsUpdated(updated);
    }
    try {
      localStorage.setItem('g1dm_onboarding_completed', 'true');
    } catch {}
    onClose();
  };

  const handleSkip = () => {
    try {
      localStorage.setItem('g1dm_onboarding_completed', 'true');
    } catch {}
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in-up"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 text-slate-100 overflow-hidden animate-modal-in">
        {/* Background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close / Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          title="Skip Onboarding"
          aria-label="Skip Onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'welcome' && (
          <div className="space-y-6 text-center py-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
                <Zap className="w-8 h-8 text-cyan-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 id="onboarding-title" className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400">
                Welcome to G1DM
              </h2>
              <p className="text-sm text-slate-400 font-medium">
                Production-Grade Next-Generation Download Architecture
              </p>
            </div>

            {/* Core Pillars */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800 flex flex-col items-center gap-1.5">
                <Zap className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-xs text-slate-200">Fast</span>
                <span className="text-[10px] text-slate-400">Multi-Segment</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800 flex flex-col items-center gap-1.5">
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-xs text-slate-200">Reliable</span>
                <span className="text-[10px] text-slate-400">Self-Healing</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800 flex flex-col items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span className="font-bold text-xs text-slate-200">Private</span>
                <span className="text-[10px] text-slate-400">Zero Telemetry</span>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between gap-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
              >
                Skip Setup
              </button>
              <button
                onClick={() => setStep('configure')}
                className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-5 py-2">
            <div>
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" />
                <span>Quick Setup</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Customize key defaults. You can change these anytime in Settings.
              </p>
            </div>

            {/* 1. Default Download Folder */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                <span>Default Download Folder</span>
              </label>
              <input
                type="text"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* 2. Maximum Concurrent Downloads */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Maximum Concurrent Downloads</span>
                </span>
                <span className="font-mono text-blue-400 text-xs font-bold">{maxConcurrent}</span>
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 8].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxConcurrent(val)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      maxConcurrent === val
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Clipboard Monitoring */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <Clipboard className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Clipboard Monitoring</div>
                  <div className="text-[10px] text-slate-400">Detect copied download links automatically</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={clipboardEnabled}
                onChange={(e) => setClipboardEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* 4. Browser Integration */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Browser Companion</div>
                  <div className="text-[10px] text-slate-400">Chrome, Firefox, Edge, Brave extensions</div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-400">Configure later in Settings</span>
            </div>

            <div className="pt-3 flex items-center justify-between gap-3">
              <button
                onClick={() => setStep('welcome')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save & Start G1DM</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
