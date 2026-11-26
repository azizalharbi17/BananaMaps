// Theme B "Studio": flat, professional, one accent. Single source of truth for
// the inline-styled screens (app/app/*, the OG card) — the same values live as
// CSS custom properties in app/globals.css for class-based chrome. Keep both in
// sync when a token changes.
//
// Rules of the theme:
//   • Yellow (accent) is reserved for the wordmark suffix, the primary button,
//     the active/selected state and the focus ring. Never as a text tint or a
//     surface wash.
//   • Surfaces are flat: no gradients, no blur, no glow shadows. Borders carry
//     the structure.
//   • Motion is functional only (spinners, focus transitions ≤150ms). No
//     decorative animation.
export const THEME = {
  /** Page background. */
  bg: '#0F1115',
  /** Panels, bars, cards, popups. */
  surface: '#13161C',
  /** Hovered / selected rows, inset wells. */
  surface2: '#1A1E27',
  /** Pressed / active segment background. */
  surface3: '#23272F',
  /** Darker inset (code blocks, inputs on a surface). */
  well: '#0B0D11',
  /** Default 1px border. */
  border: '#23272F',
  /** Border for interactive controls and popups. */
  borderStrong: '#2B3039',
  /** Row dividers inside lists. */
  divider: '#1C2027',
  /** Primary text. */
  text: '#F2F4F7',
  /** Secondary text, labels. */
  text2: '#9096A3',
  /** Tertiary text, placeholders, disabled. */
  text3: '#5F6672',
  /** Brand accent. */
  accent: '#F5C842',
  /** Text on the accent. */
  accentInk: '#141413',
  /** Positive change. */
  up: '#3CB371',
  /** Negative change / errors. */
  down: '#E5484D',
  /** Medium-risk / caution. */
  warn: '#E3B341',
  /** Map canvas: flat navy, a shade deeper at the edges. */
  mapBg: '#070A12',
  mapBgCenter: '#0C1222',
  fontSans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontMono: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  /** Corner radii: controls 7, cards and popups 10. */
  radiusControl: 7,
  radiusCard: 10,
  /** Popup / menu elevation — the only shadow in the theme. */
  shadowPopup: '0 10px 30px rgba(0,0,0,0.45)',
} as const;

/** Entity-type tints for CEX / DEX / burn / contract markers (muted, legible on #13161C). */
export const TYPE_COLORS = {
  cex: '#7D8EE8',
  dex: '#A98BE8',
  burn: '#E8716A',
  contract: '#9096A3',
} as const;

/** Risk score bands. */
export const RISK_COLORS = {
  low: THEME.up,
  medium: THEME.warn,
  high: '#E8763B',
  veryHigh: THEME.down,
  none: THEME.text3,
} as const;

/** Chain brand colors (unchanged by the theme — they identify the chain). */
export const CHAIN_COLORS: Record<string, string> = {
  eth: '#627EEA',
  bsc: '#F3BA2F',
  sol: '#9945FF',
  base: '#0052FF',
  robinhood: '#00C805',
};

/**
 * Chain colors for TEXT. Dots keep the brand hue (CHAIN_COLORS); the two hues
 * that fail 4.5:1 on the surface at 12px (Base 3.15:1, Solana 4.0:1) are
 * lightened here so chain-tinted labels stay AA-legible.
 */
export const CHAIN_TEXT_COLORS: Record<string, string> = {
  ...CHAIN_COLORS,
  sol: '#B47CFF',
  base: '#6E9BFF',
};

/** "#RRGGBB" + alpha → "#RRGGBBAA". */
export function hexA(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return hex + a;
}
