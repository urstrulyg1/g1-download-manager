import type { ThemeMode } from './tokens';

export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export const THEME_STORAGE_KEY = 'g1dm-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'oled' || value === 'system';
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Local storage can be unavailable in private browsing or embedded contexts.
  }
}

export function getSystemTheme(): Exclude<ResolvedTheme, 'oled'> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

/**
 * Keep the theme on the document root so every overlay, portal, and page view
 * uses the same palette. The class is retained for Tailwind's dark variant;
 * data-theme is the stable contract used by the design-system CSS.
 */
export function applyTheme(theme: ThemeMode): ResolvedTheme {
  if (typeof document === 'undefined') return resolveTheme(theme);

  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;

  root.classList.remove('light', 'dark', 'oled');
  root.classList.add(resolvedTheme === 'light' ? 'light' : 'dark');
  if (resolvedTheme === 'oled') root.classList.add('oled');

  root.dataset.themeMode = theme;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';

  return resolvedTheme;
}

export function subscribeToSystemTheme(onChange: (theme: Exclude<ResolvedTheme, 'oled'>) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const handleChange = () => onChange(mediaQuery.matches ? 'light' : 'dark');

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }

  // Safari versions that predate MediaQueryList.addEventListener.
  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}
