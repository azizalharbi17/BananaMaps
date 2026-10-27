'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EMBED_PLANS, type BillingInterval, type EmbedPlan, type Product } from '@/lib/plans';
import CodeBlock from '../components/CodeBlock';
import { copyText } from '../components/clipboard';
import { embedSnippet, fmtDate } from '../components/fmt';
import type { AccountPayload, DashPartner } from './api';
import PlanChooser, { type ChooserState } from './PlanChooser';

const MAX_SITES = 5;
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export interface PartnerPatch { name?: string; domains?: string[]; accent?: string | null; badge?: boolean }

interface Props {
  data: AccountPayload;
  embedPlan: EmbedPlan;
  chooser: ChooserState | null;
  busy: string | null;
  actionError: string | null;
  onOpenChooser: () => void;
  onCloseChooser: () => void;
  onIntervalChange: (v: BillingInterval) => void;
  onCheckout: (product: Product, interval: BillingInterval) => void;
  onPortal: () => void;
  onCreate: (name: string, domains: string[]) => Promise<void>;
  onUpdate: (pid: string, patch: PartnerPatch) => Promise<void>;
  onRemove: (pid: string) => Promise<void>;
}

const parseDomains = (s: string) => s.split(/[\s,]+/).map(d => d.trim().toLowerCase()).filter(Boolean);

/** BananaMaps Embed: plan, add-a-site form and one card per registered site. */
export default function EmbedSection(props: Props) {
  const { data, embedPlan, chooser, busy, actionError, onOpenChooser, onCloseChooser, onIntervalChange, onCheckout, onPortal, onCreate, onUpdate, onRemove } = props;
  const { account, partners, billingConfigured } = data;
  const partner = embedPlan === 'partner';
  const plan = EMBED_PLANS.find(p => p.plan === embedPlan) || EMBED_PLANS[0];
  const activeSites = partners.filter(p => p.status === 'active');

  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreate(name.trim() || 'My site', parseDomains(domains));
      setName('');
      setDomains('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not add the site.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="dash-panel" aria-labelledby="dash-embed">
      <div className="dash-panel-head">
        <h2 id="dash-embed" className="dash-panel-title">
          BananaMaps Embed
          <span className="dash-badge">{plan.name} plan</span>
          {account.embedStatus === 'past_due' && <span className="dash-badge dash-badge-warn">Payment past due</span>}
          {partner && account.embedCancelAtPeriodEnd && <span className="dash-badge dash-badge-muted">Cancels at period end</span>}
        </h2>
        <div className="dash-panel-actions">
          {partner && account.hasCustomer && (
            <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" disabled={busy !== null || !billingConfigured} onClick={onPortal}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing / cancel'}
            </button>
          )}
          {!partner && (
            <button type="button" className="bm-btn bm-btn-primary dash-btn-sm" disabled={busy !== null} aria-expanded={chooser?.kind === 'embed'} onClick={() => (chooser?.kind === 'embed' ? onCloseChooser() : onOpenChooser())}>
              Upgrade to Partner
            </button>
          )}
          <Link href="/developers/docs#embed" className="bm-btn bm-btn-ghost dash-btn-sm">Embed docs</Link>
        </div>
      </div>

      <p className="dev-p" style={{ marginBottom: 14 }}>
        {partner
          ? <>Partner plan: the badge is optional, you can set an accent color per site, and the tokens your visitors open refresh with priority.{account.embedPeriodEnd ? ` ${account.embedCancelAtPeriodEnd ? 'Access until' : 'Renews'} ${fmtDate(account.embedPeriodEnd)}.` : ''}</>
          : <>Register a site to get a partner id, then paste its snippet on your pages. On the Free plan the &ldquo;Powered by BananaMaps&rdquo; badge is required; the Partner plan (${plan.plan === 'partner' ? plan.priceMonthly : EMBED_PLANS[1].priceMonthly}/mo) makes it optional and adds a custom accent color.</>}
      </p>

      {chooser?.kind === 'embed' && (
        <div style={{ marginBottom: 16 }}>
          <PlanChooser
            state={chooser}
            apiTier={account.apiTier}
            apiInterval={account.apiInterval}
            apiCancelAtPeriodEnd={account.apiCancelAtPeriodEnd}
            embedPlan={embedPlan}
            embedInterval={account.embedInterval}
            embedCancelAtPeriodEnd={account.embedCancelAtPeriodEnd}
            billingConfigured={billingConfigured}
            busy={busy === 'checkout'}
            error={actionError}
            onIntervalChange={onIntervalChange}
            onCheckout={onCheckout}
            onClose={onCloseChooser}
          />
        </div>
      )}
      {chooser?.kind !== 'embed' && actionError && <div className="dash-error" role="alert" style={{ marginBottom: 12 }}>{actionError}</div>}

      <form onSubmit={submit} className="dev-card" style={{ background: 'var(--bg2)', padding: 16 }}>
        <div className="dash-label" style={{ marginBottom: 10 }}>Add a site</div>
        <div className="dash-form">
          <input className="dash-input" value={name} onChange={e => setName(e.target.value)} placeholder="Site name (e.g. My Screener)" maxLength={60} aria-label="Site name" disabled={creating || activeSites.length >= MAX_SITES} />
          <input className="dash-input dash-input-mono" value={domains} onChange={e => setDomains(e.target.value)} placeholder="Domains, optional: example.com, *.example.com" aria-label="Allowed domains" disabled={creating || activeSites.length >= MAX_SITES} style={{ flexBasis: 280 }} />
          <button type="submit" className="bm-btn bm-btn-primary" disabled={creating || activeSites.length >= MAX_SITES}>{creating ? 'Adding…' : 'Add site'}</button>
        </div>
        <div className="dev-fine" style={{ marginTop: 8 }}>
          {activeSites.length >= MAX_SITES ? `You can register up to ${MAX_SITES} sites. Remove one to add another.` : 'Domains lock the id to your pages. Leave empty while testing.'}
        </div>
        {createError && <div className="dash-error" role="alert" style={{ marginTop: 8 }}>{createError}</div>}
      </form>

      <div className="dash-sites">
        {activeSites.map(p => (
          // Keyed by the server values so local drafts reset after every saved change.
          <SiteCard key={`${p.pid}:${p.name}:${p.domains.join(',')}:${p.accent ?? ''}:${p.badge}`} partner={p} plan={embedPlan} onUpdate={onUpdate} onRemove={onRemove} onUpgrade={onOpenChooser} />
        ))}
        {activeSites.length === 0 && <div className="dash-empty">No sites yet — add one above to get a partner id and a snippet.</div>}
      </div>
    </section>
  );
}

