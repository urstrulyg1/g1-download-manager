import { DownloadItem } from '../../shared/types';

/**
 * Pure presentation policy; it never mutates a download or calls the engine.
 *
 * The popup auto-opens only for downloads with an active/controllable
 * transfer ('downloading', 'paused'). Explicitly queued items ("Start Later")
 * stay silent until the user starts them and a real transfer begins.
 *
 * Downloads initiated by the browser companion extension (source === 'browser-extension')
 * are intentionally excluded from auto-popup: the content script already shows
 * an in-page progress overlay inside the source browser tab, so a duplicate
 * popup inside the G1DM app window is redundant and unwanted.
 */
export function chooseDownloadPopup(
  downloads: DownloadItem[],
  currentId: string | null,
  minimized: Set<string>,
  dismissed: Set<string>,
): { openId: string | null; restoreCompletedId?: string } {
  // Restore a minimized download that just finished — but never restore if it
  // has also been dismissed (e.g. the user dismissed it while it was minimized).
  const completed = downloads.find(
    (item) => item.status === 'completed' && minimized.has(item.id) && !dismissed.has(item.id),
  );
  if (completed) return { openId: completed.id, restoreCompletedId: completed.id };

  if (currentId) return { openId: currentId };

  // Only auto-open for downloads NOT initiated from the browser extension
  const active = downloads.find(
    (item) =>
      item.status === 'downloading' &&
      item.source !== 'browser-extension' &&
      !minimized.has(item.id) &&
      !dismissed.has(item.id),
  );
  return { openId: active?.id || null };
}
