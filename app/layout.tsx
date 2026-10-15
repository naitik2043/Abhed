import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Abhed — Accountability OS for AI agents',
  description: 'One registry, one rulebook and one tamper-evident ledger for a workforce of people and AI agents.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-8 -1 48 50'%3E%3Crect x='-8' y='-1' width='48' height='50' rx='10' fill='%230a0a0a'/%3E%3Cpath d='M21.5 0L21.5 19.5L31.5 19.5L31.5 29L10 48.5L10 28.5L0.5 28.5L0.5 18.5Z' fill='%23d4d4d4'/%3E%3Crect x='0.5' y='18.5' width='9' height='10' fill='%23ffffff'/%3E%3Crect x='22' y='19.5' width='9.5' height='9.5' fill='%23ffffff'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { themeColor: '#ffffff', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* light by default; a saved choice of dark is applied before first paint, so nothing flashes */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('abhed-theme')=='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Abhed" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@300..900&family=Instrument+Serif:ital@0;1&family=Geist:wght@300..800&family=Geist+Mono:wght@400;500&family=Manrope:wght@200..800&family=Inter:ital,opsz,wght@0,14..32,100..900&family=JetBrains+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=Epilogue:wght@900&family=Tiro+Devanagari+Hindi&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
