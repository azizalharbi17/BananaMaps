'use client';
import { Fragment, useEffect, useState } from 'react';

export interface DocsNavItem {
  id: string;
  label: string;
  /** Group heading printed before the first item of each group. */
  group?: string;
}

/** Sticky section index for the docs; highlights the section in view. */
export default function DocsNav({ items }: { items: DocsNavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id || '');
  const ids = items.map(i => i.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = ids.split('|').map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
        else visible.delete(e.target.id);
      }
      if (visible.size) {
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
        setActive(top);
      }
    }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return (
    <nav className="dev-docs-nav" aria-label="On this page">
      {items.map((item, i) => {
        const showGroup = !!item.group && (i === 0 || items[i - 1].group !== item.group);
        return (
          <Fragment key={item.id}>
            {showGroup && <div className="dev-docs-nav-group">{item.group}</div>}
            <a href={`#${item.id}`} aria-current={active === item.id ? 'true' : undefined} onClick={() => setActive(item.id)}>
              {item.label}
            </a>
          </Fragment>
        );
      })}
    </nav>
  );
}
