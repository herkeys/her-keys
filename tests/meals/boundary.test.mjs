/**
 * HK-FEATURE-08 / ML7 — what Feature 08 is not allowed to be, as structure.
 *
 * The semantic-boundary scan (scripts-dev/meals-boundary-scan.cjs) is the exit gate; this file runs it and adds the capability probes
 * (nothing in the foundation supplies dietary, allergy or recipe facts, so none may be claimed), the static guarantees (drafts never
 * touch the store, no meal operation writes an observation, nothing calls the network), and the route guarantee (the Life hub and
 * routing are used exactly as they were).
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const walk = (dir) =>
  readdirSync(new URL('../../' + dir, import.meta.url)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(new URL('../../' + rel, import.meta.url)).isDirectory() ? walk(rel) : [rel];
  });
const mealSources = walk('src/features/meals').filter((f) => /\.(ts|tsx)$/.test(f));

// The scan's baseline and the integration checkpoint every later lane branched from (see scripts-dev/meals-boundary-scan.cjs).
const BASE = '38ab7f14d017146883a939339eb604607eff623b';
const CHECKPOINT = '363e473fdf053547a21a41a67b7f62bd9aa2bcdf';
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let scanned;
/** The scan is a whole-tree git diff (seconds, not milliseconds): run once, read by every test below. */
const scan = () => {
  if (scanned === undefined) {
    const out = spawnSync(process.execPath, ['scripts-dev/meals-boundary-scan.cjs', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    scanned = { status: out.status, result: JSON.parse(out.stdout) };
  }
  return scanned;
};

describe('[BV] the semantic-boundary scan', () => {
  test('[BV1] [BV2] [BV3] [BV4] [BV5] the scan passes: one migration, no new durable type, table, collection or sync kind, every shared-file change explained', () => {
    const { status, result } = scan();
    assert.deepEqual(result.findings, [], 'a finding needs an owner checkpoint, not a workaround');
    assert.equal(status, 0);
    assert.deepEqual(result.facts.newMigrations, ['supabase/migrations/20260921160000_f08_meal_slot_and_status.sql']);
    assert.deepEqual(result.facts.newDurableSchemas, []);
    assert.deepEqual(result.facts.mealPlanEntryFieldsAdded, ['slot', 'status'], 'MealPlanEntry gained exactly the two authorized fields');
    assert.deepEqual([result.facts.newTables, result.facts.newRootCollections, result.facts.newSyncKinds], [[], [], []]);
    assert.deepEqual(result.facts.secondModels, []);
    assert.ok(result.facts.sharedFileChanges.every((c) => c.reason.length > 10));
  });

  test('[BM1] [BM2] [BM3] no sibling imports, by import scan and by ancestry', () => {
    const { result } = scan();
    assert.deepEqual(result.facts.siblingImports, []);
    assert.deepEqual(result.facts.siblingAncestry, []);
    for (const file of mealSources) {
      for (const match of read(file).matchAll(/from\s+'(\.[^']*)'/g)) {
        assert.equal(/features\/(kids|home|money|work|calendar|systems|talk-it-out|daily-load|one-move|onboarding|tasks)\b/.test(match[1]), false, `${file} imports ${match[1]}`);
      }
    }
  });

  test('[BV6] who could have made a change decides what explains it: the Wave 2 line needs a Meals-line reason, a later change a later lane\'s (HK13-D11)', () => {
    const { account, MEALS_LINE } = createRequire(import.meta.url)('../../scripts-dev/meals-boundary-scan.cjs');
    const F10 = 'HK-FEATURE-10 (Work / Career OS)';
    // useHousehold.ts carries only a Meals-line reason. Changed on the Wave 2 line, that explains it; changed after the checkpoint,
    // it does not — Meals was certified before any later lane branched, so a Meals reason there would be a misattribution.
    assert.deepEqual(account('src/store/useHousehold.ts', 'M', true, null).findings, []);
    assert.deepEqual(account('src/store/useHousehold.ts', 'M', true, null).shared.lanes, [MEALS_LINE]);
    assert.match(account('src/store/useHousehold.ts', 'M', true, 'M').findings.join(), /changed after the integration checkpoint with no later lane's reason/);
    // A PROTECTED file: changed on the Wave 2 line, it fails whatever a later lane says; changed only after it, the lane that did it explains it.
    assert.match(account('app/_layout.tsx', 'M', true, 'M').findings.join(), /PROTECTED file changed on the Wave 2 line/);
    assert.deepEqual(account('app/_layout.tsx', 'M', false, 'M').findings, []);
    assert.deepEqual(account('app/_layout.tsx', 'M', false, 'M').shared.lanes, [F10]);
    assert.match(account('src/domain/taskLists.ts', 'M', false, 'M').findings.join(), /no later lane's reason/, 'no lane explains taskLists.ts');
    // A later lane's own file is its lane, not a shared change; one changed on the Wave 2 line still needs its Meals-line reason.
    assert.deepEqual(account('src/features/work/WorkOverview.tsx', 'M', false, 'M'), { findings: [], shared: null, mealsFile: null });
    assert.match(account('src/features/work/WorkOverview.tsx', 'M', true, 'M').findings.join(), /unexplained shared-file change on the Wave 2 line/);
    // A Meals file changed after the checkpoint names who changed it, and a Meals file no lane explains is a finding.
    assert.ok(account('supabase/tests/private-stack.mjs', 'M', true, 'M').mealsFile.lanes.includes('HK-F01-F13 integration (INT13 / AUD13)'));
    assert.match(account('src/features/meals/MealsBody.tsx', 'M', true, 'M').findings.join(), /no later lane's reason/);
  });

  test('[CB1] [CD1] no dependency relation, recipe link or external reference is created by Meals code', () => {
    for (const file of [...mealSources, 'src/domain/meals.ts']) {
      const code = strip(read(file));
      assert.equal(/addDependency|addRecurrence|ExternalReference|externalReference|delegate\(|appendObservation|skipOccurrence/.test(code), false, file);
    }
  });
});

describe('[AN] [BY] no dietary or allergy context exists to attribute', () => {
  test('[AN1] [BY1] nothing outside Meals\' own copy mentions allergy, diet, nutrition, calories or recipes: the foundation has no such facts, so none may be claimed', () => {
    const roots = ['src/domain', 'src/state', 'src/store', 'src/persistence', 'src/data'];
    const offenders = [];
    for (const root of roots) {
      for (const file of walk(root).filter((f) => /\.ts$/.test(f))) {
        const code = strip(read(file));
        if (/allerg|dietary|nutrition|calorie|gluten|vegan|recipe/i.test(code)) offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], 'a dietary or allergy field appeared: this scenario must be revisited, and attribution designed, before Meals can surface it');
  });
});

describe('[BF] drafts and UI state stay off the store', () => {
  test('[BF1] the sheets and the body import no store, persistence or sync module: a draft lives and dies in the component', () => {
    for (const file of ['src/features/meals/MealSheet.tsx', 'src/features/meals/MealTaskSheet.tsx', 'src/features/meals/MealsBody.tsx']) {
      assert.equal(/from '[^']*\/(store|persistence|state|platform)\//.test(read(file)), false, file);
    }
  });

  test('[BF2] the only writes are the meal domain actions through the canonical store commit', () => {
    const overview = read('src/features/meals/MealsOverview.tsx');
    assert.equal((overview.match(/store\.commit\(/g) ?? []).length, 3, 'meal save, remove, and task save');
    assert.equal(/store\.dispatch|setIdentity|saveIdentity|supabase|fetch\(/.test(overview), false);
  });
});

describe('[BO] no network, no logging, no secrets in Meals code', () => {
  test('[BO3] Meals code makes no network call and logs nothing (a meal title never reaches a log)', () => {
    for (const file of [...mealSources, 'src/domain/meals.ts']) {
      const code = strip(read(file));
      assert.equal(/console\.|fetch\(|XMLHttpRequest|supabase|analytics|Sentry|posthog|track\(/i.test(code), false, file);
    }
  });

  test('[BO1] no secret or credential pattern in any line Feature 08 added', () => {
    // 38ab7f14d017146883a939339eb604607eff623b: the Wave 2 integration checkpoint (W2I-F07) immediately before F08 was merged into
    // it — see scripts-dev/meals-boundary-scan.cjs for why this baseline is what it is (kept, not advanced further; advancing it
    // past F08's own migration broke the checks that need to see that migration as new).
    const added = execFileSync('git', ['diff', '38ab7f14d017146883a939339eb604607eff623b'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    const patterns = [
      ['a JWT', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/], ['a Stripe or generic sk_ key', /\bsk_(live|test)_[A-Za-z0-9]{10,}/], ['an AWS key', /AKIA[0-9A-Z]{16}/],
      ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['a Google API key', /AIza[0-9A-Za-z_-]{30,}/], ['a credentialed URL', /[a-z]+:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/i],
      ['a service-role key assignment', /service_role['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/],
    ];
    // The local development JWT secret and anon key are Supabase's own published values and predate this branch, so they are not "added".
    for (const [label, re] of patterns) assert.equal(re.test(added), false, `Feature 08 added ${label}`);
  });
});

describe('[BL] the route and the Life hub are used as they were', () => {
  test('[BL1] [BL2] Meals never changed the routing, route access, root layout or Life layout; any later change to one is a registered later lane\'s; the Meals route is the existing direct route', () => {
    // Until the F01-F13 integration this asked only whether these files changed since BASE. On the integrated line Feature 10 adds
    // the opportunity editor to the root layout and route access, and Feature 09 rewrites the Money row of the reachability audit —
    // not Meals changes. So the guarantee is asked where Meals was built (the Wave 2 line, BASE .. CHECKPOINT), and a change after it
    // must be explained by a later lane and never by a Meals-line reason (HK13-D11).
    const onWave2Line = git('diff', '--name-only', BASE, CHECKPOINT).split('\n');
    const sinceBase = git('diff', '--name-only', BASE).split('\n');
    const { result } = scan();
    for (const untouched of ['src/domain/routeAccess.ts', 'app/_layout.tsx', 'app/(app)/life/_layout.tsx', 'src/domain/taskLists.ts', 'tests/build3Audit.capture.test.mjs']) {
      assert.equal(onWave2Line.includes(untouched), false, `${untouched} was changed on the Wave 2 line`);
      if (!sinceBase.includes(untouched)) continue;
      const change = result.facts.sharedFileChanges.find((c) => c.file === untouched);
      assert.ok(change, `${untouched} changed after the checkpoint and the scan accounts for it`);
      assert.ok(change.lanes.length > 0 && !change.lanes.includes(result.facts.mealsLine), `${untouched} is explained by ${change.lanes.join(', ')}`);
    }
    const route = read('app/(app)/life/meals.tsx');
    assert.match(route, /MealsOverview/);
    assert.match(read('src/features/life/lifeStatus.ts'), /meals: '\/life\/meals'/);
    assert.equal(/Stack\.Screen|Tabs\.Screen|router\.(replace|navigate)/.test(route), false, 'no new screen or navigator is declared by the Meals route');
  });
});
