'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABEL, type BillingInterval, type Product } from '@/lib/plans';
import {
  DevApiError, devFetch, effectiveEmbedPlan, errorMessage, hasProduct, isInterval, isProduct, planSnapshot, type AccountPayload,
} from './api';
import type { ChooserState } from './PlanChooser';
import PlanSection from './PlanSection';
import KeysSection from './KeysSection';
import EmbedSection, { type PartnerPatch } from './EmbedSection';

const SIGN_IN = '/login?next=/developers/dashboard';
const SIGN_UP = '/signup?next=/developers/dashboard';
const DASHBOARD_PATH = '/developers/dashboard';
const POLL_EVERY_MS = 3000;
const POLL_FOR_MS = 30_000;

type Gate =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'unconfirmed'; email: string }
  | { kind: 'blocked'; title: string; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

type CheckoutNotice =
  | { kind: 'pending'; product: Product | null }
  | { kind: 'done'; label: string }
  | { kind: 'timeout' }
  | { kind: 'canceled' };

export default function DashboardClient() {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [data, setData] = useState<AccountPayload | null>(null);
  const [email, setEmail] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [chooser, setChooser] = useState<ChooserState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutNotice | null>(null);
  const handledParams = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<AccountPayload | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  /** After a successful checkout, poll until the webhook has updated the plan (every 3 s, up to 30 s). */
  const startPolling = useCallback((initial: AccountPayload, product: Product | null) => {
    // The plan changes when Stripe's webhook lands, which is usually seconds after
    // the redirect: poll until anything in the plan snapshot differs from what we
    // had before checkout (every 3 s, up to 30 s).
    setCheckout({ kind: 'pending', product });
    const base = planSnapshot(initial.account);
    const started = Date.now();
    const tick = async () => {
      let fresh: AccountPayload | null = null;
      try { fresh = await devFetch<AccountPayload>('/api/dev/account'); } catch { fresh = null; }
      if (fresh) {
        setData(fresh);
        if (planSnapshot(fresh.account) !== base) {
          setCheckout({ kind: 'done', label: product ? PRODUCT_LABEL[product] : 'your plan' });
          return;
        }
      }
      if (Date.now() - started >= POLL_FOR_MS) {
        setCheckout(product && fresh && hasProduct(fresh.account, product) ? { kind: 'done', label: PRODUCT_LABEL[product] } : { kind: 'timeout' });
        return;
      }
      pollTimer.current = setTimeout(tick, POLL_EVERY_MS);
    };
    pollTimer.current = setTimeout(tick, 1500);
  }, []);

  /** ?upgrade=<product>&interval=, ?checkout=success&product=, ?checkout=canceled — applied once, after the first successful load. */
  const applyUrlParams = useCallback((payload: AccountPayload) => {
    if (handledParams.current) return;
    handledParams.current = true;
    const q = new URLSearchParams(window.location.search);
    const upgrade = q.get('upgrade');
    const interval = q.get('interval');
    const status = q.get('checkout');
    const product = q.get('product');
    if (isProduct(upgrade)) {
      setChooser({ kind: upgrade === 'embed_partner' ? 'embed' : 'api', product: upgrade, interval: isInterval(interval) ? interval : 'month' });
    }
    if (status === 'success') startPolling(payload, isProduct(product) ? product : null);
    else if (status === 'canceled') setCheckout({ kind: 'canceled' });
    if (upgrade || status) {
      try { window.history.replaceState(null, '', DASHBOARD_PATH); } catch { /* ignore */ }
    }
  }, [startPolling]);

  /**
   * Load (or create) the account. Nothing is set before the first await, so the
   * initial call can run from the mount effect; a silent reload keeps the page
   * rendered and surfaces a failure as an action error instead of a gate.
   */
  const load = useCallback(async (silent = false): Promise<AccountPayload | null> => {
    let sessionEmail = '';
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { setGate({ kind: 'signed_out' }); return null; }
      sessionEmail = s.session.user.email || '';
      setEmail(sessionEmail);
      const payload = await devFetch<AccountPayload>('/api/dev/account');
      setData(payload);
      if (payload.firstKey) setRevealedKey(payload.firstKey);
      setGate({ kind: 'ready' });
      applyUrlParams(payload);
      return payload;
    } catch (e) {
      const err = e instanceof DevApiError ? e : new DevApiError(500, 'error', errorMessage(e));
      if (silent && dataRef.current && err.status !== 401) { setActionError(err.message); return null; }
      if (err.status === 401) setGate({ kind: 'signed_out' });
      else if (err.code === 'email_unconfirmed') setGate({ kind: 'unconfirmed', email: sessionEmail });
      else if (err.code === 'disposable_email') setGate({ kind: 'blocked', title: 'Use a regular email address', message: err.message });
      else if (err.code === 'signup_rate_limited') setGate({ kind: 'blocked', title: 'Too many accounts from your network', message: err.message });
      else setGate({ kind: 'error', message: err.message });
      return null;
    }
  }, [applyUrlParams]);

  // Initial fetch on mount: every state update inside load() happens after an await (never synchronously in the effect body).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { setData(null); setGate({ kind: 'signed_out' }); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- actions ----------

  /** Full reload from a button: show the loading gate, then fetch. */
  function reload() {
    setGate({ kind: 'loading' });
    void load();
  }

  async function startCheckout(product: Product, interval: BillingInterval) {
    setBusy('checkout');
    setActionError(null);
    try {
      const { url } = await devFetch<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { product, interval } });
      window.location.assign(url);
    } catch (e) {
      const err = e instanceof DevApiError ? e : null;
      setActionError(err?.code === 'billing_unavailable' ? 'Billing opens soon — paid plans cannot be started yet.' : errorMessage(e));
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal');
    setActionError(null);
    try {
      const { url } = await devFetch<{ url: string }>('/api/billing/portal', { method: 'POST', body: {} });
      window.location.assign(url);
    } catch (e) {
      const err = e instanceof DevApiError ? e : null;
      setActionError(err?.code === 'no_customer' ? 'There is no billing account yet — subscribe to a paid plan first.' : err?.code === 'billing_unavailable' ? 'Billing opens soon.' : errorMessage(e));
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    try { await supabase.auth.signOut(); } catch { /* the auth listener handles the state */ }
    setData(null);
    setGate({ kind: 'signed_out' });
    setBusy(null);
  }

  const refresh = async () => { await load(true); };

  const createKey = async (name: string) => {
    const res = await devFetch<{ key: string }>('/api/dev/keys', { method: 'POST', body: { name } });
    setRevealedKey(res.key);
    await refresh();
  };
  const renameKey = async (id: string, name: string) => { await devFetch(`/api/dev/keys/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }); await refresh(); };
  const revokeKey = async (id: string) => { await devFetch(`/api/dev/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh(); };
  const createPartner = async (name: string, domains: string[]) => { await devFetch('/api/dev/embed', { method: 'POST', body: { name, domains } }); await refresh(); };
  const updatePartner = async (pid: string, patch: PartnerPatch) => { await devFetch(`/api/dev/embed/${encodeURIComponent(pid)}`, { method: 'PATCH', body: patch }); await refresh(); };
  const removePartner = async (pid: string) => { await devFetch(`/api/dev/embed/${encodeURIComponent(pid)}`, { method: 'DELETE' }); await refresh(); };

  const openChooser = (kind: 'api' | 'embed', product?: Product) => { setActionError(null); setChooser({ kind, product, interval: chooser?.interval || 'month' }); };
  const closeChooser = () => { setChooser(null); setActionError(null); };
  const chooseInterval = (interval: BillingInterval) => setChooser(c => (c ? { ...c, interval } : c));

  // ---------- gates ----------

  if (gate.kind === 'loading') {
    return (
      <div className="dev-container dash-center">
        <div className="dash-gate dash-panel" style={{ border: 0, background: 'none' }}>
          <div className="dash-spinner" aria-hidden />
          <p className="dev-p">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (gate.kind === 'signed_out') {
    // Rendered on the client only (after the session check), so the URL is safe to read: a ?upgrade= intent survives the sign-in round trip.
    const here = typeof window !== 'undefined' && window.location.pathname.startsWith(DASHBOARD_PATH) ? `${window.location.pathname}${window.location.search}` : DASHBOARD_PATH;
    const signIn = here === DASHBOARD_PATH ? SIGN_IN : `/login?next=${encodeURIComponent(here)}`;
    const signUp = here === DASHBOARD_PATH ? SIGN_UP : `/signup?next=${encodeURIComponent(here)}`;
    return (
      <div className="dev-container dash-center">
        <div className="dash-gate dash-panel">
          <div className="dash-gate-icon" aria-hidden>🔑</div>
          <h1 className="dev-h2">Developer dashboard</h1>
          <p className="dev-p">Sign in to manage your BananaMaps API keys, see this month&apos;s usage, change your plan and set up BananaMaps Embed sites.</p>
          <div className="dev-actions">
            <Link href={signIn} className="bm-btn bm-btn-primary dev-btn-lg">Sign in</Link>
            <Link href={signUp} className="bm-btn bm-btn-ghost dev-btn-lg">Create a free account</Link>
          </div>
          <p className="dev-fine">1,000 free API calls a month · No card required</p>
        </div>
      </div>
    );
  }

  if (gate.kind === 'unconfirmed') {
    return <ConfirmEmailGate email={gate.email || email} onReload={reload} onSignOut={signOut} />;
  }

  if (gate.kind === 'blocked') {
    return (
      <div className="dev-container dash-center">
        <div className="dash-gate dash-panel">
          <div className="dash-gate-icon" aria-hidden>⛔</div>
          <h1 className="dev-h2">{gate.title}</h1>
          <p className="dev-p">{gate.message}</p>
          <div className="dev-actions">
            <button type="button" className="bm-btn bm-btn-ghost" onClick={reload}>Try again</button>
            <button type="button" className="bm-btn bm-btn-ghost" onClick={signOut} disabled={busy === 'signout'}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (gate.kind === 'error' || !data) {
    return (
      <div className="dev-container dash-center">
        <div className="dash-gate dash-panel">
          <div className="dash-gate-icon" aria-hidden>⚠️</div>
          <h1 className="dev-h2">Could not load your dashboard</h1>
          <p className="dev-p">{gate.kind === 'error' ? gate.message : 'Something went wrong.'}</p>
          <div className="dev-actions">
            <button type="button" className="bm-btn bm-btn-primary" onClick={reload}>Retry</button>
            <button type="button" className="bm-btn bm-btn-ghost" onClick={signOut} disabled={busy === 'signout'}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- dashboard ----------

  const embedPlan = effectiveEmbedPlan(data.account);

  return (
    <div className="dev-container dash">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">Developer dashboard</h1>
          <div className="dash-who">{data.account.email || email}</div>
        </div>
        <div className="dash-panel-actions">
          <Link href="/developers/docs" className="bm-btn bm-btn-ghost dash-btn-sm">API docs</Link>
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={signOut} disabled={busy === 'signout'}>{busy === 'signout' ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </header>

      {checkout && <CheckoutBanner notice={checkout} onDismiss={() => setCheckout(null)} />}

      <PlanSection
        data={data}
        chooser={chooser}
        busy={busy}
        actionError={chooser?.kind === 'embed' ? null : actionError}
        onOpenChooser={product => openChooser('api', product)}
        onCloseChooser={closeChooser}
        onIntervalChange={chooseInterval}
        onCheckout={startCheckout}
        onPortal={openPortal}
      />

      <KeysSection
        keys={data.keys}
        revealedKey={revealedKey}
        onDismissRevealed={() => setRevealedKey(null)}
        onCreate={createKey}
        onRename={renameKey}
        onRevoke={revokeKey}
      />

      <EmbedSection
        data={data}
        embedPlan={embedPlan}
        chooser={chooser}
        busy={busy}
        actionError={chooser?.kind === 'embed' ? actionError : null}
        onOpenChooser={() => openChooser('embed', 'embed_partner')}
        onCloseChooser={closeChooser}
        onIntervalChange={chooseInterval}
        onCheckout={startCheckout}
        onPortal={openPortal}
        onCreate={createPartner}
        onUpdate={updatePartner}
        onRemove={removePartner}
      />

      <p className="dev-fine">
        By using the BananaMaps API and BananaMaps Embed you agree to the <Link href="/terms" style={{ color: 'var(--text2)' }}>Terms of Service</Link>,{' '}
        <Link href="/privacy" style={{ color: 'var(--text2)' }}>Privacy Policy</Link> and <Link href="/refunds" style={{ color: 'var(--text2)' }}>Refund &amp; Cancellation Policy</Link>.
        Data is informational and not financial advice.
      </p>
    </div>
  );
}

function CheckoutBanner({ notice, onDismiss }: { notice: CheckoutNotice; onDismiss: () => void }) {
  if (notice.kind === 'pending') {
    return (
      <div className="dash-notice dash-notice-info" role="status">
        <div className="dash-notice-body">
          <span className="dash-spinner dash-spinner-sm" aria-hidden />
          <span>Thanks — your plan is updating. This usually takes a few seconds{notice.product ? ` (${PRODUCT_LABEL[notice.product]})` : ''}.</span>
        </div>
      </div>
    );
  }
  if (notice.kind === 'done') {
    return (
      <div className="dash-notice dash-notice-ok" role="status">
        <div className="dash-notice-body"><span aria-hidden>✓</span><span>You&apos;re on {notice.label}. Your new limits apply immediately.</span></div>
        <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }
  if (notice.kind === 'timeout') {
    return (
      <div className="dash-notice dash-notice-info" role="status">
        <div className="dash-notice-body"><span>Payment received — your plan is still updating. Reload this page in a minute; if nothing changes, contact support with your receipt.</span></div>
        <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
  return (
    <div className="dash-notice dash-notice-info" role="status">
      <div className="dash-notice-body"><span>Checkout canceled — nothing was charged and your plan is unchanged.</span></div>
      <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function ConfirmEmailGate({ email, onReload, onSignOut }: { email: string; onReload: () => void; onSignOut: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    if (!email) { setState('failed'); setMessage('No email address on this session. Sign out and sign in again.'); return; }
    setState('sending');
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/developers/dashboard')}` } });
      if (error) throw error;
      setState('sent');
      setMessage(`Sent — check ${email} (and your spam folder).`);
    } catch (e) {
      setState('failed');
      setMessage(e instanceof Error ? e.message : 'Could not resend the email. Try again in a minute.');
    }
  }

  return (
    <div className="dev-container dash-center">
      <div className="dash-gate dash-panel">
        <div className="dash-gate-icon" aria-hidden>✉️</div>
        <h1 className="dev-h2">Confirm your email</h1>
        <p className="dev-p">
          We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email || 'your address'}</strong>. Click it, then come back here —
          your free API key is created the moment your email is confirmed.
        </p>
        <div className="dev-actions">
          <button type="button" className="bm-btn bm-btn-primary" onClick={onReload}>I&apos;ve confirmed — reload</button>
          <button type="button" className="bm-btn bm-btn-ghost" onClick={resend} disabled={state === 'sending' || state === 'sent'}>
            {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Email sent' : 'Resend email'}
          </button>
        </div>
        {message && <p className={state === 'failed' ? 'dash-error' : 'dev-fine'} role="status">{message}</p>}
        <button type="button" className="dash-link-btn" onClick={onSignOut}>Not you? Sign out</button>
      </div>
    </div>
  );
}
