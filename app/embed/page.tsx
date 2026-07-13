import type { Metadata } from 'next';
import AppClient from '../app/AppClient';

// Iframe-embeddable map (BananaScreener et al.) — map chrome only, framing
// allowed for partner origins via headers in next.config.ts.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ token?: string }> },
): Promise<Metadata> {
  const { token } = await searchParams;
  return {
    title: token ? `${token} — BananaMaps embed` : 'BananaMaps embed',
    robots: { index: false, follow: false },
  };
}

export default function EmbedPage() {
  return <AppClient embed />;
}
