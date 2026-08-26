import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DownloadItem,
  DownloadQueue,
  CategoryRule,
  AppSettings,
  SystemMetrics,
  SiteGrabberProject,
} from '../../shared/types';
import { api } from '../lib/api';

function playChime(type: 'success' | 'error' | 'start') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }

    // Release audio context resource after chime finishes
    setTimeout(() => {
      try {
        if (ctx.state !== 'closed') ctx.close();
      } catch {}
    }, 600);
  } catch {
    // ignore audio failure
  }
}

export function useDownloadEngine() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [queues, setQueues] = useState<DownloadQueue[]>([]);
  const [categories, setCategories] = useState<CategoryRule[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [grabberProjects, setGrabberProjects] = useState<SiteGrabberProject[]>([]);
  // Initialize to true since the web app is served directly from the active G1DM core server
  const [isConnected, setIsConnected] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const refreshAll = useCallback(async () => {
    // Hydrate concurrently, but return only after every request has settled so
    // callers can deterministically reconcile UI after mutations.
    const results = await Promise.allSettled([
      api.getDownloads(), api.getQueues(), api.getCategories(), api.getSettings(),
      api.getMetrics(), api.getHistory(), api.getGrabberProjects(),
    ]);
    const [dls, qs, cats, sets, mets, hists, grabs] = results;
    if (dls.status === 'fulfilled') { setDownloads(dls.value || []); setIsConnected(true); }
    if (qs.status === 'fulfilled') setQueues(qs.value || []);
    if (cats.status === 'fulfilled') setCategories(cats.value || []);
    if (sets.status === 'fulfilled' && sets.value) setSettings(sets.value);
    if (mets.status === 'fulfilled' && mets.value) setMetrics(mets.value);
    if (hists.status === 'fulfilled') setHistory(hists.value || []);
    if (grabs.status === 'fulfilled') setGrabberProjects(grabs.value || []);
    return results;
  }, []);

  const connectWebSocket = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        void refreshAll();
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const { type, data } = JSON.parse(event.data);

          switch (type) {
            case 'item_progress': {
              setDownloads((prev) => {
                const idx = prev.findIndex((d) => d.id === data.id);
                if (idx === -1) return [data, ...prev];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              break;
            }
            case 'item_added': {
              setDownloads((prev) => [data, ...prev.filter((d) => d.id !== data.id)]);
              playChime('start');
              break;
            }
            case 'item_updated': {
              setDownloads((prev) => {
                const idx = prev.findIndex((d) => d.id === data.id);
                if (idx === -1) return [data, ...prev];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              break;
            }
            case 'item_completed': {
              setDownloads((prev) => {
                const idx = prev.findIndex((d) => d.id === data.id);
                if (idx === -1) return [data, ...prev];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              playChime('success');
              break;
            }
            case 'item_failed': {
              setDownloads((prev) => {
                const idx = prev.findIndex((d) => d.id === data.id);
                if (idx === -1) return [data, ...prev];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              playChime('error');
              break;
            }
            case 'item_error': {
              const failedItem = data?.item;
              if (failedItem) {
                setDownloads((prev) => {
                  const idx = prev.findIndex((d) => d.id === failedItem.id);
                  if (idx === -1) return [failedItem, ...prev];
                  const copy = [...prev];
                  copy[idx] = failedItem;
                  return copy;
                });
              }
              playChime('error');
              break;
            }
            case 'metrics_updated':
            case 'metrics_tick': {
              setMetrics(data);
              break;
            }
            case 'settings_updated': {
              setSettings(data);
              break;
            }
            case 'queue_updated': {
              setQueues((prev) => {
                const idx = prev.findIndex((q) => q.id === data.id);
                if (idx === -1) return [...prev, data];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              break;
            }
            case 'grabber_updated':
            case 'grabber_project_updated': {
              setGrabberProjects((prev) => {
                const idx = prev.findIndex((p) => p.id === data.id);
                if (idx === -1) return [data, ...prev];
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              });
              break;
            }
            case 'item_deleted': {
              const deletedId = typeof data === 'string' ? data : data?.id;
              if (deletedId) {
                setDownloads((prev) => prev.filter((d) => d.id !== deletedId));
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error handling WS event:', err);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttemptRef.current++);
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectWebSocket();
          }
        }, delay);
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {
      // Best-effort WebSocket setup
    }
  }, [refreshAll]);

  useEffect(() => {
    isMountedRef.current = true;
    connectWebSocket();
    refreshAll();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, [connectWebSocket, refreshAll]);

  return {
    downloads,
    setDownloads,
    queues,
    categories,
    settings,
    metrics,
    history,
    grabberProjects,
    isConnected,
    refreshAll,
    setSettings,
    setQueues,
    setCategories,
  };
}
