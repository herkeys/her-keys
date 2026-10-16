/**
 * Her Keys design tokens — HK-FE-UI-02 "Dusty Mauve + Luxury Black — Airy Edition".
 *
 * This file SUPERSEDES the HK-FE-UI-01 Paper-and-Ink palette. What is preserved from HK-FE-UI-01: every canonical token NAME
 * (`color.*`, the legacy flat `colors.*`, `typography.*`, `spacing`, `radius`, `sizing`, `elevation`, `interaction`, `motion`),
 * the spacing scale, the 44 pt touch floor, the motion budget, and the rule that hierarchy is carried by CONTRAST. What is
 * replaced: the palette VALUES (clay/ivory/parchment/gold → the six owner-approved brand colours and documented derivations).
 *
 * Lightness is the primary objective. Luxury Black is an accent, never a surface: it appears only as fine premium detail.
 *
 * PERSISTENCE RULE (HK-FE-UI-01 §7, unchanged): everything in this file is PRESENTATION-ONLY. No token may appear in persisted
 * AppState, the v4 envelope, sync payload semantics, entitlement state, or cloud schema.
 *
 * Every text/surface pairing below was measured against WCAG AA. The full matrix lives in
 * docs/design-system/contrast-matrix.md and is recomputed by tests/design-system/contrast.test.mjs (both must stay green).
 *
 * Contract: docs/design-system/HK-FE-UI-02-spec.md.
 */

// ---------------------------------------------------------------------------
// Color — the six owner-approved BRAND colours. There is no seventh brand hue.
// ---------------------------------------------------------------------------

export const brandPalette = {
  /** Berry Plum — primary actions and emphasis. */
  berryPlum: '#A24E7A',
  /** Dusty Mauve — decorative accents and icon backgrounds. NEVER ordinary text on a light ground (2.08:1 on off-white). */
  dustyMauve: '#C7A6BB',
  /** Soft Lilac Gray — light surfaces and supporting cards. */
  softLilac: '#EADFEA',
  /** Warm Off-White — the application background. */
  warmOffWhite: '#FDF8F5',
  /** Deep Plum Gray — headlines, text, icons, navigation. The principal text anchor. */
  deepPlumGray: '#5A3A55',
  /** Luxury Black — select premium accents and subtle gloss details only. */
  luxuryBlack: '#1E1B1D',
} as const;

// ---------------------------------------------------------------------------
// Color — BOTANICAL LINEWORK (owner amendment, 2026-10-16)
//
// The owner expressly lifted the six-colour lock for ONE purpose: thin sage linework on the decorative botanical layer. These
// three tokens are NOT brand colours and may not be used for text, controls, cards, headers, navigation, status or fills —
// `tests/design-system/botanicalBoundary.test.mjs` fails if any file other than Botanical.tsx reads them. The owner supplied the names
// and opacities, not hex values; the hexes below are the design agent's choice (muted sage, hue ~135°, no blue) and are OPEN FOR OWNER
// CONFIRMATION (OD-UI02-05).
// ---------------------------------------------------------------------------

export const botanicalPalette = {
  /** Base stroke at 50% opacity, 1–1.5 pt. */
  sageOutline: '#7E9C86',
  /** Accent at leaf tips and stem nodes at 60% opacity, 1.5–2 pt. */
  sageTip: '#5F8A6B',
  /** Optional micro-wash at 20% opacity, never behind body text (not used by the current sprig). */
  sageWhisper: '#A8C3AE',
} as const;

// ---------------------------------------------------------------------------
// Color — DERIVED tokens. Each has one documented purpose (spec §4); none is a new brand hue.
// ---------------------------------------------------------------------------

