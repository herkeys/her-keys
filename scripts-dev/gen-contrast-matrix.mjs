import { writeFileSync } from 'node:fs';
import { color, radius, type } from '../src/design/tokens.ts';
import { ratio } from '../tests/design-system/contrast.test.mjs';

const SURFACES = {
  background: color.background,
  'surface.primary': color.surface.primary,
  'surface.secondary': color.surface.secondary,
  'surface.elevated': color.surface.elevated,
  'action.primary': color.action.primary,
  'action.primarySoft': color.action.primarySoft,
  'status.attentionSoft': color.status.attentionSoft,
  'status.riskSoft': color.status.riskSoft,
  'status.successSoft': color.status.successSoft,
  'status.waitingSoft': color.status.waitingSoft,
  'ai.insightSoft': color.ai.insightSoft,
  'ai.inferenceSoft': color.ai.inferenceSoft,
  'ai.confirmationSoft': color.ai.confirmationSoft,
  'ai.actionSoft': color.ai.actionSoft,
};

const TEXT = {
  'text.primary': color.text.primary,
  'text.secondary': color.text.secondary,
  'text.muted': color.text.muted,
  'text.inverse': color.text.inverse,
  'action.primary': color.action.primary,
  'status.attention': color.status.attention,
  'status.risk': color.status.risk,
  'status.success': color.status.success,
  'status.waiting': color.status.waiting,
  'ai.insight': color.ai.insight,
  'ai.inference': color.ai.inference,
  'ai.confirmation': color.ai.confirmation,
  'ai.action': color.ai.action,
  'neutral.deep': color.neutral.deep,
};

const INTENT = {
  'text.primary': ['background', 'surface.primary', 'surface.secondary', 'surface.elevated'],
  'text.secondary': ['background', 'surface.primary', 'surface.secondary', 'surface.elevated'],
  'text.muted': [
    'background', 'surface.primary', 'surface.secondary',
    'action.primarySoft', 'status.attentionSoft', 'status.successSoft', 'status.waitingSoft',
    'ai.insightSoft', 'ai.confirmationSoft', 'ai.actionSoft',
  ],
  'action.primary': ['background', 'surface.primary', 'surface.secondary', 'action.primarySoft'],
  'status.attention': ['background', 'surface.primary', 'surface.secondary', 'status.attentionSoft'],
  'status.risk': ['background', 'surface.primary', 'surface.secondary', 'status.riskSoft'],
  'status.success': ['background', 'surface.primary', 'surface.secondary', 'status.successSoft'],
  'status.waiting': ['background', 'surface.primary', 'surface.secondary', 'status.waitingSoft'],
  'ai.insight': ['background', 'surface.primary', 'ai.insightSoft'],
  'ai.inference': ['background', 'surface.primary', 'ai.inferenceSoft'],
  'ai.confirmation': ['background', 'surface.primary', 'ai.confirmationSoft'],
  'ai.action': ['background', 'surface.primary', 'ai.actionSoft'],
  'neutral.deep': ['background', 'surface.primary', 'ai.insightSoft'],
  'text.inverse': ['action.primary'],
};

let md = `# Her Keys — WCAG AA Contrast Matrix

Generated from \`src/design/tokens.ts\` by \`scripts-dev/gen-contrast-matrix.mjs\`.
The same pair list is gated by \`tests/design-system/contrast.test.mjs\` — if the
two disagree, the test wins. Floor: 4.5:1 normal text, 3:1 large text
(display/screenTitle/sectionTitle/cardTitle) and component-identifying boundaries.

Attack list first (§8): muted on ivory, secondary on secondary surfaces, clay
accent text, pastel-family accents, disabled states, AI semantic treatments —
every one measured below, none by eye.

## Text × surface pairings

| Text token | Value | Surface | Value | Ratio | Verdict |
|---|---|---|---|---|---|
`;

let allPass = true;
for (const [fgName, bgList] of Object.entries(INTENT)) {
  for (const bgName of bgList) {
    const r = ratio(TEXT[fgName], SURFACES[bgName]);
    const pass = r >= 4.5;
    if (!pass) allPass = false;
    md += `| ${fgName} | ${TEXT[fgName]} | ${bgName} | ${SURFACES[bgName]} | ${r.toFixed(2)}:1 | ${pass ? 'PASS' : 'FAIL'} |\n`;
  }
}

md += `
## Component-identifying boundaries (WCAG 1.4.11 — 3:1)

| Boundary | Value | Adjacent | Value | Ratio | Verdict |
|---|---|---|---|---|---|
`;
for (const [bgName, bg] of [['surface.primary', color.surface.primary], ['background', color.background]]) {
  const r = ratio(color.border.control, bg);
  md += `| border.control | ${color.border.control} | ${bgName} | ${bg} | ${r.toFixed(2)}:1 | ${r >= 3 ? 'PASS' : 'FAIL'} |\n`;
}

md += `
## Notes

- Decorative hairlines (border.default/subtle) are intentionally NOT
  component identifiers; no contrast requirement applies beyond not being the
  sole means of identifying a control.
- Disabled (action.disabled / action.disabledText) is WCAG-exempt as an
  inactive component, but the pair is kept at ${ratio(color.action.disabledText, color.action.disabled).toFixed(2)}:1
  on purpose — an unreadable disabled button still frustrates.
- Largest finite radius is ${radius.lg}px; only pills are fully round.

**Overall: ${allPass ? 'ALL PAIRINGS PASS WCAG AA' : 'SOME PAIRINGS FAIL — DO NOT SHIP'}**
`;

writeFileSync(new URL('../docs/design-system/contrast-matrix.md', import.meta.url), md);
console.log('written, allPass =', allPass);
