import type { ThemeMode } from './tokens';

export type ResolvedTheme = ThemeMode;

export const THEME_STORAGE_KEY = 'g1dm-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
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

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme;
}

/**
 * Keep the theme on the document root so every overlay, portal, and page view
 * uses the same two-color palette. The class is retained for Tailwind's dark
 * variant; data-theme is the stable contract used by the design-system CSS.
 */
export function applyTheme(theme: ThemeMode): ResolvedTheme {
  if (typeof document === 'undefined') return resolveTheme(theme);

  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'oled');
  root.classList.add(theme);
  root.dataset.themeMode = theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  return theme;
}
