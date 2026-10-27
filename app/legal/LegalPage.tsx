// DRAFT — generated, not reviewed by a lawyer; review before launch.
//
// Shared layout for the legal pages (/terms, /privacy, /refunds). Server-safe:
// no hooks, so each page can stay a server component with its own metadata.
// Pages pass numbered sections; this component renders the header, the
// cross-links between the three documents, a table of contents and the
// readable ~68ch column that the body text lives in.
import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteNav from '../components/SiteNav';
import SiteFooter from '../components/SiteFooter';

export const LEGAL_LAST_UPDATED = 'October 27, 2026';
export const SUPPORT_EMAIL = 'support@bananamaps.io';

export type LegalSlug = 'terms' | 'privacy' | 'refunds';

export const LEGAL_PAGES: { slug: LegalSlug; href: string; label: string }[] = [
  { slug: 'terms', href: '/terms', label: 'Terms of Service' },
  { slug: 'privacy', href: '/privacy', label: 'Privacy Policy' },
  { slug: 'refunds', href: '/refunds', label: 'Refunds & Cancellation' },
];

export interface LegalSection {
  /** Anchor id, e.g. "billing" → /terms#billing */
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  slug: LegalSlug;
  title: string;
  /** One sentence under the title (also a good metadata description). */
  summary: string;
  /** "Last updated" date as shown to readers. */
  lastUpdated?: string;
  /** Short plain-English note about when the document takes effect. */
  effectiveNote: string;
  /** Optional lead paragraphs / callout rendered before the table of contents. */
  intro?: ReactNode;
  sections: LegalSection[];
}

