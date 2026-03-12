import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BananaMaps — Crypto Holder Intelligence",
  description: "Visualize token holder distribution across Ethereum, BSC, Solana and Base. Expose clusters, whales, and suspicious wallet behaviour in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
