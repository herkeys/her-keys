/**
 * HK-FE-UI-02 — rendered-contrast audit.
 *
 * Walks a react-test-renderer tree and, for every Text (and every Ionicons glyph), measures the foreground colour against the
 * background colour that actually sits behind it in THAT render (the nearest ancestor host node with an opaque backgroundColor,
 * else the app background). This catches what a token matrix cannot: a legal token used on an illegal surface.
 *
 * It is opt-in (HK_UI_CONTRAST_AUDIT=<dir>): `tests/support/render.tsx` calls it after every render and each test process
 * writes `<dir>/<pid>.json`. `scripts-dev/ui02-contrast-audit.mjs` runs the whole suite that way and aggregates the findings.
 *
 * Honest limits: it sees the initial render of each test, not later states; translucent backgrounds (rgba) are skipped and
 * counted; disabled controls are exempt (their text is the documented disabled pair); text with no explicit colour is assumed to
 * be a native default and skipped.
 */
import { StyleSheet } from 'react-native';
import { color } from '../../src/design/tokens';

const HEX = /^#([0-9a-f]{6})$/i;

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

export interface Finding {
  kind: 'text' | 'icon';
  fg: string;
  bg: string;
  ratio: number;
  floor: number;
  sample: string;
  fontSize?: number;
}

export interface AuditResult {
  findings: Finding[];
  measured: number;
  skippedTranslucent: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const flat = (node: Node): Record<string, unknown> => {
  const style = typeof node.props?.style === 'function' ? node.props.style({ pressed: false }) : node.props?.style;
  return (StyleSheet.flatten(style) as Record<string, unknown>) ?? {};
};

function textOf(node: Node): string {
  const children = node.props?.children;
  const walk = (c: unknown): string =>
    Array.isArray(c) ? c.map(walk).join('') : c === null || c === undefined || typeof c === 'boolean' ? '' : String(c);
  return walk(children).replace(/\s+/g, ' ').trim().slice(0, 48);
}

function backgroundBehind(node: Node): { bg: string | null; translucent: boolean } {
  for (let up = node.parent; up; up = up.parent) {
    if (typeof up.type !== 'string') continue;
    const bg = flat(up).backgroundColor;
    if (typeof bg !== 'string' || bg === 'transparent') continue;
    if (HEX.test(bg)) return { bg, translucent: false };
    return { bg: null, translucent: true };
  }
  return { bg: color.background, translucent: false };
}

const DISABLED_TEXT = color.action.disabledText.toLowerCase();

export function auditContrast(root: Node): AuditResult {
  const findings: Finding[] = [];
  let measured = 0;
  let skippedTranslucent = 0;

  const hosts = root.findAll((n: Node) => typeof n.type === 'string' && (n.type === 'Text' || n.type === 'Ionicons'));
  for (const node of hosts) {
    const isIcon = node.type === 'Ionicons';
    const fg = isIcon ? node.props.color : flat(node).color;
    if (typeof fg !== 'string' || !HEX.test(fg)) continue;
    if (fg.toLowerCase() === DISABLED_TEXT) continue;
    const behind = backgroundBehind(node);
    if (behind.translucent) { skippedTranslucent += 1; continue; }
    if (!behind.bg) continue;
    measured += 1;
    const style = flat(node);
    const fontSize = isIcon ? Number(node.props.size ?? 0) : Number(style.fontSize ?? 15);
    const weight = String(style.fontWeight ?? '400');
    const large = !isIcon && (fontSize >= 24 || (fontSize >= 18.66 && Number(weight) >= 700));
    const floor = isIcon ? 3 : large ? 3 : 4.5;
    const ratio = contrastRatio(fg, behind.bg);
    if (ratio < floor) {
      findings.push({ kind: isIcon ? 'icon' : 'text', fg, bg: behind.bg, ratio: Math.round(ratio * 100) / 100, floor, sample: isIcon ? String(node.props.name) : textOf(node), fontSize });
    }
  }
  return { findings, measured, skippedTranslucent };
}
