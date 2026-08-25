import { DownloadItem } from '../../shared/types';

/** Pure presentation policy; it never mutates a download or calls the engine. */
export function chooseDownloadPopup(
  downloads: DownloadItem[],
  currentId: string | null,
  minimized: Set<string>,
  dismissed: Set<string>,
): { openId: string | null; restoreCompletedId?: string } {
  const completed = downloads.find((item) => item.status === 'completed' && minimized.has(item.id));
  if (completed) return { openId: completed.id, restoreCompletedId: completed.id };
  if (currentId) return { openId: currentId };
  const active = downloads.find((item) => ['downloading', 'queued', 'paused'].includes(item.status) && !minimized.has(item.id) && !dismissed.has(item.id));
  return { openId: active?.id || null };
}
