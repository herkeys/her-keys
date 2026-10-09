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
    // The scan SEES every sync kind a later lane added — core and foundation-manifest alike — before subtracting it (HK13-D22).
    assert.deepEqual([...result.facts.laterSyncKinds].sort(), ['lifeRecord', 'lifeRecordLink', 'opportunity', 'personContext', 'personTaskLink', 'rebuildFocus', 'rebuildFocusLink']);
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
    const REFINEMENTS = 'HK-PROTOTYPE-REFINEMENTS (FR01 / Notifications / External Intelligence)';
    const POLISH = 'HK-FE-UI-02 (frontend UI / motion polish pass)';
    const WELCOME_AUTH = 'HK-WELCOME-AUTH-RUNTIME (welcome tree wired to the account runtime)';
    const V2_CONSENT = 'V2-EMAIL-PASSWORD (2026-10-08)';
    // useHousehold.ts carries only a Meals-line reason. Changed on the Wave 2 line, that explains it; changed after the checkpoint,
    // it does not — Meals was certified before any later lane branched, so a Meals reason there would be a misattribution.
    assert.deepEqual(account('src/store/useHousehold.ts', 'M', true, null).findings, []);
    assert.deepEqual(account('src/store/useHousehold.ts', 'M', true, null).shared.lanes, [MEALS_LINE]);
    assert.match(account('src/store/useHousehold.ts', 'M', true, 'M').findings.join(), /changed after the integration checkpoint with no later lane's reason/);
    // A PROTECTED file: changed on the Wave 2 line, it fails whatever a later lane says; changed only after it, the lane that did it explains it.
    assert.match(account('app/_layout.tsx', 'M', true, 'M').findings.join(), /PROTECTED file changed on the Wave 2 line/);
    assert.deepEqual(account('app/_layout.tsx', 'M', false, 'M').findings, []);
    // Every registered later lane that changed it explains it: Feature 10 (its route), the post-certification refinements (the
    // device-local notification controller mount, d557f7c) and the polish pass (the splash fade) — the accounting names them all,
    // in registry order.
    // The welcome auth integration (the account-settling gate in the root layout) registers after them.
    assert.deepEqual(account('app/_layout.tsx', 'M', false, 'M').shared.lanes, [F10, REFINEMENTS, POLISH, WELCOME_AUTH, V2_CONSENT]);
    assert.match(account('src/domain/taskLists.ts', 'M', false, 'M').findings.join(), /no later lane's reason/, 'no lane explains taskLists.ts');
    // A later lane's own file is its lane, not a shared change; a shared change registered by a later lane names both lanes.
    assert.deepEqual(account('src/features/work/WorkOverview.tsx', 'M', false, 'M').shared.lanes, [F10, POLISH]);
    assert.match(account('src/features/work/WorkOverview.tsx', 'M', true, 'M').findings.join(), /unexplained shared-file change on the Wave 2 line/);
    // A Meals file changed after the checkpoint names who changed it, and a Meals file no lane explains is a finding.
    assert.ok(account('supabase/tests/private-stack.mjs', 'M', true, 'M').mealsFile.lanes.includes('HK-F01-F13 integration (INT13 / AUD13)'));
    // HK-FE-UI-02 registered its hub-header change to MealsBody, so the file now names that lane; an unexplained Meals file still fails.
    assert.ok(account('src/features/meals/MealsBody.tsx', 'M', true, 'M').mealsFile.lanes.includes(POLISH));
    assert.match(account('src/features/meals/mealsView.ts', 'M', true, 'M').findings.join(), /no later lane's reason/);
  });

  test('[BV7] check H — the register is true: every known-invalid claim still fails, and only a PROVED stacked lane inherits', () => {
    // `laneRegister` is check H as a rule over facts, so it can be held to cases the real tree does not contain. The welcome
    // frontend lane was the first to be STACKED (forked from this line's tip instead of the checkpoint); its branch therefore
    // holds every integration version by inheritance, which the original check read as "someone else already made this".
    // Its fix skipped every lane branch already in HEAD's history — which is every MERGED lane, so the check stopped
    // catching the very thing it exists for ([H2] below). The rule now inherits only for a lane that declares a base.
    const { laneRegister } = createRequire(import.meta.url)('../../scripts-dev/meals-boundary-scan.cjs');
    const v = (entries) => new Map(Object.entries(entries));
    const parallel = (over = {}) => ({ id: 'F', branch: 'feature/f', base: null, shared: [], present: true, baseProved: true, changed: new Set(), versions: v({}), baseVersions: null, ...over });
    const stacked = (over = {}) => parallel({ id: 'S', branch: 'feature/s', base: 'line-tip', baseVersions: v({}), ...over });
    const check = ({ lanes = [], checkpointVersions = v({}), held = [] }) => laneRegister({ checkpoint: 'CHECKPOINT', checkpointVersions, lanes, held }).overclaims;
    const X = 'package.json';

    // [H1] the integration claims a file it holds exactly as the checkpoint did: it changed nothing.
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), held: [[X, 'c0']] }).join(), /the integration claims package\.json, but CHECKPOINT already holds this exact version/);

    // [H2] the integration claims a file it holds exactly as a MERGED parallel lane left it. There is no "is this branch in
    // HEAD's history" input to this rule at all: a merged lane is a witness like any other. (This is the case that was lost.)
    const merged = parallel({ changed: new Set([X]), versions: v({ [X]: 'f1' }) });
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [merged], held: [[X, 'f1']] }).join(), /the integration claims package\.json, but feature\/f already holds this exact version/);
    // ...and a version nobody else made is the integration's own.
    assert.deepEqual(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [merged], held: [[X, 'i2']] }), []);

    // [H3] a lane lists a shared file its own history never changed.
    assert.match(check({ lanes: [parallel({ shared: [X] })] }).join(), /F claims package\.json, which feature\/f never changed/);

    // [H4] THE FALSE POSITIVE, for the intended reason: a stacked lane that did not touch the file holds the integration's
    // version only by inheritance, so it is not a witness against it.
    const inheriting = stacked({ versions: v({ [X]: 'i2' }), baseVersions: v({ [X]: 'i2' }) });
    assert.deepEqual(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [inheriting], held: [[X, 'i2']] }), []);
    // The same branch WITHOUT a declared base is an ordinary witness again: inheriting is never assumed, for any branch.
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [parallel({ id: 'S', branch: 'feature/s', versions: v({ [X]: 'i2' }) })], held: [[X, 'i2']] }).join(), /feature\/s already holds this exact version/);

    // [H5] a stacked lane changed the file ITSELF, on top of the line. The integration's claim is judged where the lane started:
    const changedIt = (baseBlob) => stacked({ changed: new Set([X]), versions: v({ [X]: 's3' }), baseVersions: v(baseBlob === null ? {} : { [X]: baseBlob }) });
    // true when the line's version there was already the integration's own,
    assert.deepEqual(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [changedIt('i2')], held: [[X, 's3']] }), []);
    // false when the checkpoint — or a merged parallel lane — already held that version (the integration never changed it),
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [changedIt('c0')], held: [[X, 's3']] }).join(), /only a stacked lane changed it: beneath that lane, CHECKPOINT already held the line's version/);
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [merged, changedIt('f1')], held: [[X, 's3']] }).join(), /beneath that lane, feature\/f already held the line's version/);
    // and false when the stacked lane created the file.
    assert.match(check({ lanes: [changedIt(null)], held: [[X, 's3']] }).join(), /the integration claims package\.json, but feature\/s created it/);
    // Two stacked lanes, one on the other: the claim is followed down through both to the line beneath them.
    const upper = stacked({ id: 'S2', branch: 'feature/s2', changed: new Set([X]), versions: v({ [X]: 's4' }), baseVersions: v({ [X]: 's3' }) });
    assert.deepEqual(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [changedIt('i2'), upper], held: [[X, 's4']] }), []);
    assert.match(check({ checkpointVersions: v({ [X]: 'c0' }), lanes: [changedIt('c0'), upper], held: [[X, 's4']] }).join(), /CHECKPOINT already held the line's version/);

    // [H6] a stacked lane's own claims are measured from ITS base: it cannot claim what the line had done before it forked,
    // even though that file does differ between the checkpoint and its branch.
    assert.match(check({ lanes: [stacked({ shared: [X], changed: new Set(['app/gallery.tsx']) })] }).join(), /S claims package\.json, which feature\/s never changed/);

    // [H7] a base that cannot be proved is a finding, and that lane inherits nothing and witnesses nothing.
    const unproved = stacked({ baseProved: false, versions: v({ [X]: 'i2' }), baseVersions: v({ [X]: 'i2' }) });
    assert.match(check({ lanes: [unproved] }).join(), /S declares base line-tip, which is not a commit of this line that feature\/s grew from/);

    // [H8] a lane whose branch is absent is reported as unverified — never as a pass, and never as a finding.
    const absent = laneRegister({ checkpoint: 'CHECKPOINT', checkpointVersions: v({}), lanes: [{ id: 'F', branch: 'feature/f', base: null, shared: [X], present: false }], held: [] });
    assert.deepEqual([absent.unverified, absent.overclaims], [['F'], []]);

    // The scanner's source: the base is PROVED from git (a commit, on this line above the checkpoint, that the branch grew
    // from), and the HEAD-ancestry exemption is gone.
    const source = read('scripts-dev/meals-boundary-scan.cjs');
    assert.match(source, /const baseProved = !feature\.base \|\| \(isCommit\(feature\.base\) && isAncestor\(CHECKPOINT, feature\.base\) && isAncestor\(feature\.base, feature\.branch\)\);/);
    assert.doesNotMatch(strip(source), /'--is-ancestor', branch, 'HEAD'/, 'no lane branch is exempted for being in HEAD\'s history');
    // On the real tree both stacked lanes are present, proved, and verified; every merged feature lane is still a witness.
    const { result } = scan();
    assert.deepEqual(result.facts.laneOverclaims, []);
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
