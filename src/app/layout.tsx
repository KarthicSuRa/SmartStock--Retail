// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { StoreProvider } from '@/hooks/useStoreContext';

export const metadata: Metadata = {
  title: 'SmartStock LiveRetail',
  description: 'Enterprise retail inventory intelligence platform',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1e293b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">
        <StoreProvider>
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
