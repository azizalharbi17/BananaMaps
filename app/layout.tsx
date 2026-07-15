import type { Metadata } from 'next';
import './globals.css';

const TITLE = 'BananaMaps — Crypto Holder Intelligence';
const DESCRIPTION =
  'Visualize token holder distribution across Ethereum, BSC, Solana and Base. Expose clusters, whales, and suspicious wallet behaviour in seconds.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.bananamaps.io'),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'BananaMaps',
  openGraph: {
    type: 'website',
    title: TITLE,
    description: 'Visualize who really holds the bag.',
    url: 'https://www.bananamaps.io',
    siteName: 'BananaMaps',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'Visualize who really holds the bag.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
