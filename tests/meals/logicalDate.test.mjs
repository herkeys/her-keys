/**
 * HK-FEATURE-08 / ML3 — Tuesday stays Tuesday.
 *
 * A MealPlanEntry belongs to a HOUSEHOLD LOGICAL DATE: a calendar date, never an instant. It must not move across UTC midnight, a
 * timezone or device change, a daylight-saving day, a restart or a second device. "Today" follows the household timezone stored at
 * creation; nothing about a meal is ever converted through Date, UTC or the device timezone.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addDays, logicalDateAt, weekdayOf, zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { addMeal, archiveMeal, updateMeal } from '../../src/domain/meals.ts';
import { mealDayLabel, longDate, shortDate } from '../../src/features/meals/mealDates.ts';
import { buildMealsView } from '../../src/features/meals/mealsView.ts';
import { at, real } from '../support/acceptance.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NY = 'America/New_York';
const AUCKLAND = 'Pacific/Auckland';
const TUESDAY = '2026-09-22';

const withMeal = (date, base = real()) => addMeal(base, at(), { id: 'meal-d-' + date, title: 'Tacos', date, slot: 'dinner' }).state;
const inTz = (date, minutes, tz) => zonedTimeToEpochMs(date, minutes, tz);

describe('[AJ] [AT] the household timezone decides today, and a meal never re-derives its date from an instant', () => {
  test('[AJ2] [AT1] 23:30 in New York is still that New York day even though it is already tomorrow in UTC', () => {
    const late = inTz('2026-09-21', 23 * 60 + 30, NY);
    assert.equal(new Date(late).toISOString(), '2026-09-22T03:30:00.000Z', 'precondition: UTC has already reached Tuesday');
    assert.equal(logicalDateAt(late, NY), '2026-09-21', 'the household is still on Monday');
    assert.equal(logicalDateAt(late, 'UTC'), '2026-09-22', 'a UTC reading would have moved the day');

    const state = withMeal('2026-09-21');
    const today = logicalDateAt(late, NY);
    assert.deepEqual(buildMealsView(state, today).upNext[0].entries.map((e) => e.logicalDate), ['2026-09-21'], 'the Monday meal is still today');
  });

  test('[AT1] 00:30 in Auckland is already Tuesday there while UTC is still Monday, and the Tuesday meal is today', () => {
    const early = inTz(TUESDAY, 30, AUCKLAND);
    assert.equal(new Date(early).toISOString(), '2026-09-21T12:30:00.000Z');
    assert.equal(logicalDateAt(early, AUCKLAND), TUESDAY);
    assert.equal(logicalDateAt(early, 'UTC'), '2026-09-21');
    assert.deepEqual(buildMealsView(withMeal(TUESDAY), logicalDateAt(early, AUCKLAND)).upNext[0].entries.map((e) => e.logicalDate), [TUESDAY]);
  });

  test('[AJ3] an entry stores a calendar date and is never re-derived from an instant: the same string under every household timezone', () => {
    for (const tz of [NY, AUCKLAND, 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati', 'America/St_Johns']) {
      const state = { ...withMeal(TUESDAY), user: { ...real().user, timezone: tz } };
      assert.equal(state.meals[0].date, TUESDAY, tz);
      assert.equal(buildMealsView(state, '2026-09-21').upNext[1].entries[0].logicalDate, TUESDAY, tz);
    }
  });
});

describe('[AU] [AV] daylight-saving days', () => {
  test('[AU1] spring-forward (2026-03-08, New York): one date across the skipped hour, and dates around it stay exact', () => {
    const before = Date.UTC(2026, 2, 8, 6, 59, 59);
    const after = Date.UTC(2026, 2, 8, 7, 0, 0);
    assert.equal(logicalDateAt(before, NY), '2026-03-08');
    assert.equal(logicalDateAt(after, NY), '2026-03-08');
    const state = ['2026-03-07', '2026-03-08', '2026-03-09'].reduce((s, d) => withMeal(d, s), real());
    for (const ms of [before, after]) {
      const view = buildMealsView(state, logicalDateAt(ms, NY));
      assert.deepEqual(view.upNext.map((d) => d.entries.map((e) => e.logicalDate)), [['2026-03-08'], ['2026-03-09']]);
    }
    assert.deepEqual(['2026-03-07', '2026-03-08', '2026-03-09'].map(weekdayOf), [6, 0, 1], 'Saturday, Sunday, Monday');
    assert.equal(addDays('2026-03-07', 2), '2026-03-09');
  });

  test('[AU2] addDays over the transition is exact calendar arithmetic (no 23- or 25-hour day)', () => {
    let day = '2026-03-05';
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(day);
      day = addDays(day, 1);
    }
    assert.deepEqual(seen, ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  test('[AV1] fall-back (2026-11-01, New York): the repeated hour cannot yield two different todays', () => {
    const firstOnePm = Date.UTC(2026, 10, 1, 5, 30); // 01:30 EDT
    const secondOnePm = Date.UTC(2026, 10, 1, 6, 30); // 01:30 EST
    assert.equal(logicalDateAt(firstOnePm, NY), '2026-11-01');
    assert.equal(logicalDateAt(secondOnePm, NY), '2026-11-01');
    const state = withMeal('2026-11-01');
    for (const ms of [firstOnePm, secondOnePm]) assert.equal(buildMealsView(state, logicalDateAt(ms, NY)).upNext[0].entries.length, 1);
    assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  });
});

describe('[AI] [AW] a device or travel timezone change moves nothing', () => {
  test('[AI1] [AI2] no meal action reads or changes the household timezone, and the entry keeps its date', () => {
    const state = withMeal(TUESDAY);
    const before = state.user;
    let next = updateMeal(state, at(), 'meal-d-' + TUESDAY, { slot: 'lunch' }).state;
    next = addMeal(next, at(), { title: 'Soup', date: '2026-09-23' }).state;
    next = archiveMeal(next, at(), 'meal-d-' + TUESDAY).state;
    assert.equal(next.user, before, 'the household timezone (state.user) is the very same object');
    assert.equal(before.timezone, 'America/New_York');
    assert.equal(next.meals.find((m) => m.id === 'meal-d-' + TUESDAY).date, TUESDAY);
  });

  test('[AW2] household timezone travel is deferred by the foundation: state.user.timezone has no writer, and that is recorded', () => {
    const source = readFileSync(new URL('../../src/domain/logicalDay.ts', import.meta.url), 'utf8');
    assert.match(source, /travel/i, 'logicalDay.ts still says travel is deferred');
  });
});

describe('[AH] [AT] the date survives a serialize and rehydrate under any PROCESS timezone', () => {
  const ZONES = ['UTC', 'Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati', 'America/St_Johns'];
  const probe = (tz) => {
    const result = spawnSync(
      process.execPath,
      [
        '--import', pathToFileURL(fileURLToPath(new URL('../support/register-ts.mjs', import.meta.url))).href,
        '--import', pathToFileURL(fileURLToPath(new URL('../support/register-jsx.mjs', import.meta.url))).href,
        fileURLToPath(new URL('./support/tzProbe.mjs', import.meta.url)),
      ],
      { cwd: ROOT, env: { ...process.env, TZ: tz }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `probe under ${tz} failed: ${result.stderr}`);
    return JSON.parse(result.stdout.trim().split('\n').pop());
  };

  test('[AH1] [AT2] persisted, pulled and projected, Tuesday is Tuesday in every process timezone', () => {
    const results = ZONES.map((tz) => [tz, probe(tz)]);
    for (const [tz, out] of results) {
      assert.deepEqual([out.persisted, out.pulled, out.viewDate], [TUESDAY, TUESDAY, TUESDAY], tz);
      assert.equal(out.viewLabel, 'Tomorrow');
      assert.equal(out.a11y, 'Tacos, Dinner, Tuesday 22 September');
    }
    const effective = results.filter(([tz, out]) => out.processTimeZone === tz).length;
    console.log(`  logical date probe: ${results.length} process timezones, the TZ variable took effect in ${effective} of them (${process.platform}, node ${process.version})`);
  });
});

describe('the date labels never go through an instant', () => {
  test('[AH] labels come from the date\'s own parts', () => {
    assert.equal(shortDate('2026-09-22'), 'Tue 22 Sep');
    assert.equal(longDate('2026-09-22'), 'Tuesday 22 September');
    assert.deepEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-27', '2026-09-28', '2026-09-30'].map((d) => mealDayLabel(d, '2026-09-21')), ['Today', 'Tomorrow', 'Wednesday', 'Sunday', 'Mon 28 Sep', 'Wed 30 Sep']);
    assert.equal(mealDayLabel('2026-09-20', '2026-09-21'), 'Yesterday');
  });

  test('[AJ3] no meal date path contains a Date conversion, a timezone lookup or an instant', () => {
    const files = ['src/domain/meals.ts', 'src/features/meals/mealDates.ts', 'src/features/meals/mealsView.ts', 'src/features/meals/recurringMealWork.ts', 'src/features/meals/mealsGate.ts', 'src/features/meals/mealCopy.ts', 'src/features/meals/upcomingMeals.ts'];
    const forbidden = /new Date\(|Date\.parse|Date\.UTC|Date\.now|toISOString|getTimezoneOffset|Intl\.|deviceTimeZone|toLocale/;
    for (const file of files) {
      const code = readFileSync(new URL('../../' + file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.equal(forbidden.test(code), false, file + ' converts a date through an instant');
    }
  });
});
