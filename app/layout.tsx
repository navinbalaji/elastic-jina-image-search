import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppFooter } from '@/components/AppFooter';
import { AppHeader } from '@/components/AppHeader';
import { COLOR_MODE_COOKIE, parseColorMode, SYSTEM_COLOR_MODE_COOKIE } from '@/lib/color-mode';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Image Search',
  description: 'Reverse image search with Jina embeddings on Elastic Inference Service and Elasticsearch kNN',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const colorMode = parseColorMode(cookies().get(COLOR_MODE_COOKIE)?.value);
  const systemColorMode = parseColorMode(cookies().get(SYSTEM_COLOR_MODE_COOKIE)?.value);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Roboto+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers colorMode={colorMode} systemColorMode={systemColorMode}>
          <AppHeader />
          {/* Fill the viewport so the footer sits at the bottom */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
            }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
            <AppFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
