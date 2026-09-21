/**
 * Her Keys design tokens — the permanent PAPER AND INK / NEXT CHAPTER system.
 *
 * Hierarchy is carried by CONTRAST, not by giving everything a border: the warm
 * ivory ground recedes, white surfaces lift, and only the thing that needs the
 * user gets a tinted, raised surface.
 *
 * PERSISTENCE RULE (HK-FE-UI-01 §7): everything in this file is
 * PRESENTATION-ONLY. No token may appear in persisted AppState, the v4
 * envelope, sync payload semantics, or cloud schema. Persistent state carries
 * product meaning; the presentation layer decides how that meaning looks.
 *
 * Every text/surface pairing below was measured against WCAG AA. The full
 * matrix lives in docs/design-system/contrast-matrix.md and is recomputed by
 * tests/design-system/contrast.test.mjs (both must stay green).
 */

// ---------------------------------------------------------------------------
// Color — semantic groups (canonical names)
// ---------------------------------------------------------------------------

const palette = {
  /** Warm ivory paper ground. */
  ivory: '#F7F5F1',
  /** Lifted white surface. */
  paper: '#FFFFFF',
  /** Quieter settled surface. */
  parchment: '#F0EBE2',

  /** Strong dark ink. */
  ink: '#1F1E1B',
  inkSoft: '#5F5C54',
  inkMuted: '#625C4E',
  inkInverse: '#FBF9F5',

  /** Restrained clay / terracotta accent — Her Keys' own voice. */
  clay: '#9C4A2F',
  claySoft: '#F3E2D7',
  clayBorder: '#C9B8A6',
  clayDisabled: '#D8CFC0',

  /** Deep plum — grounded neutral, used only where useful. */
  plum: '#4B3241',
  plumSoft: '#EFE7EC',
  plumBorder: '#D8CBD5',

  /** Something needs a decision. Deliberately not red. */
  amber: '#6E4C0E',
  amberSoft: '#F6EEDD',
  amberBorder: '#E8DCC0',

  /** Risk — grounded clay-red, clearly distinct from the clay accent. */
  risk: '#8A3B2C',
  riskSoft: '#F6E3DC',
  riskBorder: '#E7C9BF',

  /** Settled / resolved. Green-leaning neutral, clearly distinct from clay. */
  moss: '#33523F',
  mossSoft: '#E4EBE3',
  mossBorder: '#C7D6CB',

  /** Waiting / blocked on someone or something. */
  umber: '#6B5B3E',
  umberSoft: '#F1EBDD',
  umberBorder: '#E2D8C2',

  /** Identifying control boundary — ≥3:1 on both paper and ivory. */
  controlBorder: '#847B6C',

  /** Decorative hairlines (never the sole identifier of a control). */
  hairline: '#E6E0D5',
  hairlineSubtle: '#EFEAE0',

  /** Unfilled track for segment bars / progress. */
  track: '#E6E0D5',
} as const;

export const color = {
  background: palette.ivory,

  surface: {
    primary: palette.paper,
    secondary: palette.parchment,
    /** Elevated uses the same paper; lift comes from elevation, not a new tint. */
    elevated: palette.paper,
  },

  border: {
    default: palette.hairline,
    subtle: palette.hairlineSubtle,
    /** Use for control outlines — the only border that identifies a component. */
    control: palette.controlBorder,
  },

  text: {
    primary: palette.ink,
    secondary: palette.inkSoft,
    muted: palette.inkMuted,
    inverse: palette.inkInverse,
  },

  action: {
    primary: palette.clay,
    primarySoft: palette.claySoft,
    primaryBorder: palette.clayBorder,
    /** Disabled is exempt from WCAG but kept readable on purpose. */
    disabled: palette.clayDisabled,
    disabledText: palette.inkMuted,
  },

  status: {
    attention: palette.amber,
    attentionSoft: palette.amberSoft,
    attentionBorder: palette.amberBorder,
    risk: palette.risk,
    riskSoft: palette.riskSoft,
    riskBorder: palette.riskBorder,
    success: palette.moss,
    successSoft: palette.mossSoft,
    successBorder: palette.mossBorder,
    waiting: palette.umber,
    waitingSoft: palette.umberSoft,
    waitingBorder: palette.umberBorder,
  },

  /**
   * AI semantic treatments. Color never carries the meaning alone — every AI
   * pattern pairs its treatment with an explicit label (K3 mapping table).
   * Final pattern assignment happens with the intelligence presentation
   * system; these are the allowed color families.
   */
  ai: {
    insight: palette.plum,
    insightSoft: palette.plumSoft,
    insightBorder: palette.plumBorder,
    inference: palette.amber,
    inferenceSoft: palette.amberSoft,
    inferenceBorder: palette.amberBorder,
    confirmation: palette.moss,
    confirmationSoft: palette.mossSoft,
    confirmationBorder: palette.mossBorder,
    action: palette.clay,
    actionSoft: palette.claySoft,
    actionBorder: palette.clayBorder,
  },

  /** Deep plum grounded neutral, available where a screen needs one. */
  neutral: {
    deep: palette.plum,
    deepSoft: palette.plumSoft,
    deepBorder: palette.plumBorder,
  },

  track: palette.track,
} as const;