const derived = {
  /** Lifted white card surface. Lift comes from elevation + a lilac hairline, not a new tint. */
  paper: '#FFFFFF',
  /** Quieter settled surface (a Soft Lilac Gray wash). Berry text is still ≥4.5:1 here (4.72). */
  lilacWash: '#F6EEF4',

  /** Berry pressed state and the Berry text that must sit on Soft Lilac (5.54:1; plain Berry is 4.16:1 there). */
  berryDeep: '#873F65',
  /** Opaque 1px top-edge highlight of the primary button (Berry blended 18% toward white). Opaque ⇒ reduced-transparency safe. */
  berryHighlight: '#B36E92',

  /** Secondary text (6.97:1 on off-white, 5.68:1 on Soft Lilac). */
  plumSoft: '#6A4D64',
  /** Metadata / placeholder text (6.20:1 on off-white, 5.06:1 on Soft Lilac). Never paler. */
  plumMuted: '#6F5669',
  /** Text on Berry fills. 5.37:1. */
  inverse: '#FFFFFF',

  /** Identifying control boundary — ≥3:1 on white, off-white and Soft Lilac (4.00). */
  controlBorder: '#86627D',
  /** Decorative hairlines (never the sole identifier of a control). */
  hairline: '#E9DCE6',
  hairlineSubtle: '#F1E7EE',
  /** Unfilled track for segment bars / progress. */
  track: '#E6D8E2',

  /** Disabled is a real, readable pair (text 4.83:1) — not lowered opacity. */
  disabledFill: '#E6DAE3',

  /** Luxury Black micro-details: a lighter rim and a glint so the accent reads as polished, not as a hole. */
  blackRim: '#3A3538',
  blackGlint: '#6B6268',

  /** Information — Deep Plum Gray with an information icon. */
  infoSoft: '#F6EEF4',
  infoBorder: '#E0D0DB',

  /** Decision needed — dark warm amber (functional, not brand). */
  amber: '#6E4C0E',
  amberSoft: '#F8EFDD',
  amberBorder: '#E9DAB8',

  /** Risk — deep warm crimson (functional, not brand). */
  risk: '#8A3B2C',
  riskSoft: '#F9E8E4',
  riskBorder: '#EBCBC4',

  /** Settled / resolved — dark muted moss (functional, not brand). */
  moss: '#33523F',
  mossSoft: '#E7EEE6',
  mossBorder: '#C9D8CC',

  /** Pending / waiting — neutral plum-gray with an explicit waiting label. */
  pending: '#66516A',
  pendingSoft: '#EFE8EE',
  pendingBorder: '#DDD0DB',

  /** Scrim: plum-black, never pure black. Used at `opacity.scrim`. */
  scrim: '#2A1A27',
} as const;

