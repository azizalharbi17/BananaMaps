'use client';
import { API_PLANS, EMBED_PLANS, type ApiTier, type BillingInterval, type EmbedPlan, type Product } from '@/lib/plans';
import IntervalToggle from '../components/IntervalToggle';
import { apiPlanFeatures, priceParts } from '../components/fmt';

export interface ChooserState {
  kind: 'api' | 'embed';
  interval: BillingInterval;
  /** Product to highlight (from ?upgrade=). */
  product?: Product;
}

interface Props {
  state: ChooserState;
  apiTier: ApiTier;
  apiInterval?: string | null;
  apiCancelAtPeriodEnd?: boolean;
  embedPlan: EmbedPlan;
  embedInterval?: string | null;
  embedCancelAtPeriodEnd?: boolean;
  billingConfigured: boolean;
  busy: boolean;
  error: string | null;
  onIntervalChange: (v: BillingInterval) => void;
  onCheckout: (product: Product, interval: BillingInterval) => void;
  onClose: () => void;
}

const TIER_RANK: Record<ApiTier, number> = { free: 0, starter: 1, pro: 2 };

/** Inline plan picker shown under the API or Embed card; sends the choice to Stripe Checkout. */
export default function PlanChooser({ state, apiTier, apiInterval, apiCancelAtPeriodEnd, embedPlan, embedInterval, embedCancelAtPeriodEnd, billingConfigured, busy, error, onIntervalChange, onCheckout, onClose }: Props) {
  const { kind, interval } = state;

  return (
    <div className="dash-chooser" role="region" aria-label={kind === 'api' ? 'Choose an API plan' : 'Choose an Embed plan'}>
      <div className="dash-chooser-head">
        <div>
          <div className="dash-panel-title" style={{ fontSize: 15 }}>{kind === 'api' ? 'Choose an API plan' : 'BananaMaps Embed Partner'}</div>
          <div className="dev-fine">Secure checkout by Stripe. Change or cancel any time; hard quota caps, no overage.</div>
        </div>
        <div className="dash-panel-actions">
          <IntervalToggle value={interval} onChange={onIntervalChange} />
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {!billingConfigured && (
        <div className="dash-notice dash-notice-info">
          <div className="dash-notice-body"><span>Billing opens soon — paid plans cannot be started yet. Your free plan keeps working in the meantime.</span></div>
        </div>
      )}

      {kind === 'api' ? (
        <div className="dash-chooser-grid">
          {API_PLANS.filter(p => p.tier !== 'free').map(p => {
            const price = priceParts(p.priceMonthly, p.priceYearly, interval);
            const product: Product = p.tier === 'pro' ? 'api_pro' : 'api_starter';
            const sameTier = apiTier === p.tier;
            // "Current" only when nothing would change: same tier, same billing interval, not canceling.
            const current = p.tier === 'free' ? apiTier === 'free' : sameTier && (apiInterval ?? 'month') === interval && !apiCancelAtPeriodEnd;
            const highlight = state.product === product || (!state.product && p.tier === 'starter' && apiTier === 'free') || (!state.product && p.tier === 'pro' && apiTier === 'starter');
            const label = current ? 'Current plan'
              : sameTier && apiCancelAtPeriodEnd ? 'Resume plan'
              : sameTier ? `Switch to ${interval === 'year' ? 'yearly' : 'monthly'}`
              : TIER_RANK[p.tier] > TIER_RANK[apiTier] ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
            return (
              <div key={p.tier} className={`dev-card dev-plan${highlight ? ' dev-plan-featured' : ''}`}>
                {highlight && !current && <span className="dev-plan-tag">Recommended</span>}
                <div className="dev-plan-name">{p.name}{current && <span className="dash-badge">Current</span>}</div>
                <div className="dev-price"><span className="dev-price-amt">{price.amount}</span><span className="dev-price-per">{price.per}</span></div>
                <div className="dev-price-note">{price.note}</div>
                <ul className="dev-feats">{apiPlanFeatures(p).map(f => <li key={f}>{f}</li>)}</ul>
                <button
                  type="button"
                  className={`bm-btn ${highlight && !current ? 'bm-btn-primary' : 'bm-btn-surface'}`}
                  disabled={busy || current || !billingConfigured}
                  onClick={() => onCheckout(product, interval)}
                >
                  {busy ? 'Opening checkout…' : label}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dash-chooser-grid">
          {EMBED_PLANS.filter(p => p.plan === 'partner').map(p => {
            const price = priceParts(p.priceMonthly, p.priceYearly, interval);
            const onPartner = embedPlan === 'partner';
            const current = onPartner && (embedInterval ?? 'month') === interval && !embedCancelAtPeriodEnd;
            const embedLabel = current ? 'Current plan' : onPartner && embedCancelAtPeriodEnd ? 'Resume plan' : onPartner ? `Switch to ${interval === 'year' ? 'yearly' : 'monthly'}` : 'Upgrade to Partner';
            return (
              <div key={p.plan} className="dev-card dev-plan dev-plan-featured">
                <span className="dev-plan-tag">Partner</span>
                <div className="dev-plan-name">{p.name}{current && <span className="dash-badge">Current</span>}</div>
                <div className="dev-price"><span className="dev-price-amt">{price.amount}</span><span className="dev-price-per">{price.per}</span></div>
                <div className="dev-price-note">{price.note}</div>
                <ul className="dev-feats">{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                <button
                  type="button"
                  className="bm-btn bm-btn-primary"
                  disabled={busy || current || !billingConfigured}
                  onClick={() => onCheckout('embed_partner', interval)}
                >
                  {busy ? 'Opening checkout…' : embedLabel}
                </button>
              </div>
            );
          })}
          <div className="dev-card" style={{ background: 'var(--surface)' }}>
            <div className="dev-card-title">What changes on Partner</div>
            <ul className="dev-feats" style={{ marginTop: 8 }}>
              <li>Hide the &ldquo;Powered by BananaMaps&rdquo; badge per site</li>
              <li>Set an accent color that replaces the gold in the map</li>
              <li>Priority refresh for the tokens your visitors open</li>
              <li>Email support</li>
            </ul>
            <p className="dev-fine" style={{ marginTop: 14 }}>Your existing sites and partner ids keep working — the new features switch on as soon as the plan is active.</p>
          </div>
        </div>
      )}

      {error && <div className="dash-error" role="alert">{error}</div>}
    </div>
  );
}
