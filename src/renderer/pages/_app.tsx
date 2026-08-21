import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';
import '../styles/globals.css';

// Apply the last known palette before React paints the first frame. The API
// settings still become authoritative once the engine connects, but this keeps
// a saved light theme from flashing dark during hydration.
const themeBootstrapScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('g1dm-theme');
    var mode = ['dark', 'light', 'oled', 'system'].indexOf(stored) !== -1 ? stored : 'dark';
    var resolved = mode === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : mode;
    var root = document.documentElement;
    root.classList.remove('light', 'dark', 'oled');
    root.classList.add(resolved === 'light' ? 'light' : 'dark');
    if (resolved === 'oled') root.classList.add('oled');
    root.dataset.themeMode = mode;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', resolved === 'light' ? '#f8fafc' : resolved === 'oled' ? '#000000' : '#090d16');
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration is best-effort (e.g. unsupported in some dev contexts)
      });
    }
  }, []);

  return (
    <>
      <Script id="theme-bootstrap" strategy="beforeInteractive">
        {themeBootstrapScript}
      </Script>
      <Head>
        <title>G1DM — Next-Generation Internet Download Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#090d16" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="G1DM" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%233b82f6'><path d='M12 2v14m0 0l-5-5m5 5l5-5M4 18h16v2H4z'/></svg>" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
