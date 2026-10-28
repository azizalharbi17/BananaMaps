import Link from 'next/link';
import Wordmark from './Wordmark';

/** Shared footer (server-safe: no hooks). */
export default function SiteFooter() {
  return (
    <footer className="bm-footer">
      <div className="bm-footer-inner">
        <div className="bm-footer-brand">
          <span className="bm-footer-mark" aria-hidden>🍌</span>
          <Wordmark suffix="Maps" className="bm-footer-wordmark" />
          <span className="bm-footer-tag">— a <Wordmark suffix="Zone" /> product</span>
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
        <nav className="bm-footer-more" aria-label="More from BananaZone">
          <span className="bm-footer-more-label">More from <Wordmark suffix="Zone" />:</span>
          <a href="https://bananaflip.io" target="_blank" rel="noopener noreferrer"><Wordmark suffix="Flip" /></a>
          <span className="bm-footer-sep" aria-hidden>·</span>
          <a href="https://bananascreener.io" target="_blank" rel="noopener noreferrer"><Wordmark suffix="Screener" /></a>
        </nav>
        <p className="bm-footer-note">
          On-chain data for informational purposes only — not financial advice. Always do your own research.
        </p>
      </div>
    </footer>
  );
}
