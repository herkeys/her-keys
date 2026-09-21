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

describe('[BV] the semantic-boundary scan', () => {
  const scan = () => {
    const out = spawnSync(process.execPath, ['scripts-dev/meals-boundary-scan.cjs', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { status: out.status, result: JSON.parse(out.stdout) };
  };

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
    const added = execFileSync('git', ['diff', '14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
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
  test('[BL1] [BL2] the routing, route access, root layout and Life layout are untouched, and the Meals route is the existing direct route', () => {
    const changed = execFileSync('git', ['diff', '--name-only', '14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
    for (const untouched of ['src/domain/routeAccess.ts', 'app/_layout.tsx', 'app/(app)/life/_layout.tsx', 'src/domain/taskLists.ts', 'tests/build3Audit.capture.test.mjs']) {
      assert.equal(changed.includes(untouched), false, untouched + ' was changed');
    }
    const route = read('app/(app)/life/meals.tsx');
    assert.match(route, /MealsOverview/);
    assert.match(read('src/features/life/lifeStatus.ts'), /meals: '\/life\/meals'/);
    assert.equal(/Stack\.Screen|Tabs\.Screen|router\.(replace|navigate)/.test(route), false, 'no new screen or navigator is declared by the Meals route');
  });
});
