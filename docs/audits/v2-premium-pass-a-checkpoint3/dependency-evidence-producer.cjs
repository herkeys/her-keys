// Run from repository root: node docs/audits/v2-premium-pass-a-checkpoint3/dependency-evidence-producer.cjs
// Read-only source/lock inspection; writes public version metadata into this audit artifact directory.
const fs = require('node:fs');
const cp = require('node:child_process');
const source = '420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17';
const before = JSON.parse(cp.execFileSync('git', ['show', `${source}:package-lock.json`], { encoding: 'utf8', maxBuffer: 20_000_000 })).packages;
const after = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')).packages;
const primary = new Set(['expo', 'expo-auth-session', 'expo-constants', 'expo-linking', 'expo-notifications', 'expo-router']);
const changes = Object.keys({ ...before, ...after }).filter((path) => before[path]?.version !== after[path]?.version).map((path) => {
  const name = path.split('node_modules/').pop();
  return {
    path, before: before[path]?.version ?? null, after: after[path]?.version ?? null,
    reason: primary.has(name) ? 'Expo SDK 57 compatibility check requires this patch'
      : /react-native-(reanimated|worklets)/.test(name) ? 'Pin SDK 57 supported native peer pair; replace incompatible floating auto-installed peers'
      : name === 'expo-modules-core' ? 'SDK 57.0.29 requires native core 57.0.23; keep one root-resolvable transitive copy'
      : 'npm-selected compatible transitive resolution in Expo installation/dedupe graph; no unrelated root API upgrade',
    requiredBy: Object.entries(after).filter(([, pkg]) => pkg.dependencies?.[name] || pkg.peerDependencies?.[name]).map(([parent]) => parent || 'project'),
  };
});
const corePaths = Object.keys(after).filter((path) => path.endsWith('/expo-modules-core'));
if (corePaths.length !== 1 || corePaths[0] !== 'node_modules/expo-modules-core') throw new Error('native core must be one root-resolvable copy');
if (after['']?.dependencies?.['expo-modules-core']) throw new Error('native core must remain an Expo transitive dependency');
fs.writeFileSync('docs/audits/v2-premium-pass-a-checkpoint3/dependency-changes.json', JSON.stringify({ baseline: source, changes, corePaths }, null, 2) + '\n');
console.log(`DEPENDENCY_PATH_CHANGES=${changes.length} CORE_PATHS=${JSON.stringify(corePaths)}`);
