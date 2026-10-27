'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/developers', label: 'Overview' },
  { href: '/developers/docs', label: 'API docs' },
  { href: '/developers/embed', label: 'BananaMaps Embed' },
  { href: '/developers/dashboard', label: 'Dashboard' },
];

/** Portal tabs under the site header. */
export default function DevSubnav() {
  const pathname = usePathname() || '';
  return (
    <div className="dev-subnav">
      <nav className="dev-subnav-inner" aria-label="Developer portal">
        <span className="dev-subnav-label">Developers</span>
        {TABS.map(t => {
          const active = t.href === '/developers' ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}>{t.label}</Link>
          );
        })}
      </nav>
    </div>
  );
}
