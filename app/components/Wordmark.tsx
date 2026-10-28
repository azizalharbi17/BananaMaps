/**
 * Brand wordmark: "Banana" in white, the suffix in gold — the same treatment as
 * the BananaMaps logo (BananaMaps, BananaZone, BananaFlip, BananaScreener).
 * Server-safe: no hooks, so it can be used from server and client components.
 */
export default function Wordmark({ suffix, className, title }: { suffix: string; className?: string; title?: string }) {
  return (
    <span className={className ? `bm-wordmark ${className}` : 'bm-wordmark'} title={title}>
      <span style={{ color: 'var(--text)' }}>Banana</span>
      <span style={{ color: 'var(--banana)' }}>{suffix}</span>
    </span>
  );
}
