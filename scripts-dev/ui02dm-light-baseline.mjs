/**
 * Writes tests/design-system/fixtures/light-baseline.json. Run it ONLY against the pre-migration source (ca9e792, static tokens) — that
 * is what makes the fixture a baseline. Usage (from a checkout of the baseline, with tests/support/lightSnapshot.mjs copied in):
 *   node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs scripts-dev/ui02dm-light-baseline.mjs <out.json>
 */
import { writeFileSync } from 'node:fs';
import { renderAllSnapshots } from '../tests/support/lightSnapshot.tsx';

const out = process.argv[2];
if (!out) throw new Error('usage: <out.json>');
const snapshots = await renderAllSnapshots();
writeFileSync(out, JSON.stringify(snapshots, null, 1));
console.log(`wrote ${Object.keys(snapshots).length} snapshots to ${out}`);
