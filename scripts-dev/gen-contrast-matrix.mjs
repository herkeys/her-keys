import { writeFileSync } from 'node:fs';
import { brandPalette, color, radius } from '../src/design/tokens.ts';
import { BOUNDARIES, BOUNDARY_FLOOR, INTENT, NORMAL_TEXT_FLOOR, SURFACES, TEXT, ratio } from '../tests/design-system/contrastPairs.mjs';

let md = `# Her Keys — WCAG AA Contrast Matrix (HK-FE-UI-02)

Generated from \`src/design/tokens.ts\` by \`scripts-dev/gen-contrast-matrix.mjs\`, using the pair list in
\`tests/design-system/contrastPairs.mjs\`. The same list is gated by \`tests/design-system/contrast.test.mjs\`.
Floor: **${NORMAL_TEXT_FLOOR}:1 for every text pairing (no large-text exemption)** and ${BOUNDARY_FLOOR}:1 for component-identifying boundaries.

Supersedes the HK-FE-UI-01 clay/ivory matrix. Anything not listed is **not** an allowed pairing.

## Owner-pinned measurements

| Pairing | Ratio | Rule it creates |
|---|---|---|
| Berry Plum ${brandPalette.berryPlum} on Warm Off-White ${brandPalette.warmOffWhite} | ${ratio(brandPalette.berryPlum, brandPalette.warmOffWhite).toFixed(2)}:1 | Berry text is legal on off-white, white and the lilac wash |
| Dusty Mauve ${brandPalette.dustyMauve} on Warm Off-White | ${ratio(brandPalette.dustyMauve, brandPalette.warmOffWhite).toFixed(2)}:1 | **Never ordinary text.** Decoration, borders, icon wells only |
| Deep Plum Gray ${brandPalette.deepPlumGray} on Warm Off-White | ${ratio(brandPalette.deepPlumGray, brandPalette.warmOffWhite).toFixed(2)}:1 | The principal text anchor |
| Berry Plum on Soft Lilac Gray ${brandPalette.softLilac} | ${ratio(brandPalette.berryPlum, brandPalette.softLilac).toFixed(2)}:1 | **Berry is NOT legal for small text on Soft Lilac** — use \`action.onSoft\` or \`text.primary\` |

## Text × surface pairings

| Text token | Value | Surface | Value | Ratio | Verdict |
|---|---|---|---|---|---|
`;

let allPass = true;
for (const [fgName, bgList] of Object.entries(INTENT)) {
  for (const bgName of bgList) {
    const r = ratio(TEXT[fgName], SURFACES[bgName]);
    const pass = r >= NORMAL_TEXT_FLOOR;
    if (!pass) allPass = false;
    md += `| ${fgName} | ${TEXT[fgName]} | ${bgName} | ${SURFACES[bgName]} | ${r.toFixed(2)}:1 | ${pass ? 'PASS' : 'FAIL'} |\n`;
  }
}

md += `
## Component-identifying boundaries (WCAG 1.4.11 — ${BOUNDARY_FLOOR}:1)

| Boundary | Value | Adjacent | Value | Ratio | Verdict |
|---|---|---|---|---|---|
`;
for (const [name, { value, against }] of Object.entries(BOUNDARIES)) {
  for (const bgName of against) {
    const r = ratio(value, SURFACES[bgName]);
    if (r < BOUNDARY_FLOOR) allPass = false;
    md += `| ${name} | ${value} | ${bgName} | ${SURFACES[bgName]} | ${r.toFixed(2)}:1 | ${r >= BOUNDARY_FLOOR ? 'PASS' : 'FAIL'} |\n`;
  }
}

md += `
## Notes

- Decorative hairlines (border.default/subtle) and Dusty Mauve edges are intentionally NOT component identifiers; no
  contrast requirement applies beyond not being the sole means of identifying a control. A secondary button is identified
  by its (4.5:1+) label and pill shape, a text field by \`border.control\` (above).
- Disabled (action.disabled / action.disabledText) is WCAG-exempt as an inactive component, but the pair is kept at
  ${ratio(color.action.disabledText, color.action.disabled).toFixed(2)}:1 on purpose — an unreadable disabled button still frustrates.
- The primary button highlight and lower edge are opaque colours, so the rendered treatment cannot change under reduced
  transparency; text sits on the Berry body (${ratio(color.text.inverse, color.action.primary).toFixed(2)}:1) and on the pressed fill
  (${ratio(color.text.inverse, color.action.primaryPressed).toFixed(2)}:1).
- Gradients: none are used. Overlays: the only translucent layer is the sheet scrim, which never sits behind text we measure.
- Largest finite radius is ${radius.lg}px; only pills are fully round.

**Overall: ${allPass ? 'ALL PAIRINGS PASS WCAG AA' : 'SOME PAIRINGS FAIL — DO NOT SHIP'}**
`;

writeFileSync(new URL('../docs/design-system/contrast-matrix.md', import.meta.url), md);
console.log('written, allPass =', allPass);