export default function LegalPage({
  slug,
  title,
  summary,
  lastUpdated = LEGAL_LAST_UPDATED,
  effectiveNote,
  intro,
  sections,
}: LegalPageProps) {
  return (
    <div className="bm-page">
      <div className="bm-grain" aria-hidden />
      <SiteNav />

      <main className="bm-main legal-main">
        <div className="legal-wrap">
          <header className="legal-head">
            <div className="legal-eyebrow">Legal</div>
            <h1 className="legal-title">{title}</h1>
            <p className="legal-summary">{summary}</p>
            <dl className="legal-meta">
              <div>
                <dt>Last updated:</dt> <dd>{lastUpdated}</dd>
              </div>
              <div>
                <dt>Effective:</dt> <dd>{effectiveNote}</dd>
              </div>
            </dl>
          </header>

          <nav className="legal-tabs" aria-label="Legal documents">
            {LEGAL_PAGES.map(p => (
              <Link key={p.slug} href={p.href} className="legal-tab" aria-current={p.slug === slug ? 'page' : undefined}>
                {p.label}
              </Link>
            ))}
          </nav>

          <article className="legal-body">
            {intro}

            <nav className="legal-toc" aria-label="Contents">
              <div className="legal-toc-label">Contents</div>
              <ol>
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>
                      <span className="legal-num">{String(i + 1).padStart(2, '0')}</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="legal-section" aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>
                  <span className="legal-num">{i + 1}.</span>
                  <span>{s.title}</span>
                </h2>
                {s.body}
              </section>
            ))}

            <div className="legal-contact">
              <div>
                <div className="legal-contact-title">Questions about this document?</div>
                <div className="legal-contact-sub">Write to us from the email on your account and we’ll get back to you.</div>
              </div>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="bm-btn bm-btn-surface legal-contact-btn">{SUPPORT_EMAIL}</a>
            </div>
          </article>
        </div>
      </main>

      <SiteFooter />

      <style>{`
        .legal-main { align-items: center; }
        .legal-wrap { width: 100%; max-width: 760px; padding: 48px 16px 72px; }
        .legal-eyebrow { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--banana); margin-bottom: 14px; }
        .legal-title { font-size: clamp(30px, 4.5vw, 44px); font-weight: 800; letter-spacing: -1.2px; line-height: 1.1; margin-bottom: 14px; overflow-wrap: anywhere; }
        .legal-summary { font-size: 16px; color: var(--text2); line-height: 1.65; max-width: 68ch; }
        .legal-meta { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 18px; font-family: 'DM Mono', monospace; font-size: 12px; color: var(--text3); line-height: 1.6; }
        .legal-meta dt, .legal-meta dd { display: inline; }
        .legal-meta dd { color: var(--text2); }
        .legal-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 28px 0 30px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
        .legal-tab {
          font-size: 13px; font-weight: 600; color: var(--text2); text-decoration: none; padding: 7px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--surface); transition: color 0.15s, border-color 0.15s; white-space: nowrap;
        }
        .legal-tab:hover { color: var(--text); border-color: var(--border2); }
        .legal-tab[aria-current="page"] { color: var(--banana); border-color: rgba(245,200,66,0.45); }

        .legal-body { max-width: 68ch; font-size: 15.5px; line-height: 1.72; color: var(--text2); overflow-wrap: anywhere; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body ul, .legal-body ol { margin: 0 0 14px; padding-left: 22px; }
        .legal-body li { margin-bottom: 7px; }
        .legal-body li::marker { color: var(--text3); }
        .legal-body strong { color: var(--text); font-weight: 600; }
        .legal-body a { color: var(--banana); text-decoration: none; border-bottom: 1px solid rgba(245,200,66,0.35); transition: border-color 0.15s; }
        .legal-body a:hover { border-bottom-color: var(--banana); }
        .legal-body code {
          font-family: 'DM Mono', monospace; font-size: 0.86em; background: var(--surface); border: 1px solid var(--border);
          border-radius: 5px; padding: 1px 6px; color: var(--text); white-space: nowrap;
        }
        .legal-body h3 { font-size: 15.5px; font-weight: 700; color: var(--text); margin: 20px 0 8px; }

        .legal-callout {
          background: rgba(245,200,66,0.06); border: 1px solid rgba(245,200,66,0.25); border-radius: 12px;
          padding: 14px 16px; margin: 0 0 16px; color: var(--text); font-size: 14.5px; line-height: 1.65;
        }
        .legal-callout p:last-child { margin-bottom: 0; }
        .legal-callout-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--banana); margin-bottom: 6px; }

        .legal-toc { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin: 20px 0 8px; }
        .legal-toc-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
        .legal-toc ol { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 18px; }
        .legal-toc li { margin: 0; font-size: 13px; line-height: 1.45; min-width: 0; }
        .legal-toc a { color: var(--text2); border: none; display: flex; gap: 9px; align-items: baseline; }
        .legal-toc a:hover { color: var(--banana); }
        .legal-toc .legal-num { font-size: 11px; }

        .legal-section { margin-top: 40px; scroll-margin-top: 24px; }
        .legal-section h2 {
          font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: var(--text); margin-bottom: 12px; line-height: 1.3;
          display: flex; gap: 10px; align-items: baseline;
        }
        .legal-num { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; color: var(--banana); flex-shrink: 0; }

        .legal-contact {
          margin-top: 48px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
          display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px 16px;
        }
        .legal-contact-title { font-weight: 700; color: var(--text); font-size: 15px; }
        .legal-contact-sub { font-size: 13px; color: var(--text3); margin-top: 3px; line-height: 1.5; }
        .legal-body a.legal-contact-btn { font-family: 'DM Mono', monospace; font-weight: 500; font-size: 12px; border-bottom: 1px solid var(--border2); color: var(--text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .legal-body a.legal-contact-btn:hover { color: var(--banana); border-color: var(--banana); }

        @media (max-width: 600px) {
          .legal-wrap { padding: 34px 16px 56px; }
          .legal-body { font-size: 15px; }
          .legal-toc ol { grid-template-columns: 1fr; }
          .legal-section { margin-top: 34px; }
          .legal-section h2 { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
