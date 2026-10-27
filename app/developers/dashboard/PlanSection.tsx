'use client';
import Link from 'next/link';
import { apiPlan, type BillingInterval, type Product } from '@/lib/plans';
import { fmtDate, fmtDateUtc, fmtNum } from '../components/fmt';
import type { AccountPayload } from './api';
import PlanChooser, { type ChooserState } from './PlanChooser';

interface Props {
  data: AccountPayload;
  chooser: ChooserState | null;
  busy: string | null;
  actionError: string | null;
  onOpenChooser: (product?: Product) => void;
  onCloseChooser: () => void;
  onIntervalChange: (v: BillingInterval) => void;
  onCheckout: (product: Product, interval: BillingInterval) => void;
  onPortal: () => void;
}

/** The API plan card: tier, usage bar, period, upgrade / manage billing. */
export default function PlanSection({ data, chooser, busy, actionError, onOpenChooser, onCloseChooser, onIntervalChange, onCheckout, onPortal }: Props) {
  const { account, usage, billingConfigured } = data;
  const plan = apiPlan(account.apiTier);
  const pct = usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const nearLimit = pct >= 90;
  const paid = account.apiTier !== 'free';
  const pastDue = account.apiStatus === 'past_due';
  const priceLine = !paid ? 'Free' : account.apiInterval === 'year' ? `$${fmtNum(plan.priceYearly)} / year` : `$${plan.priceMonthly} / month`;

  return (
    <section className="dash-panel" aria-labelledby="dash-plan">
      <div className="dash-panel-head">
        <h2 id="dash-plan" className="dash-panel-title">
          BananaMaps API
          <span className="dash-badge">{plan.name} plan</span>
          {pastDue && <span className="dash-badge dash-badge-warn">Payment past due</span>}
          {paid && account.apiCancelAtPeriodEnd && <span className="dash-badge dash-badge-muted">Cancels at period end</span>}
        </h2>
        <div className="dash-panel-actions">
          {!billingConfigured && <span className="dash-badge dash-badge-muted" title="Paid plans are not available yet">Billing opens soon</span>}
          {account.hasCustomer && (
            <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" disabled={busy !== null || !billingConfigured} onClick={onPortal}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing / cancel'}
            </button>
          )}
          <button
            type="button"
            className={`bm-btn ${paid ? 'bm-btn-surface' : 'bm-btn-primary'} dash-btn-sm`}
            disabled={busy !== null}
            aria-expanded={chooser?.kind === 'api'}
            onClick={() => (chooser?.kind === 'api' ? onCloseChooser() : onOpenChooser())}
          >
            {account.apiTier === 'pro' ? 'Change plan' : 'Upgrade'}
          </button>
        </div>
      </div>

      <div className="dash-stats">
        <div className="dash-stat">
          <div className="dash-stat-label">Calls this month</div>
          <div className="dash-stat-value">{fmtNum(usage.used)} <small>/ {fmtNum(usage.quota)}</small></div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-label">Rate limit</div>
          <div className="dash-stat-value">{usage.perMinute} <small>calls / minute</small></div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-label">Price</div>
          <div className="dash-stat-value">{priceLine}</div>
        </div>
      </div>

      <div className={`dash-bar${nearLimit ? ' dash-bar-warn' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={usage.quota} aria-valuenow={usage.used} aria-label="Monthly quota used">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="dash-meta">
        <span><strong>{pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%</strong> of quota used</span>
        <span>Resets <strong>{fmtDateUtc(usage.resetsAt)}</strong></span>
        {paid && account.apiPeriodEnd && (
          <span>{account.apiCancelAtPeriodEnd ? 'Access until' : 'Renews'} <strong>{fmtDate(account.apiPeriodEnd)}</strong>{account.apiInterval ? ` · billed ${account.apiInterval === 'year' ? 'yearly' : 'monthly'}` : ''}</span>
        )}
      </div>

      {nearLimit && (
        <div className="dash-notice dash-notice-warn" style={{ marginTop: 14 }}>
          <div className="dash-notice-body">
            <span>
              {pct >= 100 ? 'Quota reached — calls answer 429 quota_exceeded until the reset.' : 'You are close to your monthly quota.'}{' '}
              {account.apiTier !== 'pro' ? 'Upgrade for a higher cap.' : `Your quota resets ${fmtDateUtc(usage.resetsAt)}.`}
            </span>
          </div>
          {account.apiTier !== 'pro' && <button type="button" className="bm-btn bm-btn-primary dash-btn-sm" onClick={() => onOpenChooser()}>See plans</button>}
        </div>
      )}
      {pastDue && (
        <div className="dash-notice dash-notice-warn" style={{ marginTop: 14 }}>
          <div className="dash-notice-body"><span>Your last payment failed. Update your payment method to keep the {plan.name} plan.</span></div>
          {account.hasCustomer && <button type="button" className="bm-btn bm-btn-primary dash-btn-sm" disabled={busy !== null} onClick={onPortal}>Update payment method</button>}
        </div>
      )}
      {account.apiCancelAtPeriodEnd && paid && (
        <div className="dash-notice dash-notice-info" style={{ marginTop: 14 }}>
          <div className="dash-notice-body">
            <span>Your {plan.name} plan is set to cancel on {fmtDate(account.apiPeriodEnd)}. You keep its quota until then, and drop to Free afterwards. Choose the plan again below to resume it.</span>
          </div>
        </div>
      )}

      {chooser?.kind === 'api' && (
        <PlanChooser
          state={chooser}
          apiTier={account.apiTier}
          apiInterval={account.apiInterval}
          apiCancelAtPeriodEnd={account.apiCancelAtPeriodEnd}
          embedPlan={account.embedPlan}
          embedInterval={account.embedInterval}
          embedCancelAtPeriodEnd={account.embedCancelAtPeriodEnd}
          billingConfigured={billingConfigured}
          busy={busy === 'checkout'}
          error={actionError}
          onIntervalChange={onIntervalChange}
          onCheckout={onCheckout}
          onClose={onCloseChooser}
        />
      )}
      {chooser?.kind !== 'api' && actionError && <div className="dash-error" role="alert" style={{ marginTop: 12 }}>{actionError}</div>}

      <p className="dev-fine" style={{ marginTop: 14 }}>
        Quotas are hard caps on calendar months (UTC). Need more than Pro? <Link href="/developers/docs#limits" style={{ color: 'var(--text2)' }}>Limits</Link> · <Link href="/refunds" style={{ color: 'var(--text2)' }}>Cancellation &amp; refunds</Link>
      </p>
    </section>
  );
}
