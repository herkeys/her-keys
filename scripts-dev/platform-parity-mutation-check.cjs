// Platform-parity guard mutation check (V1 Finalization Part 1). Real-file sabotage of the parity guards.
// Each mutation is applied to a shipped file, the named tests run, the file is restored
// byte-for-byte, and the result (caught = at least one failing test) is printed. Run from the repo root:
//   node scripts-dev/platform-parity-mutation-check.cjs
const fs = require('fs');
const { spawnSync } = require('child_process');
const q = String.fromCharCode(39);
const MUTANTS = [
  {
    id: 'S1 undeclared Platform branch in a feature file',
    file: 'src/features/today/TodayBriefing.tsx',
    apply: (s) => s + '\nexport const __sabotage = (require(' + q + 'react-native' + q + ').Platform.OS === ' + q + 'android' + q + ');\n',
    tests: ['tests/platformParity/registryGuard.test.mjs'],
  },
  {
    id: 'S2 Calendar route substituted into the identity redirect',
    file: 'src/platform/googleIdentityOAuth.ts',
    apply: (s) => s.replace("export const GOOGLE_IDENTITY_REDIRECT = 'herkeys://auth/callback';", "export const GOOGLE_IDENTITY_REDIRECT = 'herkeys://calendar-connected';"),
    tests: ['tests/googleAuthParity.test.mjs', 'tests/platformParity/registryGuard.test.mjs'],
  },
  {
    id: 'S3 Calendar return passed to the router again (PP-D01 reverted)',
    file: 'src/platform/systemLinks.ts',
    apply: (s) => s.replace('  if (isCalendarConnectedReturn(path)) return null;\n', ''),
    tests: ['tests/platformParity/systemLinks.test.mjs', 'tests/platformParity/registryGuard.test.mjs'],
  },
  {
    id: 'S4 Apple offered on Android',
    file: 'src/platform/appleProvider.ts',
    apply: (s) => s.replace(/ {6}if \(Platform\.OS !== 'ios'\) return false;\r?\n/, ''),
    tests: ['tests/platformParity/registryGuard.test.mjs'],
  },
  {
    id: 'S5 Google registered only on iOS',
    file: 'src/store/accountRuntimeInstance.ts',
    apply: (s) => s.replace('...(secureStorageAvailable ? [createGoogleProvider(providerClient)] : [])', "...(require('react-native').Platform.OS === 'ios' ? [createGoogleProvider(providerClient)] : [])"),
    tests: ['tests/googleAuthParity.test.mjs', 'tests/platformParity/registryGuard.test.mjs'],
  },
  {
    id: 'S6 Your Account opened to a quarantined device (PP-D04)',
    file: 'src/domain/routeAccess.ts',
    apply: (s) => s.replace("if (account.kind === 'boundOther') return guard === 'quarantined';", "if (account.kind === 'boundOther' && guard !== 'account') return guard === 'quarantined';"),
    tests: ['tests/platformParity/accountAccess.test.mjs', 'tests/routeAccess.test.mjs'],
  },
  {
    id: 'S7 Today account entry removed (PP-D04)',
    file: 'src/features/today/TodayBriefing.tsx',
    apply: (s) => s.replace(/ {8}<AccountEntry \/>\r?\n/, ''),
    tests: ['tests/platformParity/accountAccess.test.mjs'],
  },
  {
    id: 'S8 Apple cross-platform note shown where Apple is not offered (PP-D03)',
    file: 'src/features/account/accountModel.ts',
    apply: (s) => s.replace("return mode === 'signIn' && providers.includes('apple');", "return mode === 'signIn';"),
    tests: ['tests/platformParity/accountAccess.test.mjs'],
  },
  {
    id: 'S9 Apple portability limitation removed from the registry (PP-D03)',
    file: 'docs/audits/HK_PLATFORM_PARITY_REGISTRY.json',
    apply: (s) => {
      const reg = JSON.parse(s);
      delete reg.exceptions.find((entry) => entry.id === 'EX-01').portabilityLimitation;
      return JSON.stringify(reg, null, 2) + '\n';
    },
    tests: ['tests/platformParity/registryGuard.test.mjs'],
  },
];
const results = [];
for (const m of MUTANTS) {
  const original = fs.readFileSync(m.file);
  const text = original.toString('utf8');
  const mutated = m.apply(text);
  if (mutated === text) { results.push({ id: m.id, result: 'NOT_APPLIED' }); continue; }
  fs.writeFileSync(m.file, mutated);
  let out = '';
  try {
    const r = spawnSync(process.execPath, ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-reporter=tap', ...m.tests], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    out = (r.stdout || '') + (r.stderr || '');
  } finally {
    fs.writeFileSync(m.file, original);
  }
  const fail = Number((out.match(/^# fail (\d+)/m) || [])[1] ?? NaN);
  const pass = Number((out.match(/^# pass (\d+)/m) || [])[1] ?? NaN);
  results.push({ id: m.id, pass, fail, result: fail > 0 ? 'CAUGHT' : Number.isNaN(fail) ? 'BROKEN' : 'SURVIVED' });
  if (!fs.readFileSync(m.file).equals(original)) throw new Error('restore failed for ' + m.file);
}
console.log(JSON.stringify(results, null, 1));
