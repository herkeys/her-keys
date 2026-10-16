import { brandPalette, botanicalPalette, color as lightColor, elevation as lightElevation, flatColors, interaction as lightInteraction, type ColorTokens } from '../tokens';

/**
 * HK-FE-UI-02-DM — the two complete appearance configurations.
 *
 * ONE design system, TWO colour sets with an identical shape: every semantic token the approved Light theme defines has a Dark
 * counterpart under the same name, so a component never knows which scheme it is in — it reads `useTheme()`.
 *
 * LIGHT is the approved HK-FE-UI-02 palette, untouched: `lightColor` IS `color` from tokens.ts.
 *
 * DARK is "the same app in the evening", an adaptation of the brand rather than an inversion:
 *   - Midnight Plum `#211B25` is the ground (never pure black); cards sit one step up (`#302633`), sheets another (`#382C3B`), and
 *     selected/supporting surfaces another (`#403344`), so elevation stays legible without relying on shadows.
 *   - Text is warm ivory `#F7F1F6`, secondary light mauve `#D1C2D0`, muted `#B8A6B7`.
 *   - The Berry action is the LUMINOUS Berry `#CC84AC` (the owner's candidate `#BE729C` is 4.1:1 as text on a card, so it cannot
 *     serve the link/secondary-label role the same token has in Light; the tuned value clears 4.5:1 as text on every dark surface
 *     AND carries the dark-ink label on the filled button at 6:1). Not saturated magenta; the hue is Berry's.
 *   - The primary button's label is Midnight (`text.inverse`), not white: a bright Berry needs dark ink.
 *   - Functional colours (risk, success, warning, pending, info) are lighter, desaturated siblings of the Light set on deep tinted
 *     fills, each still paired with its icon/label (colour never carries state alone).
 *   - Luxury Black stays a small badge: a near-black disc lifted off the dark ground by a visible mauve-grey rim.
 *   - No new brand hue. Botanical sage stays the locked sage values (decorative layer only); no blue anywhere.
 *
 * Every pairing is measured for BOTH schemes in tests/design-system/contrast.test.mjs.
 */

export type Scheme = 'light' | 'dark';

export const darkColor: ColorTokens = {
  background: '#211B25',

  surface: {
    primary: '#302633',
    secondary: '#2A222E',
    elevated: '#382C3B',
    tint: '#403344',
  },

  border: {
    default: '#463A4A',
    subtle: '#3A2F3D',
    control: '#9C879C',
  },

  text: {
    primary: '#F7F1F6',
    secondary: '#D1C2D0',
    muted: '#B8A6B7',
    inverse: '#211B25',
  },

  action: {
    primary: '#CC84AC',
    primarySoft: '#403344',
    primaryBorder: '#6E5774',
    primaryPressed: '#DB9CBD',
    primaryHighlight: '#E6B2CD',
    onSoft: '#E8B3CF',
    disabled: '#3A2F3D',
    disabledText: '#AD9BAD',
  },

  status: {
    attention: '#E6C07F',
    attentionSoft: '#3A3022',
    attentionBorder: '#5C4B2E',
    risk: '#F0A698',
    riskSoft: '#3C2527',
    riskBorder: '#6A3F40',
    success: '#A8D1B0',
    successSoft: '#243229',
    successBorder: '#3F5A47',
    waiting: '#CDB8CC',
    waitingSoft: '#33293A',
    waitingBorder: '#54445C',
    info: '#F1E4EF',
    infoSoft: '#2E2533',
    infoBorder: '#51405A',
  },

  ai: {
    insight: '#EBDDE9',
    insightSoft: '#2B2230',
    insightBorder: '#7A6280',
    inference: '#E6C07F',
    inferenceSoft: '#3A3022',
    inferenceBorder: '#5C4B2E',
    confirmation: '#A8D1B0',
    confirmationSoft: '#243229',
    confirmationBorder: '#3F5A47',
    action: '#CC84AC',
    actionSoft: '#2B2230',
    actionBorder: '#7A6280',
  },

  neutral: {
    deep: '#F1E4EF',
    deepSoft: '#2B2230',
    deepBorder: '#51405A',
  },

  luxury: {
    black: '#161219',
    rim: '#6A5A6E',
    glint: '#9A889E',
    glyph: '#C7A6BB',
  },

  scrim: '#000000',

  botanical: botanicalPalette,

  track: '#4A3D4E',

  brand: brandPalette,
};

export interface ElevationTokens {
  raised: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
  button: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
}

export interface InteractionTokens {
  pressedOpacity: number;
  disabled: { backgroundColor: string; textColor: string };
  focusBorder: string;
}

/** On a dark ground a coloured, soft shadow is invisible: use a true-black one, a little stronger, and let surface steps do the lifting. */
const darkElevation: ElevationTokens = {
  raised: { shadowColor: '#000000', shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  button: { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
};

const interactionFor = (c: ColorTokens): InteractionTokens => ({
  pressedOpacity: lightInteraction.pressedOpacity,
  disabled: { backgroundColor: c.action.disabled, textColor: c.action.disabledText },
  focusBorder: c.border.control,
});

export interface Theme {
  scheme: Scheme;
  color: ColorTokens;
  /** The legacy flat colour view, derived from `color`. */
  colors: ReturnType<typeof flatColors>;
  elevation: ElevationTokens;
  interaction: InteractionTokens;
}

export const lightTheme: Theme = {
  scheme: 'light',
  color: lightColor,
  colors: flatColors(lightColor),
  elevation: lightElevation,
  interaction: interactionFor(lightColor),
};

export const darkTheme: Theme = {
  scheme: 'dark',
  color: darkColor,
  colors: flatColors(darkColor),
  elevation: darkElevation,
  interaction: interactionFor(darkColor),
};

export const themes: Readonly<Record<Scheme, Theme>> = { light: lightTheme, dark: darkTheme };
