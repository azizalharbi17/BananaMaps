'use client';
import { useState } from 'react';
import Link from 'next/link';
import { API_PLANS, EMBED_PLANS, type BillingInterval } from '@/lib/plans';
import IntervalToggle from './IntervalToggle';
import { apiPlanFeatures, priceParts } from './fmt';

const SIGNUP = '/signup?next=/developers/dashboard';

/** Pricing cards for the API tiers or the Embed plans, with a monthly/yearly toggle. */
export default function PricingTables({ kind }: { kind: 'api' | 'embed' }) {
  const [interval, setInterval] = useState<BillingInterval>('month');

  return (
    <div>
      <div className="dev-pricing-bar"><IntervalToggle value={interval} onChange={setInterval} /></div>

      {kind === 'api' ? (
        <div className="dev-grid-3">
          {API_PLANS.map(p => {
            const price = priceParts(p.priceMonthly, p.priceYearly, interval);
            const featured = p.tier === 'starter';
            const href = p.tier === 'free' ? SIGNUP : `/developers/dashboard?upgrade=api_${p.tier}&interval=${interval}`;
            return (
              <div key={p.tier} className={`dev-card dev-plan${featured ? ' dev-plan-featured' : ''}`}>
                {featured && <span className="dev-plan-tag">Most popular</span>}
                <div className="dev-plan-name">{p.name}</div>
                <div className="dev-price"><span className="dev-price-amt">{price.amount}</span><span className="dev-price-per">{price.per}</span></div>
                <div className="dev-price-note">{price.note}</div>
                <div className="dev-plan-blurb">{p.blurb}</div>
                <ul className="dev-feats">
                  {apiPlanFeatures(p).map(f => <li key={f}>{f}</li>)}
                </ul>
                <Link href={href} className={`bm-btn ${featured ? 'bm-btn-primary' : 'bm-btn-surface'}`}>
                  {p.tier === 'free' ? 'Get a free key' : `Choose ${p.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dev-grid-2">
          {EMBED_PLANS.map(p => {
            const price = priceParts(p.priceMonthly, p.priceYearly, interval);
            const partner = p.plan === 'partner';
            const href = partner ? `/developers/dashboard?upgrade=embed_partner&interval=${interval}` : SIGNUP;
            return (
              <div key={p.plan} className={`dev-card dev-plan${partner ? ' dev-plan-featured' : ''}`}>
                {partner && <span className="dev-plan-tag">For partners</span>}
                <div className="dev-plan-name">{p.name}</div>
                <div className="dev-price"><span className="dev-price-amt">{price.amount}</span><span className="dev-price-per">{price.per}</span></div>
                <div className="dev-price-note">{price.note}</div>
                <div className="dev-plan-blurb">
                  {partner ? 'White-label the map and match it to your brand.' : 'Add live holder maps to any page in minutes.'}
                </div>
                <ul className="dev-feats">
                  {partner && <li>Everything in Free</li>}
                  {p.features.map(f => (
                    <li key={f} className={/required/i.test(f) ? 'dev-feat-req' : undefined}>{f}</li>
                  ))}
                </ul>
                <Link href={href} className={`bm-btn ${partner ? 'bm-btn-primary' : 'bm-btn-surface'}`}>
                  {partner ? 'Become a partner' : 'Add your site'}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
