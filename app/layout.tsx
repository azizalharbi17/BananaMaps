import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BananaMaps — Crypto Holder Intelligence',
  description: 'Visualize token holder distribution across Ethereum, BSC, Solana and Base. Expose clusters, whales, and suspicious wallet behaviour in seconds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍌</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