export const color = {
  background: brandPalette.warmOffWhite,

  surface: {
    primary: derived.paper,
    secondary: derived.lilacWash,
    /** Elevated uses the same paper; lift comes from elevation, not a new tint. */
    elevated: derived.paper,
    /** Soft Lilac Gray — selected rows, icon wells, supporting cards. */
    tint: brandPalette.softLilac,
  },

  border: {
    default: derived.hairline,
    subtle: derived.hairlineSubtle,
    /** Use for control outlines — the only border that identifies a component. */
    control: derived.controlBorder,
  },

  text: {
    primary: brandPalette.deepPlumGray,
    secondary: derived.plumSoft,
    muted: derived.plumMuted,
    inverse: derived.inverse,
  },

  action: {
    primary: brandPalette.berryPlum,
    /** Soft Lilac Gray fill. Small text on it must be `onSoft` or `text.primary` — never `primary`. */
    primarySoft: brandPalette.softLilac,
    /** Dusty Mauve edge — decorative boundary; the label is what identifies the control. */
    primaryBorder: brandPalette.dustyMauve,
    primaryPressed: derived.berryDeep,
    primaryHighlight: derived.berryHighlight,
    /** Berry-family text that is legal on Soft Lilac (5.54:1). */
    onSoft: derived.berryDeep,
    /** Disabled is exempt from WCAG but kept readable on purpose. */
    disabled: derived.disabledFill,
    disabledText: derived.plumMuted,
  },

  status: {
    attention: derived.amber,
    attentionSoft: derived.amberSoft,
    attentionBorder: derived.amberBorder,
    risk: derived.risk,
    riskSoft: derived.riskSoft,
    riskBorder: derived.riskBorder,
    success: derived.moss,
    successSoft: derived.mossSoft,
    successBorder: derived.mossBorder,
    waiting: derived.pending,
    waitingSoft: derived.pendingSoft,
    waitingBorder: derived.pendingBorder,
    /** Information: Deep Plum Gray + an information icon. */
    info: brandPalette.deepPlumGray,
    infoSoft: derived.infoSoft,
    infoBorder: derived.infoBorder,
  },

  /**
   * AI semantic treatments. HK-FE-UI-02 §6: plum is now a general brand colour, so COLOUR NO LONGER IDENTIFIES AI. Every AI
   * pattern is identified by an explicit label, a structural component shape and an icon (see intelligence.tsx);
   * these are only the allowed colour families for those structures.
   */
  ai: {
    insight: brandPalette.deepPlumGray,
    insightSoft: derived.lilacWash,
    insightBorder: brandPalette.dustyMauve,
    inference: derived.amber,
    inferenceSoft: derived.amberSoft,
    inferenceBorder: derived.amberBorder,
    confirmation: derived.moss,
    confirmationSoft: derived.mossSoft,
    confirmationBorder: derived.mossBorder,
    action: brandPalette.berryPlum,
    actionSoft: derived.lilacWash,
    actionBorder: brandPalette.dustyMauve,
  },

  /** Deep Plum Gray grounded neutral, available where a screen needs one. */
  neutral: {
    deep: brandPalette.deepPlumGray,
    deepSoft: derived.lilacWash,
    deepBorder: derived.infoBorder,
  },

  /**
   * Luxury Black — fine premium detail only (key/sparkle badges, small selected accents, discreet edges). Never a screen or a
   * large block; never more than a small part of a control.
   */
  luxury: {
    black: brandPalette.luxuryBlack,
    rim: derived.blackRim,
    glint: derived.blackGlint,
    /** The glyph colour on a black badge. 13.21:1 on Soft Lilac / 7.81:1 Dusty Mauve on black. */
    glyph: brandPalette.dustyMauve,
  },

  /** Scrim colour for sheets/modals (applied at `opacity.scrim`). */
  scrim: derived.scrim,

  /** Decorative sage linework — Botanical.tsx ONLY (see botanicalPalette). */
  botanical: botanicalPalette,

  track: derived.track,

  /** The six brand colours, by name, for decoration and documentation. */
  brand: brandPalette,
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
// Radius — preserved; pills for actions, soft 20 for cards
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
// System font only. HK-FE-UI-02 re-evaluated a custom display serif: no licensed, Expo-bundled face is approved, and a font
// asset needs separate owner approval (spec §10). The airy register comes from lighter weights (600), generous line heights
// and Deep Plum Gray — not from a new typeface. Sizes and line heights are UNCHANGED from HK-FE-UI-01 so no screen reflows.
// ---------------------------------------------------------------------------

export const type = {
  display: { fontSize: 31, lineHeight: 37, fontWeight: '600', letterSpacing: -0.3 },
  screenTitle: { fontSize: 22, lineHeight: 29, fontWeight: '600', letterSpacing: -0.15 },
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
// Elevation — one soft lift for the dominant surface, one small lift for the primary button
// ---------------------------------------------------------------------------

export const elevation = {
  raised: {
    shadowColor: brandPalette.deepPlumGray,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /** The primary button's controlled lift (Berry-tinted so it reads as glow, not as a black drop shadow). */
  button: {
    shadowColor: derived.berryDeep,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;

// ---------------------------------------------------------------------------
// Interaction states — canonicalized
// ---------------------------------------------------------------------------

export const interaction = {
  /** Pressed feedback for non-filled controls: quick opacity dip. Filled Berry buttons swap to `action.primaryPressed`. */
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
  /** Botanical / ornamental line work: faint and secondary (spec §8). */
  decoration: 0.4,
} as const;

/** Sage botanical linework (owner amendment): outline 50%, tip 60%, whisper 20%; 30% when reduced-motion / high-contrast is on. */
export const botanicalOpacity = { outline: 0.5, tip: 0.6, whisper: 0.2, reduced: 0.3 } as const;

/** Stroke weights in dp: outline 1–1.5, tip 1.5–2 (rendered as a dot of this diameter plus 1.5). */
export const botanicalStroke = { outline: 1.25, tip: 2, node: 1.5 } as const;

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
  /** Icon wells and brand badges. */
  badge: { sm: 40, md: 56, lg: 72 },
  screenMargin: spacing.xl,
  /** Maximum content measure on wide layouts (tablets, foldables). */
  contentWidth: 680,
} as const;

// ---------------------------------------------------------------------------
// Responsive decoration budget (spec §9) — decorations yield to function
// ---------------------------------------------------------------------------

export const decorationBudget = {
  /** Below this window width (dp), botanicals/waves are suppressed entirely. */
  minWidth: 360,
  /** Above this font scale, decorations disappear instead of pushing content off screen. */
  maxFontScale: 1.3,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `#RRGGBB` + alpha → `rgba(...)`. For the few genuinely translucent layers (scrims); every other token is opaque. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
