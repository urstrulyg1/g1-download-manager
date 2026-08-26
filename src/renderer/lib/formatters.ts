/**
 * Shared formatting utilities used across all renderer views.
 * Import from here instead of copy-pasting these functions in each component.
 */

/**
 * Formats a byte count into a human-readable string (e.g. "1.23 GB").
 * Returns "0 B" for zero or negative values.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Formats a duration in seconds into a compact human-readable string.
 * e.g. 3661 → "1h 01m", 90 → "01m 30s", 5 → "5s"
 */
export function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}
