'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { copyText } from '../components/clipboard';
import { fmtAgo, fmtDate, fmtNum } from '../components/fmt';
import type { DashKey } from './api';

const MAX_ACTIVE_KEYS = 5;

interface Props {
  keys: DashKey[];
  revealedKey: string | null;
  onDismissRevealed: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}

/** API keys: one-time reveal box, create form, list with inline rename and confirm-to-revoke. */
export default function KeysSection({ keys, revealedKey, onDismissRevealed, onCreate, onRename, onRevoke }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const active = keys.filter(k => k.status === 'active');
  const revoked = keys.filter(k => k.status !== 'active');
  const atLimit = active.length >= MAX_ACTIVE_KEYS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreate(name.trim() || 'Default');
      setName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the key.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="dash-panel" aria-labelledby="dash-keys">
      <div className="dash-panel-head">
        <h2 id="dash-keys" className="dash-panel-title">API keys <span className="dash-badge dash-badge-muted">{active.length} of {MAX_ACTIVE_KEYS} active</span></h2>
        <Link href="/developers/docs#auth" className="dash-link-btn">How to authenticate →</Link>
      </div>

      {revealedKey && <RevealedKey value={revealedKey} onDone={onDismissRevealed} />}

      <form className="dash-form" onSubmit={submit} style={{ marginTop: revealedKey ? 16 : 0 }}>
        <input
          className="dash-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Key name (e.g. production, bot)"
          maxLength={40}
          aria-label="Name for the new key"
          disabled={creating || atLimit}
        />
        <button type="submit" className="bm-btn bm-btn-primary" disabled={creating || atLimit}>
          {creating ? 'Creating…' : 'Create key'}
        </button>
        {atLimit && <span className="dev-fine">Revoke a key to create another.</span>}
      </form>
      {createError && <div className="dash-error" role="alert" style={{ marginTop: 8 }}>{createError}</div>}

      <div className="dash-keys" style={{ marginTop: 18 }}>
        {keys.length > 0 && (
          <div className="dash-key dash-key-headrow" aria-hidden>
            <div>Key</div><div>Name</div><div>Created</div><div>Last used</div><div>Calls</div><div />
          </div>
        )}
        {active.map(k => <KeyRow key={k.id} k={k} onRename={onRename} onRevoke={onRevoke} />)}
        {revoked.map(k => <KeyRow key={k.id} k={k} onRename={onRename} onRevoke={onRevoke} />)}
        {keys.length === 0 && <div className="dash-empty">No keys yet — create one above.</div>}
      </div>
    </section>
  );
}

function RevealedKey({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  }
  return (
    <div className="dash-newkey" role="status">
      <div className="dash-newkey-title"><span aria-hidden>🔑</span> Your new API key</div>
      <div className="dash-newkey-key">
        <code style={{ flex: 1, minWidth: 0 }}>{value}</code>
        <button type="button" className="bm-btn bm-btn-primary dash-btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="dash-newkey-warn">
        <strong>Copy it now — it will not be shown again.</strong> We keep only a hash. If you lose it, revoke this key and create a new one.
      </div>
      <div><button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={onDone}>I saved it</button></div>
    </div>
  );
}

function KeyRow({ k, onRename, onRevoke }: { k: DashKey; onRename: Props['onRename']; onRevoke: Props['onRevoke'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(k.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'rename' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const revokedRow = k.status !== 'active';

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  async function saveName() {
    const next = draft.trim();
    if (!next || next === k.name) { setEditing(false); setDraft(k.name); return; }
    setBusy('rename');
    setError(null);
    try { await onRename(k.id, next); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not rename the key.'); }
    finally { setBusy(null); }
  }

  async function revoke() {
    setBusy('revoke');
    setError(null);
    try { await onRevoke(k.id); setConfirming(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke the key.'); }
    finally { setBusy(null); }
  }

  return (
    <div className={`dash-key${revokedRow ? ' dash-key-revoked' : ''}`}>
      <div className="dash-cell">
        <div className="dash-cell-label">Key</div>
        <span className="dash-cell-mono">{k.prefix}…</span>
      </div>
      <div className="dash-cell">
        <div className="dash-cell-label">Name</div>
        {editing ? (
          <form className="dash-form" onSubmit={e => { e.preventDefault(); saveName(); }} style={{ gap: 6 }}>
            <input
              ref={inputRef}
              className="dash-input"
              value={draft}
              maxLength={40}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(k.name); } }}
              aria-label="Key name"
              disabled={busy === 'rename'}
              style={{ padding: '6px 10px', flexBasis: 140 }}
            />
            <button type="submit" className="bm-btn bm-btn-primary dash-btn-sm" disabled={busy === 'rename'}>{busy === 'rename' ? 'Saving…' : 'Save'}</button>
            <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={() => { setEditing(false); setDraft(k.name); }} disabled={busy === 'rename'}>Cancel</button>
          </form>
        ) : (
          <div className="dash-cell-name">
            <span title={k.name}>{k.name}</span>
            {!revokedRow && (
              <button type="button" className="dash-iconbtn" onClick={() => { setDraft(k.name); setEditing(true); }} aria-label={`Rename key ${k.name}`} title="Rename">✎</button>
            )}
          </div>
        )}
      </div>
      <div className="dash-cell">
        <div className="dash-cell-label">Created</div>
        <span className="dash-cell-mono">{fmtDate(k.createdAt)}</span>
      </div>
      <div className="dash-cell">
        <div className="dash-cell-label">Last used</div>
        <span className="dash-cell-mono">{fmtAgo(k.lastUsedAt)}</span>
      </div>
      <div className="dash-cell">
        <div className="dash-cell-label">Calls this month</div>
        <span className="dash-cell-mono">{fmtNum(k.calls)}</span>
      </div>
      <div className="dash-cell dash-cell-actions">
        {revokedRow ? (
          <span className="dash-badge dash-badge-muted">Revoked</span>
        ) : confirming ? (
          <div className="dash-confirm">
            <span>Revoke <strong>{k.name}</strong>? Requests with it fail immediately.</span>
            <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm dash-btn-danger" onClick={revoke} disabled={busy === 'revoke'}>{busy === 'revoke' ? 'Revoking…' : 'Revoke key'}</button>
            <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm" onClick={() => setConfirming(false)} disabled={busy === 'revoke'}>Keep</button>
          </div>
        ) : (
          <button type="button" className="bm-btn bm-btn-ghost dash-btn-sm dash-btn-danger" onClick={() => setConfirming(true)}>Revoke</button>
        )}
      </div>
      {error && <div className="dash-error dash-cell-wide" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
    </div>
  );
}
