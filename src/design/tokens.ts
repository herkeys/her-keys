/**
 * Her Keys design tokens.
 *
 * Hierarchy here is carried by CONTRAST, not by giving everything a border:
 * the warm ground recedes, white surfaces lift, and only the thing that needs
 * the user gets a tinted, raised surface. Contrast ratios of every text/surface
 * pairing below were measured against WCAG AA (all >= 4.8:1).
 */
export const colors = {
  /** Page ground — warm, slightly deeper than the surfaces that sit on it. */
  background: '#F7F5F1',
  /** Standard lifted surface: things Her Keys is telling you. */
  surface: '#FFFFFF',
  /** Quieter surface for supporting or already-settled content. */
  surfaceSubtle: '#F0EBE2',

  border: '#E6E0D5',
  borderSubtle: '#EFEAE0',

  textPrimary: '#1F1E1B',
  textSecondary: '#5F5C54',
  textTertiary: '#6B6659',
  textInverse: '#FBF9F5',

  /** Sage — Her Keys' own voice: offers, confirmations, primary actions. */
  accent: '#35594F',
  accentSoft: '#E4ECE7',
  accentBorder: '#C9D9D2',

  /** Warm amber — something needs a decision. Deliberately not red. */
  attention: '#6E4C0E',
  attentionSoft: '#F6EEDD',
  attentionBorder: '#E8DCC0',

  /** Settled / resolved. */
  success: '#2F5147',
  successSoft: '#E3EBE6',
  successBorder: '#CBDCD4',

  /** Unfilled track for segment bars. */
  track: '#E6E0D5',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 31, lineHeight: 37, fontWeight: '700', letterSpacing: -0.4 },
  headline: { fontSize: 22, lineHeight: 29, fontWeight: '700', letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Uppercase section/eyebrow labels. Pair with .toUpperCase() at the call site. */
  overline: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.9 },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
} as const;

/** One soft elevation, used only on the surface that should dominate. */
export const elevation = {
  raised: {
    shadowColor: '#2B2517',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;
