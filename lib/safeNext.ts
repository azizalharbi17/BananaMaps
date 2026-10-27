// Post-auth landing path validation. Prefix checks alone are not enough: the
// WHATWG URL parser strips ASCII tab/newline before parsing, so "/\t//evil.com"
// would pass a "starts with / but not //" test and still resolve off-site. The
// value is therefore resolved against our own origin and must stay on it.
export function safeNext(raw: string | null | undefined, origin: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \\]/.test(raw)) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  try {
    const base = new URL(origin);
    const u = new URL(raw, base);
    if (u.origin !== base.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
