'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Wordmark from './Wordmark';

/** Shared header: brand, About / Developers links, Log in / Sign up / Launch App. */
export default function SiteNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav className="bm-nav" aria-label="Main">
      {/* Phone-width tweaks for the second nav link: tighter links under 480px,
          and under 430px the brand shows the mark only (the wordmark would push
          "Developers" under the Launch App button). Hoisted to <head> by React. */}
      <style href="bm-nav-phone" precedence="default">{`
        @media (max-width: 480px) {
          .bm-nav-left { gap: 2px; }
          .bm-nav-link { padding: 7px 7px; font-size: 12px; }
          .bm-nav-brand { font-size: 17px; gap: 6px; }
          .bm-nav-brand .bm-logo { font-size: 20px; }
        }
        @media (max-width: 430px) {
          .bm-nav-wordmark { display: none; }
          .bm-nav-brand .bm-logo { font-size: 24px; }
        }
      `}</style>
      <div className="bm-nav-left">
        <Link href="/" className="bm-nav-brand" aria-label="BananaMaps home">
          <span className="bm-logo" aria-hidden>🍌</span>
          <Wordmark suffix="Maps" className="bm-nav-wordmark" />
        </Link>
        <Link href="/about" className="bm-nav-link" aria-current={pathname === '/about' ? 'page' : undefined}>
          About
        </Link>
        <Link
          href="/developers"
          className="bm-nav-link"
          aria-current={pathname === '/developers' || pathname?.startsWith('/developers/') ? 'page' : undefined}
        >
          Developers
        </Link>
      </div>
      <div className="bm-nav-actions">
        <button type="button" className="bm-btn bm-btn-ghost nav-hide-mobile" onClick={() => router.push('/login')}>Log in</button>
        <button type="button" className="bm-btn bm-btn-primary nav-hide-mobile" onClick={() => router.push('/signup')}>Sign up</button>
        <Link href="/app" className="bm-btn bm-btn-surface">Launch App →</Link>
      </div>
    </nav>
  );
}
