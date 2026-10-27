import Link from 'next/link';

/** Shared footer (server-safe: no hooks). */
export default function SiteFooter() {
  return (
    <footer className="bm-footer">
      <div className="bm-footer-inner">
        <div className="bm-footer-brand">
          <span aria-hidden>🍌</span> Banana<span style={{ color: 'var(--banana)' }}>Maps</span>
          <span className="bm-footer-copy">© 2026</span>
        </div>
        <nav className="bm-footer-links" aria-label="Footer">
          <Link href="/about">About</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/app">Launch App</Link>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </nav>
        <p className="bm-footer-note">
          On-chain data for informational purposes only — not financial advice. Always do your own research.
        </p>
      </div>
    </footer>
  );
}
