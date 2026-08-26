import { DownloadItem } from '../../shared/types';

/**
 * Pure presentation policy; it never mutates a download or calls the engine.
 *
 * The popup auto-opens only for downloads with an active/controllable
 * transfer ('downloading', 'paused'). Explicitly queued items ("Start Later")
 * stay silent until the user starts them and a real transfer begins.
 */
export function chooseDownloadPopup(
  downloads: DownloadItem[],
  currentId: string | null,
  minimized: Set<string>,
  dismissed: Set<string>,
): { openId: string | null; restoreCompletedId?: string } {
  const completed = downloads.find((item) => item.status === 'completed' && minimized.has(item.id));
  if (completed) return { openId: completed.id, restoreCompletedId: completed.id };
  if (currentId) return { openId: currentId };
  const active = downloads.find((item) => item.status === 'downloading' && !minimized.has(item.id) && !dismissed.has(item.id));
  return { openId: active?.id || null };
}
