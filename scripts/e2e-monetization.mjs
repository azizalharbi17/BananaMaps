#!/usr/bin/env node
// End-to-end check of the monetization flow against a running app (default
// http://localhost:3000) in Stripe TEST mode. Creates a throwaway confirmed
// user through the Supabase admin API, exercises the dashboard API and the
// public API, pushes the account to its quota, and then (interactively) walks
// through upgrade and cancel:
//
//   node scripts/e2e-monetization.mjs                # steps 1-6: signup → key → calls → quota → 429
//   node scripts/e2e-monetization.mjs --checkout     # also prints a Checkout URL to complete in a browser
//   node scripts/e2e-monetization.mjs --after-upgrade <email>   # verify the higher quota, then cancel → downgrade
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// STRIPE_SECRET_KEY (for --after-upgrade), BASE (optional). Reads .env.local when present.
import fs from 'node:fs';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SB || !SRK || !ANON) { console.error('Supabase env missing'); process.exit(1); }
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const optAfter = args.indexOf('--after-upgrade') >= 0 ? args[args.indexOf('--after-upgrade') + 1] : null;

const admin = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };
// Each run looks like a different visitor to the per-IP signup cap (3/day) when talking to a local server.
const RUN_IP = /localhost|127\.0\.0\.1/.test(BASE) ? `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` : null;
const PEPE = '0x6982508145454ce325ddbe47a25d4ec3d2311933';
let failures = 0;
const check = (cond, msg, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };

async function adminCreateUser(email, password) {
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { accepted_terms_at: new Date().toISOString() } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`admin create user: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function signIn(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`sign in: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
async function findUser(email) {
  const r = await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: admin });
  const j = await r.json();
  return (j.users || []).find(u => u.email === email) || null;
}
const dev = (token, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(RUN_IP ? { 'x-forwarded-for': RUN_IP } : {}), ...(init.headers || {}) } });
const api = (key, path) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}` } });

async function setUsage(accountId, keyId, calls) {
  const period = new Date().toISOString().slice(0, 7);
  const r = await fetch(`${SB}/rest/v1/api_usage?on_conflict=key_id,period`, { method: 'POST', headers: { ...admin, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key_id: keyId, account_id: accountId, period, calls }) });
  if (!r.ok) throw new Error(`set usage: ${r.status} ${await r.text()}`);
}

async function main() {
  if (optAfter) return afterUpgrade(optAfter);
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@bananamaps-test.dev`;
  const password = `E2e-${stamp}-Pass!9`;
  console.log(`# user ${email}`);
  const user = await adminCreateUser(email, password);
  const token = await signIn(email, password);

  // 1. first dashboard visit creates the account + first key
  let r = await dev(token, '/api/dev/account');
  let j = await r.json();
  check(r.status === 200, 'GET /api/dev/account creates the account', `${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  check(typeof j.firstKey === 'string' && j.firstKey.startsWith('bm_live_'), 'first key issued once');
  check(j.account?.apiTier === 'free', 'tier is free');
  const key = j.firstKey, keyId = j.keys?.[0]?.id;

  // 2. public API works with the key
  r = await api(key, `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 200, 'GET /v1/holders 200', `${r.status} ${JSON.stringify(j).slice(0, 100)}`);
  check(Array.isArray(j.data?.holders) && j.data.holders.length > 0, 'holders returned', `${j.data?.holders?.length}`);
  check(r.headers.get('x-quota-limit') === '1000', 'X-Quota-Limit 1000', r.headers.get('x-quota-limit'));
  r = await api(key, `/v1/risk/eth/${PEPE}`); j = await r.json();
  check(r.status === 200 && typeof j.data?.risk?.score === 'number', 'GET /v1/risk 200 with score', `${r.status} ${j.data?.risk?.score}`);
  r = await api(key, `/v1/labels/eth/0x28c6c06298d514db089934071355e5743bf21d60`); j = await r.json();
  check(r.status === 200 && j.data?.labelType === 'cex', 'GET /v1/labels Binance → cex', JSON.stringify(j.data).slice(0, 80));
  r = await api(key, `/v1/graph/eth/${PEPE}`); j = await r.json();
  check(r.status === 200 && Array.isArray(j.data?.nodes), 'GET /v1/graph 200 with nodes', `${r.status} ${j.data?.nodes?.length} nodes`);
  r = await api(key, `/v1/holders/eth/0x0000000000000000000000000000000000000001`); j = await r.json();
  check(r.status === 404 && j.error?.code === 'not_indexed', 'unknown token → 404 not_indexed', `${r.status} ${j.error?.code}`);
  r = await api('bm_live_' + 'x'.repeat(32), `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 401 && j.error?.code === 'invalid_key', 'wrong key → 401 invalid_key', `${r.status} ${j.error?.code}`);
  r = await fetch(`${BASE}/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 401 && j.error?.code === 'unauthorized', 'no key → 401 unauthorized');
  r = await api(key, `/v1/holders/eth/nope`); j = await r.json();
  check(r.status === 400 && j.error?.code === 'bad_request', 'bad address → 400');

  // 3. quota: push usage to 999 → the next call is the 1000th (ok) → then 429
  await setUsage(user.id, keyId, 999);
  r = await api(key, `/v1/holders/eth/${PEPE}`);
  check(r.status === 200 && r.headers.get('x-quota-used') === '1000', '1000th call allowed', `${r.status} used=${r.headers.get('x-quota-used')}`);
  r = await api(key, `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 429 && j.error?.code === 'quota_exceeded', '1001st call → 429 quota_exceeded', `${r.status} ${j.error?.code}`);
  check(!!r.headers.get('retry-after'), 'Retry-After present on 429');
  r = await dev(token, '/api/dev/account'); j = await r.json();
  check(j.usage?.used === 1000 && j.usage?.quota === 1000, 'dashboard shows 1000/1000', JSON.stringify(j.usage));

  // 4. a second key shares the account quota
  r = await dev(token, '/api/dev/keys', { method: 'POST', body: JSON.stringify({ name: 'second' }) }); j = await r.json();
  check(r.status === 201 && j.key?.startsWith('bm_live_'), 'POST /api/dev/keys 201');
  const key2 = j.key, key2Id = j.row?.id;
  r = await api(key2, `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 429, 'second key is also at quota (account-level)', `${r.status}`);
  r = await dev(token, `/api/dev/keys/${key2Id}`, { method: 'DELETE' });
  check(r.status === 200, 'DELETE /api/dev/keys revokes');
  r = await api(key2, `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 401 && j.error?.code === 'revoked_key', 'revoked key → 401 revoked_key', `${r.status} ${j.error?.code}`);

  // 5. embed partner
  r = await dev(token, '/api/dev/embed', { method: 'POST', body: JSON.stringify({ name: 'Test site', domains: ['example.com'] }) }); j = await r.json();
  check(r.status === 201 && /^bme_/.test(j.partner?.pid || ''), 'POST /api/dev/embed 201', JSON.stringify(j).slice(0, 100));
  const pid = j.partner?.pid;
  r = await dev(token, `/api/dev/embed/${pid}`, { method: 'PATCH', body: JSON.stringify({ badge: false }) }); j = await r.json();
  check(r.status === 402, 'badge off on free plan → 402 plan_required', `${r.status} ${j.error?.code}`);

  // 6. checkout
  if (flag('checkout')) {
    r = await dev(token, '/api/billing/checkout', { method: 'POST', body: JSON.stringify({ product: 'api_starter', interval: 'month' }) }); j = await r.json();
    check(r.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(j.url || ''), 'POST /api/billing/checkout → Stripe URL', `${r.status} ${JSON.stringify(j).slice(0, 100)}`);
    console.log('\nCHECKOUT_URL=' + j.url);
    console.log(`Complete it with Stripe's test card, then run: node scripts/e2e-monetization.mjs --after-upgrade ${email}`);
    console.log(`E2E_EMAIL=${email}\nE2E_PASSWORD=${password}\nE2E_KEY=${key}`);
    fs.writeFileSync('.e2e-state.json', JSON.stringify({ email, password, key, keyId, userId: user.id, pid }));
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exitCode = failures ? 1 : 0;
}

