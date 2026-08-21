import React, { useState } from 'react';
import {
  Settings,
  Save,
  Globe,
  HardDrive,
  Download,
  Shield,
  Clock,
  Layers,
  Database,
  RotateCcw,
  CheckCircle2,
  FileJson,
  Upload,
  Zap,
  Power,
  Bot,
} from 'lucide-react';
import { AppSettings } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface SettingsViewProps {
  settings: AppSettings | null;
  lang: Language;
  onSave: (settings: AppSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, lang, onSave }) => {
  const t = translations[lang] || translations.en;
  const [formData, setFormData] = useState<AppSettings | null>(settings);
  const [activeSection, setActiveSection] = useState<
    'general' | 'downloads' | 'network' | 'browser' | 'security' | 'scheduler' | 'automation' | 'power' | 'remote' | 'backup'
  >('general');
  const [saved, setSaved] = useState(false);

  if (!formData) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.saveSettings(formData);
    onSave(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleExportBackup = () => {
    window.open('/api/export', '_blank');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      alert('Application state restored successfully! Refreshing...');
      window.location.reload();
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            <span>Application Settings & Preferences</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure download engine behaviors, proxy routing, browser integration, security, and scheduling
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Tabs */}
        <div className="md:col-span-1 space-y-1">
          {[
            { id: 'general', label: 'General', icon: Settings },
            { id: 'downloads', label: 'Downloads Engine', icon: Download },
            { id: 'network', label: 'Network & Proxy', icon: Globe },
            { id: 'browser', label: 'Browser Integration', icon: Layers },
            { id: 'security', label: 'Security & Privacy', icon: Shield },
            { id: 'scheduler', label: 'Scheduler', icon: Clock },
            { id: 'automation', label: 'Post-Download Automation', icon: Zap },
            { id: 'power', label: 'Power Governor', icon: Power },
            { id: 'remote', label: 'Remote Control Bot', icon: Bot },
            { id: 'backup', label: 'Backup & Restore', icon: Database },
          ].map((sec) => {
            const IconComp = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id as any)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeSection === sec.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <IconComp className="w-4 h-4" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Form */}
        <form
          onSubmit={handleSubmit}
          className="md:col-span-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-xs"
        >
          {/* 1. GENERAL */}
          {activeSection === 'general' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">General Options</h3>
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Default Download Folder</label>
                <input
                  type="text"
                  value={formData.general.defaultDownloadDir}
                  onChange={(e) =>
                    setFormData({ ...formData, general: { ...formData.general, defaultDownloadDir: e.target.value } })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Interface Theme</label>
                  <select
                    value={formData.general.theme}
                    onChange={(e) =>
                      setFormData({ ...formData, general: { ...formData.general, theme: e.target.value as any } })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="dark">Dark Theme</option>
                    <option value="light">Light Theme</option>
                    <option value="system">System Default</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Language (i18n)</label>
                  <select
                    value={formData.general.language}
                    onChange={(e) =>
                      setFormData({ ...formData, general: { ...formData.general, language: e.target.value } })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ja">日本語</option>
                    <option value="zh">中文</option>
                    <option value="ru">Русский</option>
                    <option value="pt">Português</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.general.playSounds}
                    onChange={(e) =>
                      setFormData({ ...formData, general: { ...formData.general, playSounds: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Play audio chimes on completion and download errors (Web Audio API)</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.general.desktopNotifications}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        general: { ...formData.general, desktopNotifications: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Show native desktop notifications on completed downloads</span>
                </label>
              </div>
            </div>
          )}

          {/* 2. DOWNLOADS ENGINE */}
          {activeSection === 'downloads' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Download Engine Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Max Simultaneous Downloads</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.downloads.maxConcurrentDownloads}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        downloads: { ...formData.downloads, maxConcurrentDownloads: parseInt(e.target.value, 10) },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Default Connections per File</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={formData.downloads.defaultConnectionsPerDownload}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        downloads: {
                          ...formData.downloads,
                          defaultConnectionsPerDownload: parseInt(e.target.value, 10),
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.downloads.dynamicSegmentation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        downloads: { ...formData.downloads, dynamicSegmentation: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Intelligent Dynamic Segmentation (Split remaining ranges on-the-fly)</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">File Collision Action</label>
                <select
                  value={formData.downloads.fileCollisionAction}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      downloads: { ...formData.downloads, fileCollisionAction: e.target.value as any },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 capitalize"
                >
                  <option value="rename">Auto Rename (e.g. filename (1).zip)</option>
                  <option value="overwrite">Overwrite Existing File</option>
                  <option value="skip">Skip Download</option>
                </select>
              </div>
            </div>
          )}

          {/* 3. NETWORK & PROXY */}
          {activeSection === 'network' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Network & Proxy</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.network.proxyEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, network: { ...formData.network, proxyEnabled: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Enable Global Proxy Tunnel</span>
                </label>

                {formData.network.proxyEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-slate-400 mb-1 block">Protocol</label>
                      <select
                        value={formData.network.proxyType}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            network: { ...formData.network, proxyType: e.target.value as any },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      >
                        <option value="http">HTTP Proxy</option>
                        <option value="https">HTTPS Proxy</option>
                        <option value="socks5">SOCKS5 Proxy</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">Host</label>
                      <input
                        type="text"
                        placeholder="127.0.0.1"
                        value={formData.network.proxyHost}
                        onChange={(e) =>
                          setFormData({ ...formData, network: { ...formData.network, proxyHost: e.target.value } })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">Port</label>
                      <input
                        type="number"
                        value={formData.network.proxyPort}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            network: { ...formData.network, proxyPort: parseInt(e.target.value, 10) || 8080 },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. BROWSER INTEGRATION */}
          {activeSection === 'browser' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Browser Extension Companion</h3>
              <p className="text-slate-300 leading-relaxed">
                G1DM includes ready-to-load browser companion extensions for Chrome, Brave, Edge (Manifest V3) and Firefox.
                The unpacked extension is located in <code className="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-cyan-400">resources/browser-extension</code>.
              </p>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.browser.interceptDownloads}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        browser: { ...formData.browser, interceptDownloads: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Automatically intercept browser file downloads</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Intercepted File Extensions</label>
                <input
                  type="text"
                  value={formData.browser.interceptExtensions.join(', ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      browser: {
                        ...formData.browser,
                        interceptExtensions: e.target.value.split(',').map((s) => s.trim().replace('.', '')).filter(Boolean),
                      },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono"
                />
              </div>
            </div>
          )}

          {/* 5. SECURITY */}
          {activeSection === 'security' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Security & Local Antivirus</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.security.runAntivirusScan}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, runAntivirusScan: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Automatically scan completed files with local antivirus CLI</span>
                </label>

                {formData.security.runAntivirusScan && (
                  <div className="pt-2">
                    <label className="text-slate-400 mb-1 block">Antivirus CLI Command</label>
                    <input
                      type="text"
                      value={formData.security.antivirusCommand}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          security: { ...formData.security, antivirusCommand: e.target.value },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.security.redactDiagnostics}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, redactDiagnostics: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Automatically redact tokens, passwords, and cookies from diagnostic reports</span>
                </label>
              </div>

              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 pt-2">Cloud Threat Intelligence</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.security.threatIntelEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        security: { ...formData.security, threatIntelEnabled: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Check every URL against live threat-intelligence feeds before downloading</span>
                </label>

                {formData.security.threatIntelEnabled && (
                  <>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer pl-6">
                      <input
                        type="checkbox"
                        checked={formData.security.urlHausEnabled}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            security: { ...formData.security, urlHausEnabled: e.target.checked },
                          })
                        }
                        className="rounded text-blue-600"
                      />
                      <span>URLhaus (abuse.ch) malware URL database — free, no API key needed</span>
                    </label>

                    <div className="pl-6 pt-1">
                      <label className="text-slate-400 mb-1 block">VirusTotal API Key (optional — enables 70+ engine URL & hash lookups)</label>
                      <input
                        type="password"
                        placeholder="Paste your VirusTotal v3 API key"
                        value={formData.security.virusTotalApiKey}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            security: { ...formData.security, virusTotalApiKey: e.target.value },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 6. SCHEDULER */}
          {activeSection === 'scheduler' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Working Hours Bandwidth Schedules</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.scheduler.workingHoursEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scheduler: { ...formData.scheduler, workingHoursEnabled: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Enable Working-Hours Bandwidth Throttle Profile</span>
                </label>

                {formData.scheduler.workingHoursEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-slate-400 mb-1 block">Start (HH:MM)</label>
                      <input
                        type="time"
                        value={formData.scheduler.workingHoursStart}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduler: { ...formData.scheduler, workingHoursStart: e.target.value },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">End (HH:MM)</label>
                      <input
                        type="time"
                        value={formData.scheduler.workingHoursEnd}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduler: { ...formData.scheduler, workingHoursEnd: e.target.value },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">Limit (KB/s)</label>
                      <input
                        type="number"
                        value={Math.round(formData.scheduler.workingHoursSpeedLimit / 1024)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduler: {
                              ...formData.scheduler,
                              workingHoursSpeedLimit: (parseInt(e.target.value, 10) || 512) * 1024,
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. POST-DOWNLOAD AUTOMATION */}
          {activeSection === 'automation' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Webhooks & Custom Scripts</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.automation.webhooksEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, automation: { ...formData.automation, webhooksEnabled: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Enable post-download triggers (webhooks + custom scripts)</span>
                </label>

                {formData.automation.webhooksEnabled && (
                  <div className="space-y-3 pl-6">
                    <div>
                      <label className="text-slate-400 mb-1 block">Webhook URL (Discord / Slack / IFTTT / custom endpoint)</label>
                      <input
                        type="text"
                        placeholder="https://discord.com/api/webhooks/…"
                        value={formData.automation.webhookUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, automation: { ...formData.automation, webhookUrl: e.target.value } })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">Custom Script Path (receives file path as $1 + G1DM_* env vars)</label>
                      <input
                        type="text"
                        placeholder="/home/user/scripts/on-download-complete.sh"
                        value={formData.automation.customScriptPath}
                        onChange={(e) =>
                          setFormData({ ...formData, automation: { ...formData.automation, customScriptPath: e.target.value } })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.automation.triggerOnComplete}
                          onChange={(e) =>
                            setFormData({ ...formData, automation: { ...formData.automation, triggerOnComplete: e.target.checked } })
                          }
                          className="rounded text-blue-600"
                        />
                        <span>Fire on completion</span>
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.automation.triggerOnError}
                          onChange={(e) =>
                            setFormData({ ...formData, automation: { ...formData.automation, triggerOnError: e.target.checked } })
                          }
                          className="rounded text-blue-600"
                        />
                        <span>Fire on failure</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 pt-2">Automated Archive Extraction</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.automation.autoExtractArchives}
                    onChange={(e) =>
                      setFormData({ ...formData, automation: { ...formData.automation, autoExtractArchives: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Auto-extract .zip / .tar / .gz / .rar / .7z archives when downloads complete</span>
                </label>

                {formData.automation.autoExtractArchives && (
                  <div className="space-y-3 pl-6">
                    <div>
                      <label className="text-slate-400 mb-1 block">Password Dictionary (one per line — tried in order for encrypted archives)</label>
                      <textarea
                        rows={4}
                        placeholder={'mypassword123\nbackup-archive-key'}
                        value={formData.automation.archivePasswords.join('\n')}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            automation: {
                              ...formData.automation,
                              archivePasswords: e.target.value.split('\n').map((p) => p.trim()).filter(Boolean),
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.automation.deleteArchiveAfterExtract}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            automation: { ...formData.automation, deleteArchiveAfterExtract: e.target.checked },
                          })
                        }
                        className="rounded text-blue-600"
                      />
                      <span>Delete the original archive after successful extraction</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. POWER GOVERNOR */}
          {activeSection === 'power' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">OS Power Governor</h3>
              <p className="text-slate-400">
                When the entire download queue drains (no active or queued items), G1DM can automatically put the machine to
                sleep or shut it down after a grace period. The countdown cancels itself if new downloads start.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.power.governorEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, power: { ...formData.power, governorEnabled: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Enable power governor</span>
                </label>

                {formData.power.governorEnabled && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div className="space-y-1">
                      <label className="text-slate-400">Action when queue drains</label>
                      <select
                        value={formData.power.actionOnQueueDrained}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            power: { ...formData.power, actionOnQueueDrained: e.target.value as any },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      >
                        <option value="none">Do nothing</option>
                        <option value="notify">Notify only</option>
                        <option value="sleep">Sleep / Suspend</option>
                        <option value="hibernate">Hibernate</option>
                        <option value="shutdown">Shut down</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Grace period (seconds)</label>
                      <input
                        type="number"
                        min={5}
                        max={3600}
                        value={formData.power.graceSeconds}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            power: { ...formData.power, graceSeconds: parseInt(e.target.value, 10) || 60 },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 9. REMOTE CONTROL BOT */}
          {activeSection === 'remote' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Telegram Remote Control</h3>
              <p className="text-slate-400">
                Create a bot with <span className="font-mono text-slate-300">@BotFather</span> on Telegram, paste the token
                below, and send links to your bot from your phone — G1DM downloads them on this machine and replies with
                progress. Commands: /add, /status, /speed, /pause, /resume.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.remote.telegramBotEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, remote: { ...formData.remote, telegramBotEnabled: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Enable Telegram bot (long-polling starts automatically after saving)</span>
                </label>

                {formData.remote.telegramBotEnabled && (
                  <div className="space-y-3 pl-6">
                    <div>
                      <label className="text-slate-400 mb-1 block">Bot Token</label>
                      <input
                        type="password"
                        placeholder="123456789:AAF…"
                        value={formData.remote.telegramBotToken}
                        onChange={(e) =>
                          setFormData({ ...formData, remote: { ...formData.remote, telegramBotToken: e.target.value } })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 mb-1 block">
                        Allowed Chat IDs (comma-separated — leave empty to accept all chats)
                      </label>
                      <input
                        type="text"
                        placeholder="123456789, 987654321"
                        value={formData.remote.telegramAllowedChatIds.join(', ')}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            remote: {
                              ...formData.remote,
                              telegramAllowedChatIds: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 pt-2">Discord Notifications</h3>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Discord Webhook URL</label>
                  <input
                    type="text"
                    placeholder="https://discord.com/api/webhooks/…"
                    value={formData.remote.discordWebhookUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, remote: { ...formData.remote, discordWebhookUrl: e.target.value } })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.remote.notifyOnComplete}
                    onChange={(e) =>
                      setFormData({ ...formData, remote: { ...formData.remote, notifyOnComplete: e.target.checked } })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Send a notification (Telegram + Discord) whenever a download finishes</span>
                </label>
              </div>
            </div>
          )}

          {/* 10. BACKUP & RESTORE */}
          {activeSection === 'backup' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Backup & State Migration</h3>
              <p className="text-slate-300">
                Export and import complete download histories, queues, category rules, and application preferences into standardized JSON backups.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Export JSON Backup</span>
                </button>

                <label className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-2 cursor-pointer border border-slate-700">
                  <Upload className="w-4 h-4" />
                  <span>Restore from Backup</span>
                  <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Save Action */}
          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{t.save}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
