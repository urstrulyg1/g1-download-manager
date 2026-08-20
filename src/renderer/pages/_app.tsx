import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>G1DM — Next-Generation Internet Download Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%233b82f6'><path d='M12 2v14m0 0l-5-5m5 5l5-5M4 18h16v2H4z'/></svg>" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
