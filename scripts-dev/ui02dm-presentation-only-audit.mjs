// HK-FE-UI-02-DM — lists diff lines (vs the entry SHA) in account/consent/welcome/onboarding/monetization/app files that are NOT theme plumbing.
// Usage: node scripts-dev/ui02dm-presentation-only-audit.mjs [entry-sha]. Expected output: only the root-layout provider wiring and the AccountPanel Appearance mount.
// For each changed file in sensitive areas, list diff lines that are NOT obviously theme plumbing.
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const names = execFileSync('git', ['diff', '--name-only', (process.argv[2] ?? 'ca9e792'), '--', 'src', 'app'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const areas = /^(src\/features\/(account|consent|premium|welcome|onboarding)|src\/monetization|app\/)/;
const themey = /color|colors|useStyles|StyleSheet|createThemedStyles|useTheme|elevation|interaction|from '.*(tokens|theme)'|^\s*[})\]],?\s*$|^\s*$|\buseStyles\b|styles\b/;
let total = 0;
for (const f of names.filter((n) => areas.test(n))) {
  const diff = execFileSync('git', ['diff', '-U0', (process.argv[2] ?? 'ca9e792'), '--', f], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const odd = diff.filter((l) => !themey.test(l.slice(1)));
  total += odd.length;
  if (odd.length) {
    console.log('== ' + f + ' (' + odd.length + ' non-theme lines)');
    odd.slice(0, 12).forEach((l) => console.log('   ' + l.slice(0, 140)));
  }
}
console.log('files checked:', names.filter((n) => areas.test(n)).length, 'non-theme lines:', total);
