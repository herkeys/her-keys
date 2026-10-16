/**
 * The single source of truth for HK-FE-UI-02 allowed text × surface pairings.
 *
 * Shared by tests/design-system/contrast.test.mjs (the CI gate) and scripts-dev/gen-contrast-matrix.mjs (the human doc), so the
 * two can never disagree. Anything absent from INTENT is NOT an allowed pairing: adding one means adding it here.
 *
 * Every pairing is held to the NORMAL-TEXT floor (4.5:1). HK-FE-UI-01's test computed its floor in a way that silently
 * degraded every pairing to the 3:1 large-text floor; that looseness is removed here — no pairing is exempt.
 */
import { color } from '../../src/design/tokens.ts';

function lum(hex) {
  const h = hex.replace('#', '');
  const ch = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

export function ratio(fg, bg) {
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

export const NORMAL_TEXT_FLOOR = 4.5;
export const BOUNDARY_FLOOR = 3;

export const SURFACES = {
  background: color.background,
  'surface.primary': color.surface.primary,
  'surface.secondary': color.surface.secondary,
  'surface.elevated': color.surface.elevated,
  'surface.tint': color.surface.tint,
  'action.primarySoft': color.action.primarySoft,
  'action.primary': color.action.primary,
  'action.primaryPressed': color.action.primaryPressed,
  'status.attentionSoft': color.status.attentionSoft,
  'status.riskSoft': color.status.riskSoft,
  'status.successSoft': color.status.successSoft,
  'status.waitingSoft': color.status.waitingSoft,
  'status.infoSoft': color.status.infoSoft,
  'ai.insightSoft': color.ai.insightSoft,
  'ai.inferenceSoft': color.ai.inferenceSoft,
  'ai.confirmationSoft': color.ai.confirmationSoft,
  'ai.actionSoft': color.ai.actionSoft,
  'action.disabled': color.action.disabled,
  'luxury.black': color.luxury.black,
};

export const TEXT = {
  'text.primary': color.text.primary,
  'text.secondary': color.text.secondary,
  'text.muted': color.text.muted,
  'text.inverse': color.text.inverse,
  'action.primary': color.action.primary,
  'action.onSoft': color.action.onSoft,
  'action.disabledText': color.action.disabledText,
  'status.attention': color.status.attention,
  'status.risk': color.status.risk,
  'status.success': color.status.success,
  'status.waiting': color.status.waiting,
  'status.info': color.status.info,
  'ai.insight': color.ai.insight,
  'ai.inference': color.ai.inference,
  'ai.confirmation': color.ai.confirmation,
  'ai.action': color.ai.action,
  'neutral.deep': color.neutral.deep,
  'luxury.glyph': color.luxury.glyph,
};

const LIGHT_SURFACES = ['background', 'surface.primary', 'surface.secondary', 'surface.elevated', 'surface.tint'];

export const INTENT = {
  'text.primary': [...LIGHT_SURFACES, 'status.infoSoft', 'ai.insightSoft'],
  'text.secondary': LIGHT_SURFACES,
  'text.muted': [
    ...LIGHT_SURFACES,
    'status.attentionSoft', 'status.successSoft', 'status.waitingSoft', 'status.infoSoft',
    'ai.insightSoft', 'ai.confirmationSoft', 'ai.actionSoft',
  ],
  // Berry text is legal on light surfaces and the wash — NOT on Soft Lilac (4.16:1). On lilac use action.onSoft / text.primary.
  'action.primary': ['background', 'surface.primary', 'surface.secondary', 'surface.elevated', 'ai.actionSoft'],
  'action.onSoft': [...LIGHT_SURFACES, 'action.primarySoft'],
  'action.disabledText': ['action.disabled'],
  'status.attention': ['background', 'surface.primary', 'surface.secondary', 'status.attentionSoft'],
  'status.risk': ['background', 'surface.primary', 'surface.secondary', 'status.riskSoft'],
  'status.success': ['background', 'surface.primary', 'surface.secondary', 'status.successSoft'],
  'status.waiting': ['background', 'surface.primary', 'surface.secondary', 'status.waitingSoft'],
  'status.info': ['background', 'surface.primary', 'status.infoSoft'],
  'ai.insight': ['background', 'surface.primary', 'ai.insightSoft'],
  'ai.inference': ['background', 'surface.primary', 'ai.inferenceSoft'],
  'ai.confirmation': ['background', 'surface.primary', 'ai.confirmationSoft'],
  'ai.action': ['background', 'surface.primary', 'ai.actionSoft'],
  'neutral.deep': ['background', 'surface.primary', 'ai.insightSoft'],
  'text.inverse': ['action.primary', 'action.primaryPressed'],
  'luxury.glyph': ['luxury.black'],
};

/** Component-identifying boundary × adjacent surfaces (WCAG 1.4.11, 3:1). */
export const BOUNDARIES = {
  'border.control': {
    value: color.border.control,
    against: ['background', 'surface.primary', 'surface.tint'],
  },
};