function SiteCard({ partner: p, plan, onUpdate, onRemove, onUpgrade }: {
  partner: DashPartner; plan: EmbedPlan;
  onUpdate: Props['onUpdate']; onRemove: Props['onRemove']; onUpgrade: () => void;
}) {
  const isPartner = plan === 'partner';
  const effectiveBadge = isPartner ? p.badge : true;
  const effectiveAccent = isPartner ? p.accent : null;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [domains, setDomains] = useState(p.domains.join(', '));
  const [accent, setAccent] = useState(p.accent || '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'badge' | 'accent' | 'details' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the site.'); }
    finally { setBusy(null); }
  }

  async function copyPid() {
    if (await copyText(p.pid)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  }

  const accentDirty = (accent.trim() ? '#' + accent.trim().replace('#', '').toUpperCase() : null) !== (p.accent || null);
  const accentValid = !accent.trim() || HEX_RE.test(accent.trim());

  return (
    <div className="dash-site">
      <div className="dash-site-head">
        <div className="dash-site-name">
          {p.name}
          <span className="dash-site-pid">
            {p.pid}
            <button type="button" className="dash-iconbtn" onClick={copyPid} aria-label="Copy partner id" title="Copy partner id">{copied ? '✓' : '⧉'}</button>
          </span>
        </div>
        <div className="dash-panel-actions">
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={() => setEditing(v => !v)} aria-expanded={editing}>{editing ? 'Cancel' : 'Edit'}</button>
          {confirming ? null : <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm dash-btn-danger" onClick={() => setConfirming(true)}>Remove</button>}
        </div>
      </div>

      {confirming && (
        <div className="dash-confirm">
          <span>Remove <strong>{p.name}</strong>? Maps using <code className="dev-inline-code">{p.pid}</code> stop rendering on your pages.</span>
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm dash-btn-danger" disabled={busy === 'remove'} onClick={() => run('remove', () => onRemove(p.pid))}>{busy === 'remove' ? 'Removing…' : 'Remove site'}</button>
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" disabled={busy === 'remove'} onClick={() => setConfirming(false)}>Keep</button>
        </div>
      )}

      {editing ? (
        <form
          className="dash-form"
          onSubmit={e => { e.preventDefault(); run('details', async () => { await onUpdate(p.pid, { name: name.trim() || 'My site', domains: parseDomains(domains) }); setEditing(false); }); }}
        >
          <input className="dash-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} aria-label="Site name" disabled={busy === 'details'} />
          <input className="dash-input dash-input-mono" value={domains} onChange={e => setDomains(e.target.value)} placeholder="example.com, *.example.com" aria-label="Allowed domains" disabled={busy === 'details'} style={{ flexBasis: 260 }} />
          <button type="submit" className="bm-btn bm-btn-primary dash-btn-sm" disabled={busy === 'details'}>{busy === 'details' ? 'Saving…' : 'Save'}</button>
        </form>
      ) : (
        <div className="dash-domains">
          <span style={{ color: 'var(--text3)' }}>Domains:</span>
          {p.domains.length ? p.domains.map(d => <span key={d} className="dash-domain">{d}</span>) : <span style={{ color: 'var(--text3)' }}>any (add your domains before launch)</span>}
        </div>
      )}

      <CodeBlock title="Snippet" code={embedSnippet({ pid: p.pid, badge: effectiveBadge, accent: effectiveAccent })} />

      <div className="dash-site-controls">
        <div className="dash-field">
          <span className="dash-label">&ldquo;Powered by BananaMaps&rdquo; badge</span>
          <label className="dash-switch" aria-disabled={!isPartner || busy === 'badge'}>
            <input
              type="checkbox"
              checked={effectiveBadge}
              disabled={!isPartner || busy === 'badge'}
              onChange={e => { const next = e.target.checked; run('badge', () => onUpdate(p.pid, { badge: next })); }}
            />
            <span className="dash-switch-track" aria-hidden />
            <span>{effectiveBadge ? 'Shown' : 'Hidden'}{busy === 'badge' ? '…' : ''}</span>
          </label>
          {!isPartner && (
            <span className="dash-lock"><span aria-hidden>🔒</span> Required on Free · <button type="button" onClick={onUpgrade}>Upgrade to Partner</button></span>
          )}
        </div>

        <div className="dash-field">
          <label className="dash-label" htmlFor={`accent-${p.pid}`}>Accent color</label>
          <div className="dash-accent">
            <input
              type="color"
              aria-label="Pick accent color"
              value={HEX_RE.test(accent.trim()) ? '#' + accent.trim().replace('#', '') : '#F5C842'}
              disabled={!isPartner || busy === 'accent'}
              onChange={e => setAccent(e.target.value.toUpperCase())}
            />
            <input
              id={`accent-${p.pid}`}
              className="dash-input dash-input-mono"
              value={accent}
              placeholder="#F5C842"
              maxLength={7}
              disabled={!isPartner || busy === 'accent'}
              onChange={e => setAccent(e.target.value)}
              aria-invalid={!accentValid}
              style={{ flexBasis: 120 }}
            />
            {isPartner && accentDirty && (
              <button type="button" className="bm-btn bm-btn-primary dash-btn-sm" disabled={!accentValid || busy === 'accent'} onClick={() => run('accent', () => onUpdate(p.pid, { accent: accent.trim() ? '#' + accent.trim().replace('#', '').toUpperCase() : null }))}>
                {busy === 'accent' ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
          {!isPartner
            ? <span className="dash-lock"><span aria-hidden>🔒</span> Partner plan · <button type="button" onClick={onUpgrade}>Upgrade to Partner</button></span>
            : <span className="dev-fine">{!accentValid ? 'Use a 6-digit hex color like #00C805.' : 'Six-digit hex; leave empty for the default gold.'}</span>}
        </div>
      </div>

      {error && <div className="dash-error" role="alert">{error}</div>}
    </div>
  );
}
