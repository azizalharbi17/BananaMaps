import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BananaMaps — Crypto Holder Intelligence',
  description: 'Visualize who really holds the bag.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