async function afterUpgrade(email) {
  const st = JSON.parse(fs.readFileSync('.e2e-state.json', 'utf8'));
  if (st.email !== email) throw new Error('state file is for a different user');
  const token = await signIn(st.email, st.password);
  let r = await dev(token, '/api/dev/account'); let j = await r.json();
  check(j.account?.apiTier === 'starter', 'tier is starter after checkout', `${j.account?.apiTier} status=${j.account?.apiStatus}`);
  check(j.account?.hasCustomer === true, 'stripe customer linked');
  r = await api(st.key, `/v1/holders/eth/${PEPE}`);
  check(r.status === 200 && r.headers.get('x-quota-limit') === '50000', 'call allowed again with quota 50000', `${r.status} limit=${r.headers.get('x-quota-limit')}`);
  r = await dev(token, '/api/billing/portal', { method: 'POST' }); j = await r.json();
  check(r.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(j.url || ''), 'POST /api/billing/portal → portal URL', `${r.status}`);

  // cancel immediately through the API (the portal cancels at period end; this exercises the deleted webhook + downgrade)
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const subId = j.subscriptionId || (await (async () => { const a = await dev(token, '/api/dev/account'); const aj = await a.json(); return aj.account?.apiSubscriptionId; })());
  const customers = await stripe.customers.search({ query: `email:'${email}'`, limit: 1 });
  const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active', limit: 5 });
  check(subs.data.length >= 1, 'active subscription found in Stripe', String(subs.data.length));
  for (const s of subs.data) await stripe.subscriptions.cancel(s.id);
  let tier = 'starter';
  for (let i = 0; i < 20 && tier !== 'free'; i++) { await new Promise(res => setTimeout(res, 2000)); r = await dev(token, '/api/dev/account'); j = await r.json(); tier = j.account?.apiTier; }
  check(tier === 'free', 'tier back to free after cancel (webhook)', tier);
  r = await api(st.key, `/v1/holders/eth/${PEPE}`); j = await r.json();
  check(r.status === 429 && j.error?.code === 'quota_exceeded', 'free quota enforced again (429)', `${r.status} ${j.error?.code}`);
  void subId;
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
