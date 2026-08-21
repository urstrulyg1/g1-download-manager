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
    var mode = stored === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    root.classList.remove('light', 'dark', 'oled');
    root.classList.add(mode);
    root.dataset.themeMode = mode;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', mode === 'light' ? '#f8fafc' : '#090d16');
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta property="og:image" content="/logo-full.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
