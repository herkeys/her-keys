/**
 * HK-FEATURE-06 / HM4 — FORM RULES. What she types becomes a Home draft or a message; the rules are about TRUTH:
 * an untouched duration is never hers, an edit sends only what she changed, and a repeat Home cannot express is locked, not overwritten.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDependency } from '../../src/domain/structure.ts';
import { clockOf, durationHint, parseClock, parseTaskForm, parseVisitForm, taskFormInitial, visitFormInitial } from '../../src/features/home/model/forms.ts';
import { commitHomeChange, createHomeTask, createHomeVisit, taskBaselineOf, updateHomeTask, visitBaselineOf } from '../../src/features/home/model/mutations.ts';
import { NOW, TODAY, TZ, atLocal, fresh, homeTask, homeVisit, household, iso, lastEvent, lastTask, repeating, task } from '../support/homeFixtures.mjs';

const blankTask = () => taskFormInitial(null, null);
const create = { kind: 'create' };

describe('task form — duration truth', () => {
  test('a NEW task with the duration left blank sends no duration, so nothing is claimed (the default is recorded as a default)', () => {
    const r = parseTaskForm({ ...blankTask(), title: 'Filter' }, create);
    assert.ok(r.ok);
    assert.equal('durationMinutes' in r.value, false);
    const s = createHomeTask(household(), fresh(), r.value).state;
    assert.deepEqual([lastTask(s).durationMinutes, lastTask(s).durationSource], [15, 'default']);
  });

  test('a number she typed is sent, and is hers', () => {
    const r = parseTaskForm({ ...blankTask(), title: 'Filter', durationText: '45', durationTouched: true }, create);
    assert.equal(r.value.durationMinutes, 45);
    assert.equal(lastTask(createHomeTask(household(), fresh(), r.value).state).durationSource, 'user');
  });

  test('a prefilled number she never touched is NOT sent on an edit (the default stays a default)', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Existing', { durationMinutes: 15, durationSource: 'default' });
    const existing = lastTask(s);
    const values = taskFormInitial(existing, null);
    assert.equal(values.durationText, '15');
    const r = parseTaskForm({ ...values, title: 'Existing (renamed)' }, { kind: 'edit', taskId: existing.id, basedOn: taskBaselineOf(existing) });
    assert.equal('durationMinutes' in r.value, false);
    assert.equal(task(updateHomeTask(s, fresh(), r.value).state, existing.id).durationSource, 'default');
  });

  test('clearing a touched duration field means "leave it as it is", not zero', () => {
    const r = parseTaskForm({ ...blankTask(), title: 'x', durationText: '   ', durationTouched: true }, create);
    assert.equal('durationMinutes' in r.value, false);
  });

  test('bad numbers are refused in words', () => {
    for (const bad of ['abc', '1.5', '-3', '99999']) {
      const r = parseTaskForm({ ...blankTask(), title: 'x', durationText: bad, durationTouched: true }, create);
      assert.equal(r.ok, false, bad);
      assert.match(r.error, /whole number from 0 to 1440/);
    }
  });

  test('the hint says how far the number can be trusted, and never more', () => {
    const ctx = fresh();
    const make = (source) => lastTask(homeTask(household(), ctx, `t-${source}`, { durationMinutes: 20, durationSource: source }));
    assert.match(durationHint(null), /marks that as an estimate/);
    assert.match(durationHint(make('user')), /You entered this/);
    assert.match(durationHint(make('default')), /not from you/);
    assert.match(durationHint(make('inferred')), /Estimated by Her Keys/);
    assert.match(durationHint(make(null)), /isn’t recorded/);
  });
});

describe('task form — fields and repeat', () => {
  test('a blank title, a bad date, or too-long text is refused in words', () => {
    assert.match(parseTaskForm({ ...blankTask(), title: '  ' }, create).error, /Give it a title/);
    assert.match(parseTaskForm({ ...blankTask(), title: 'x', dueText: '2026-9-1' }, create).error, /YYYY-MM-DD/);
    assert.match(parseTaskForm({ ...blankTask(), title: 'x'.repeat(201) }, create).error, /up to 200/);
    assert.match(parseTaskForm({ ...blankTask(), title: 'x', notes: 'n'.repeat(1001) }, create).error, /up to 1000/);
  });

  test('a repeat needs a sensible interval', () => {
    for (const bad of ['0', '367', 'x', '']) assert.match(parseTaskForm({ ...blankTask(), title: 'x', repeat: 'monthly', intervalText: bad }, create).error, /1 to 366/, bad);
    const ok = parseTaskForm({ ...blankTask(), title: 'x', repeat: 'monthly', intervalText: '3' }, create);
    assert.deepEqual(ok.value.repeat, { frequency: 'monthly', interval: 3 });
  });

  test('editing WITHOUT touching the repeat sends "unchanged" — the existing rule is never rewritten by an unrelated edit', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Filter');
    const id = lastTask(s).id;
    s = repeating(s, ctx, id, { frequency: 'monthly', interval: 3 });
    const existing = task(s, id);
    const values = taskFormInitial(existing, s.recurrences[0]);
    assert.deepEqual([values.repeat, values.intervalText, values.repeatLocked], ['monthly', '3', false]);
    const r = parseTaskForm({ ...values, title: 'Filter 2' }, { kind: 'edit', taskId: id, basedOn: taskBaselineOf(existing) });
    assert.equal(r.value.repeat, 'unchanged');
  });

  test('a repeat Home cannot express (created elsewhere, e.g. after completion) is LOCKED and is never overwritten', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Rinse');
    const id = lastTask(s).id;
    s = repeating(s, ctx, id);
    s = { ...s, recurrences: s.recurrences.map((r) => ({ ...r, trigger: 'after_completion' })) };
    const values = taskFormInitial(task(s, id), s.recurrences[0]);
    assert.equal(values.repeatLocked, true);
    const r = parseTaskForm({ ...values, title: 'Rinse 2', repeat: 'weekly', repeatTouched: true }, { kind: 'edit', taskId: id, basedOn: taskBaselineOf(task(s, id)) });
    assert.equal(r.value.repeat, 'unchanged', 'even a forced change is refused at the form');
    const saved = updateHomeTask(s, fresh(), r.value).state;
    assert.deepEqual(saved.recurrences.map((x) => [x.trigger, x.status]), [['after_completion', 'active']]);
  });

  test('choosing "No repeat" on a repeating task ends the rule', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Filter');
    const id = lastTask(s).id;
    s = repeating(s, ctx, id);
    const values = taskFormInitial(task(s, id), s.recurrences[0]);
    const r = parseTaskForm({ ...values, repeat: 'none', repeatTouched: true }, { kind: 'edit', taskId: id, basedOn: taskBaselineOf(task(s, id)) });
    assert.equal(r.value.repeat, null);
    assert.equal(updateHomeTask(s, fresh(), r.value).state.recurrences[0].status, 'ended');
  });

  test('the form never carries a category: nothing typed can move a task out of Home', () => {
    const r = parseTaskForm({ ...blankTask(), title: 'x' }, create);
    assert.equal('categoryId' in r.value, false);
  });
});

describe('visit form', () => {
  test('clock parsing: real times only', () => {
    assert.deepEqual(['09:30', '9:05', '23:59', '00:00'].map(parseClock), [570, 545, 1439, 0]);
    for (const bad of ['24:00', '9:5', '10:60', 'noon', '', '9']) assert.equal(parseClock(bad), null, bad);
  });

  test('a visit is converted using the HOUSEHOLD timezone, and reads back the same clock time', () => {
    const r = parseVisitForm({ ...visitFormInitial(null, TZ, TODAY), title: 'Furnace tune-up', dateText: '2026-09-25', startText: '09:30', endText: '10:45' }, TZ, create);
    assert.ok(r.ok);
    assert.equal(r.value.startsAt, iso(atLocal('2026-09-25', 9, 30)));
    assert.equal(clockOf(r.value.startsAt, TZ), '09:30');
    const s = createHomeVisit(household(), fresh(), r.value).state;
    const back = visitFormInitial(lastEvent(s), TZ, TODAY);
    assert.deepEqual([back.dateText, back.startText, back.endText, back.commitment], ['2026-09-25', '09:30', '10:45', 'fixed']);
  });

  test('a visit must end after it starts, and dates and times must be real', () => {
    const base = { ...visitFormInitial(null, TZ, TODAY), title: 'x' };
    assert.match(parseVisitForm({ ...base, startText: '10:00', endText: '10:00' }, TZ, create).error, /end after it starts/);
    assert.match(parseVisitForm({ ...base, dateText: '2026-02-30' }, TZ, create).error, /YYYY-MM-DD/);
    assert.match(parseVisitForm({ ...base, startText: '9am' }, TZ, create).error, /09:30/);
    assert.match(parseVisitForm({ ...base, title: '' }, TZ, create).error, /title/);
  });

  test('editing a visit carries its baseline, so a change made elsewhere makes the save stale', () => {
    let s = homeVisit(household(), fresh(), 'Plumber');
    const existing = lastEvent(s);
    const values = visitFormInitial(existing, TZ, TODAY);
    const r = parseVisitForm({ ...values, title: 'Plumber (moved)' }, TZ, { kind: 'edit', eventId: existing.id, basedOn: visitBaselineOf(existing) });
    s = { ...s, events: s.events.map((e) => ({ ...e, location: 'Changed elsewhere' })) };
    assert.equal(commitHomeChange === undefined, false);
    assert.equal(updateHomeVisitRefusal(s, r.value), 'stale');
  });
});

import { updateHomeVisit } from '../../src/features/home/model/mutations.ts';
const updateHomeVisitRefusal = (state, edit) => updateHomeVisit(state, fresh(), edit).refusal;
void addDependency;
void NOW;
