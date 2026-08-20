export type ThemeMode = 'dark' | 'oled' | 'light' | 'system';
export type DensityMode = 'compact' | 'comfortable' | 'spacious';
export type ViewMode = 'simple' | 'advanced' | 'developer';

export const designTokens = {
  colors: {
    dark: {
      background: '#090d16',
      surface: '#0f172a',
      surfaceElevated: '#1e293b',
      border: '#334155',
      borderSubtle: '#1e293b',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
    },
    oled: {
      background: '#000000',
      surface: '#080808',
      surfaceElevated: '#121212',
      border: '#222222',
      borderSubtle: '#141414',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
    },
    light: {
      background: '#f8fafc',
      surface: '#ffffff',
      surfaceElevated: '#f1f5f9',
      border: '#e2e8f0',
      borderSubtle: '#f1f5f9',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
    },
    brand: {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      accent: '#38bdf8',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#6366f1',
    },
  },
  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"JetBrains Mono", "Fira Code", monospace',
    },
    sizes: {
      display: 'text-2xl font-extrabold tracking-tight',
      heading: 'text-lg font-bold tracking-tight',
      title: 'text-sm font-semibold tracking-tight',
      body: 'text-xs font-normal leading-relaxed',
      label: 'text-[11px] font-medium tracking-wide uppercase',
      caption: 'text-[10px] font-normal text-slate-400',
      tabularMono: 'font-mono text-xs tabular-nums',
    },
  },
  shadows: {
    none: 'none',
    low: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    medium: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    high: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
    overlay: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
  },
  density: {
    compact: {
      rowPadding: 'py-1 px-2.5',
      tableGap: 'gap-1',
      cardPadding: 'p-3',
    },
    comfortable: {
      rowPadding: 'py-2.5 px-3.5',
      tableGap: 'gap-2',
      cardPadding: 'p-5',
    },
    spacious: {
      rowPadding: 'py-4 px-5',
      tableGap: 'gap-3',
      cardPadding: 'p-6',
    },
  },
};