// ---------------------------------------------------------------------------
// Color — flat view (legacy consumer names; values now come from the palette)
// ---------------------------------------------------------------------------

export const colors = {
  background: color.background,
  surface: color.surface.primary,
  surfaceSubtle: color.surface.secondary,

  border: color.border.default,
  borderSubtle: color.border.subtle,

  textPrimary: color.text.primary,
  textSecondary: color.text.secondary,
  textTertiary: color.text.muted,
  textInverse: color.text.inverse,

  accent: color.action.primary,
  accentSoft: color.action.primarySoft,
  accentBorder: color.action.primaryBorder,

  attention: color.status.attention,
  attentionSoft: color.status.attentionSoft,
  attentionBorder: color.status.attentionBorder,

  risk: color.status.risk,
  riskSoft: color.status.riskSoft,
  riskBorder: color.status.riskBorder,

  success: color.status.success,
  successSoft: color.status.successSoft,
  successBorder: color.status.successBorder,

  waiting: color.status.waiting,
  waitingSoft: color.status.waitingSoft,
  waitingBorder: color.status.waitingBorder,

  controlBorder: color.border.control,
  track: color.track,
} as const;

// ---------------------------------------------------------------------------
// Spacing — preserved 1:1 from the pre-system scale
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Radius — preserved; used with restraint (never "rounded-everything")
// ---------------------------------------------------------------------------

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography — the one permanent hierarchy
//
// Canonical rungs: display, screenTitle, sectionTitle, cardTitle, body,
// supporting, metadata, label, actionLabel, statusLabel.
// bodyStrong is retained as a utility weight for inline emphasis.
// Legacy rung names (hero/headline/title/bodySm/caption/overline/micro) are
// aliases so surfaces frozen until their feature build keep compiling; new
// code uses the canonical names.
//
// System font only — a custom display face was evaluated and rejected (§4:
// loading/licensing complexity in Expo is not justified by the gain).
// ---------------------------------------------------------------------------

export const type = {
  display: { fontSize: 31, lineHeight: 37, fontWeight: '700', letterSpacing: -0.4 },
  screenTitle: { fontSize: 22, lineHeight: 29, fontWeight: '700', letterSpacing: -0.2 },
  sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  supporting: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  metadata: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Uppercase eyebrow label. Pair with .toUpperCase() at the call site. */
  label: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.9 },
  actionLabel: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  statusLabel: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
} as const;

export type TypeRung = keyof typeof type;

export const typography = {
  display: type.display,
  screenTitle: type.screenTitle,
  sectionTitle: type.sectionTitle,
  cardTitle: type.cardTitle,
  body: type.body,
  bodyStrong: type.bodyStrong,
  supporting: type.supporting,
  metadata: type.metadata,
  label: type.label,
  actionLabel: type.actionLabel,
  statusLabel: type.statusLabel,
  // Legacy aliases — frozen surfaces compile unchanged; migrate at their build.
  hero: type.display,
  headline: type.screenTitle,
  title: type.sectionTitle,
  bodySm: type.supporting,
  caption: type.metadata,
  overline: type.label,
  micro: type.statusLabel,
} as const;

// ---------------------------------------------------------------------------
// Elevation — one soft lift, reserved for the surface that should dominate
// ---------------------------------------------------------------------------

export const elevation = {
  raised: {
    shadowColor: '#2B2517',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

// ---------------------------------------------------------------------------
// Interaction states — canonicalized (previously ad-hoc opacity in components)
// ---------------------------------------------------------------------------

export const interaction = {
  /** Pressed feedback: quick opacity dip, never a color swap. */
  pressedOpacity: 0.75,
  /** Disabled is a real color pair (action.disabled/disabledText), not opacity. */
  disabled: {
    backgroundColor: color.action.disabled,
    textColor: color.action.disabledText,
  },
  /** Focus visibility for keyboard/switch navigation. */
  focusBorder: color.border.control,
} as const;

// ---------------------------------------------------------------------------
// Opacity states (non-text uses only: dividers, scrims, pressed surfaces)
// ---------------------------------------------------------------------------

export const opacity = {
  divider: 1,
  scrim: 0.45,
  pressedSurface: 0.75,
} as const;

// ---------------------------------------------------------------------------
// Motion — restrained; explains state changes, never decorates (§21)
// ---------------------------------------------------------------------------

export const motion = {
  /** Sheets, quick replies, selection. */
  quick: { duration: 120, easing: 'ease-out' },
  /** Default state change: loading→content, completion. */
  standard: { duration: 200, easing: 'ease-out' },
  /** Expanding "Why?", interpretation review. */
  deliberate: { duration: 320, easing: 'ease-out' },
} as const;

// ---------------------------------------------------------------------------
// Sizing — touch floors and icon rungs
// ---------------------------------------------------------------------------

export const sizing = {
  /** WCAG/target-platform minimum touch target. */
  minTouchTarget: 44,
  control: { height: 48, heightSmall: 44 },
  icon: { sm: 16, md: 20, lg: 24 },
  screenMargin: spacing.xl,
} as const;
