'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/** Shared header: brand, About link, Log in / Sign up / Launch App. */
export default function SiteNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav className="bm-nav" aria-label="Main">
      <div className="bm-nav-left">
        <Link href="/" className="bm-nav-brand">
          <span className="bm-logo" aria-hidden>🍌</span>
          <span>Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </Link>
        <Link href="/about" className="bm-nav-link" aria-current={pathname === '/about' ? 'page' : undefined}>
          About
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
