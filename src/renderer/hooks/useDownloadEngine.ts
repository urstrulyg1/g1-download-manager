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
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [dls, qs, cats, sets, mets, hists, grabs] = await Promise.all([
        api.getDownloads().catch(() => []),
        api.getQueues().catch(() => []),
        api.getCategories().catch(() => []),
        api.getSettings().catch(() => null),
        api.getMetrics().catch(() => null),
        api.getHistory().catch(() => []),
        api.getGrabberProjects().catch(() => []),
      ]);

      setDownloads(dls || []);
      setQueues(qs || []);
      setCategories(cats || []);
      if (sets) setSettings(sets);
      if (mets) setMetrics(mets);
      setHistory(hists || []);
      setGrabberProjects(grabs || []);
      setIsConnected(true);
    } catch (err) {
      console.error('Failed to load initial engine data:', err);
    }
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

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      refreshAll();
    };

    ws.onmessage = (event) => {
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
            // Refresh history
            api.getHistory().then(setHistory).catch(() => {});
            break;
          }
          case 'item_error': {
            if (data.item) {
              setDownloads((prev) => {
                const idx = prev.findIndex((d) => d.id === data.item.id);
                if (idx === -1) return [data.item, ...prev];
                const copy = [...prev];
                copy[idx] = data.item;
                return copy;
              });
            }
            playChime('error');
            break;
          }
          case 'item_deleted': {
            setDownloads((prev) => prev.filter((d) => d.id !== data.id));
            break;
          }
          case 'metrics_tick': {
            setMetrics(data);
            break;
          }
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
        }
      } catch (err) {
        console.error('Error handling WS event:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket();
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [refreshAll]);

  useEffect(() => {
    connectWebSocket();
    refreshAll();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket, refreshAll]);

  return {
    downloads,
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
