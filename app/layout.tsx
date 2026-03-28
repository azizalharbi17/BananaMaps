import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BananaMaps — Crypto Holder Intelligence',
  description: 'Visualize who really holds the bag. Cluster detection, holder maps, and on-chain intelligence.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
