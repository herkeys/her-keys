/**
 * THE LIFE HUB AND NAVIGATION, AFTER INTEGRATION (HK-F01-F13 integration, INT13-02; ledger HK13-D10).
 *
 * The feature branches deliberately left central Life-hub decisions to integration, and two destinations never got an entry point:
 * Co-Parent Logistics (F07, `/life/coparent`) and People (F13, `/life/people`) were reachable only by a link. These tests hold the
 * reconciled IA: every Life screen is navigated to from somewhere other than itself, the hub reaches every area, the stable shell has
 * exactly its five tabs, and the hub's copy says only what the system does.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { starterCategories } from '../../src/domain/categories.ts';
import { LIFE_HUB_COPY } from '../../src/features/life/lifeHubCopy.ts';
import { LIFE_SCREEN_ROUTES, deriveLifeStatus, shownOnLife } from '../../src/features/life/lifeStatus.ts';
import { peopleLifeTile } from '../../src/features/people/lifeTile.ts';
import { REBUILD_COPY } from '../../src/features/rebuild/copy.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(REPO, path), 'utf8');
const posix = (path) => path.split(sep).join('/');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(REPO, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(REPO, path)).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}
const SOURCES = [...walk('src'), ...walk('app')].map((file) => ({ file, text: read(file) }));
const LIFE_DIR = 'app/(app)/life';

/** Every Life screen file and its route: `life/<name>.tsx` -> `/life/<name>`; a dynamic `life/child/[childId].tsx` -> `/life/child`. */
function lifeRoutes() {
  const out = [];
  for (const file of walk(LIFE_DIR)) {
    const rel = posix(relative(join(REPO, LIFE_DIR), join(REPO, file))).replace(/\.tsx?$/, '');
    if (rel === '_layout' || rel === 'index') continue;
    const route = `/life/${rel.replace(/\/\[[^\]]+\]$/, '')}`;
    out.push({ file, route });
  }
  return out;
}
const quoted = (route) => new RegExp(`['"\`]${route.replace(/[/\-]/g, (c) => `\\${c}`)}(['"\`/?]|$)`);

describe('every Life screen has an entry point', () => {
  test('each route under app/(app)/life is navigated to from code OTHER than its own route file (nothing is reachable only by a link)', () => {
    const routes = lifeRoutes();
    assert.ok(routes.length >= 20, `found ${routes.length} Life routes`);
    const orphans = routes.filter(({ file, route }) => !SOURCES.some((s) => s.file !== file && quoted(route).test(s.text)));
    assert.deepEqual(orphans.map((o) => o.route), []);
  });

  test('the hub reaches every AREA: the household areas through the category route map, the rest through its own rows', () => {
    const hub = read(`${LIFE_DIR}/index.tsx`);
    const fromHub = new Set([
      ...Object.values(LIFE_SCREEN_ROUTES),
      ...[...hub.matchAll(/router\.push\('(\/life\/[a-z-]+)'\)/g)].map((m) => m[1]),
      ...(/peopleLifeTile\(state, today\)/.test(hub) ? [peopleLifeTile(createEmptyState('America/Chicago'), '2026-09-22').route] : []),
    ]);
    const areas = ['/life/kids', '/life/home', '/life/money', '/life/meals', '/life/work', '/life/coparent', '/life/other-tasks', '/life/inbox',
      '/life/needs-me', '/life/rebuild', '/life/admin', '/life/people'];
    assert.deepEqual(areas.filter((a) => !fromHub.has(a)), []);
    for (const route of Object.values(LIFE_SCREEN_ROUTES)) {
      assert.ok(lifeRoutes().some((r) => r.route === route), `${route} is registered but has no screen file`);
    }
  });

  test('the stable shell is exactly Today, Life, Calendar, Systems and Her Keys AI (no feature added a tab)', () => {
    const tabs = [...read('app/(app)/_layout.tsx').matchAll(/<Tabs\.Screen name="([^"]+)" options=\{\{ title: '([^']+)' \}\} \/>/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(tabs, ['today:Today', 'life:Life', 'calendar:Calendar', 'systems:Systems', 'ai:Her Keys AI']);
  });
});

describe('the Co-parenting row (Feature 07 registered through the category route map)', () => {
  const input = (categories) => ({ categories, events: [], tasks: [], systems: [], upcomingMeals: [], openTaskCounts: new Map() });
  const hh = 'household-1';

  test('a household\'s co-parenting category has a Life row that opens the co-parent screen, under the household\'s own name', () => {
    const categories = starterCategories(hh).map((c) => (c.systemRole === 'coparenting' ? { ...c, name: 'Handoffs with Sam' } : c));
    const rows = shownOnLife(deriveLifeStatus(input(categories)));
    const row = rows.find((r) => r.systemRole === 'coparenting');
    assert.ok(row, 'the co-parenting category is shown on Life');
    assert.equal(row.route, '/life/coparent');
    assert.equal(row.label, 'Handoffs with Sam', 'the household\'s own name, never a hard-coded one');
    assert.equal(row.value, 'Nothing today', 'the generic reading: a count of what is due and on today, never a child, place or time');
  });

  test('the rows keep the household\'s own category order, and an archived (absent) co-parenting category has no row', () => {
    const rows = shownOnLife(deriveLifeStatus(input(starterCategories(hh))));
    assert.deepEqual(rows.map((r) => r.systemRole), ['kids', 'home', 'money', 'meals', 'work', 'coparenting']);
    const withoutIt = shownOnLife(deriveLifeStatus(input(starterCategories(hh).filter((c) => c.systemRole !== 'coparenting'))));
    assert.equal(withoutIt.some((r) => r.systemRole === 'coparenting'), false);
  });
});

describe('the hub\'s copy says only what the system does', () => {
  test('the subtitle no longer counts areas or claims Her Keys reads everything here into her day', () => {
    assert.equal(/\bfive\b|\d/i.test(LIFE_HUB_COPY.subtitle), false, LIFE_HUB_COPY.subtitle);
    assert.equal(/reads when it looks at your day/i.test(LIFE_HUB_COPY.subtitle), false);
    assert.equal(/Five areas/.test(read(`${LIFE_DIR}/index.tsx`)), false);
  });

  test('the private section says the truth: private to her, and only a task she makes reaches her day', () => {
    assert.match(LIFE_HUB_COPY.privateSectionNote, /Private to you/);
    assert.match(LIFE_HUB_COPY.privateSectionNote, /Only the tasks you make here reach your day/);
  });

  test('HK13-D23: a row never denies what exists — the Money row reads today\'s slice, and paused Focuses are still named', () => {
    const categories = starterCategories('household-1');
    const money = shownOnLife(deriveLifeStatus({ categories, events: [], tasks: [], systems: [], upcomingMeals: [], openTaskCounts: new Map() }))
      .find((r) => r.systemRole === 'money');
    assert.equal(money.value, 'Nothing due today', 'not "this week": the row only ever sees today');
    assert.equal(REBUILD_COPY.life.rowValue(0, 0), 'Nothing named yet');
    assert.equal(REBUILD_COPY.life.rowValue(0, 2), '2 paused', 'paused Focuses exist; nothing is denied');
    assert.equal(REBUILD_COPY.life.rowValue(0, 1), '1 paused');
    assert.equal(REBUILD_COPY.life.rowValue(1, 3), '1 focus');
    assert.match(read(`${LIFE_DIR}/index.tsx`), /REBUILD_COPY\.life\.rowValue\(activeFocuses, pausedFocuses\)/, 'the hub passes both counts');
  });
});
