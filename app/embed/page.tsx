import type { Metadata } from 'next';
import AppClient, { type EmbedOptions } from '../app/AppClient';
import { getPartnerConfig } from '@/lib/dev/accounts';

// BananaMaps Embed — the map screen with chrome stripped down for partner
// sites. Framing is allowed from anywhere at the header level (next.config.ts);
// the page itself decides whether the host site may show the map: our own
// properties always can, everyone else needs an active partner id (?pid=).
// Partner-plan extras (badge off, accent color, priority refresh) are resolved
// here from the partner's current plan so the client never has to trust the URL.

type EmbedSearchParams = { token?: string | string[]; chain?: string | string[]; pid?: string | string[]; badge?: string | string[]; accent?: string | string[] };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<EmbedSearchParams> },
): Promise<Metadata> {
  const token = one((await searchParams).token);
  return {
    title: token ? `${token} — BananaMaps Embed` : 'BananaMaps Embed',
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ searchParams }: { searchParams: Promise<EmbedSearchParams> }) {
  const sp = await searchParams;
  const pid = (one(sp.pid) || '').trim();
  const badge = one(sp.badge);
  const accent = (one(sp.accent) || '').trim().replace(/^#/, '');

  // Missing, malformed, revoked or unknown pid → null (never throws).
  const partner = pid ? await getPartnerConfig(pid) : null;
  const isPartnerPlan = partner?.plan === 'partner';

  const embedOptions: EmbedOptions = {
    pid: pid || null,
    plan: partner?.plan ?? null,
    valid: !!partner,
    // Free plan (and first-party / keyless embeds): the "Powered by BananaMaps"
    // badge is required. Partner plan: the dashboard setting applies, and
    // ?badge=0 can still hide it per placement.
    badge: partner ? partner.badge && !(isPartnerPlan && badge === '0') : true,
    accent: isPartnerPlan ? (/^[0-9a-f]{6}$/i.test(accent) ? '#' + accent : partner!.accent) : null,
    domains: partner?.domains ?? [],
  };

  return <AppClient embed embedOptions={embedOptions} />;
}
