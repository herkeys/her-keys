/**
 * The System editor as it renders and behaves: B · C · D · E · F · G · W · X · Y · L · AC.
 * A real store underneath: a "Save" here is a real commit, and "not saved" really wrote nothing.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/envelope.ts';
import { stepsInOrder } from '../../src/domain/structure.ts';
import { scheduleViewFor } from '../../src/features/systems/model/schedule.ts';
import { STORAGE_KEYS, rawEnvelope } from '../support/fixtures.mjs';
import { CHILDREN, DAY, ruleRow, stepRow, systemRow, withRows } from './support/canon.mjs';
import { systemsHarness } from './support/store.mjs';
import { act, allText, buttonLabels, buttons, field, labelOf, navigation, press, typeInto, withScreen } from './support/ui.mjs';

const { SystemEditor } = await import('../../src/features/systems/editor/SystemEditor.tsx');

async function open({ rows, mode = 'empty' } = {}) {
  const sh = systemsHarness({ mode });
  const store = await sh.open();
  if (rows) await store.commit((state) => withRows({ ...state, children: CHILDREN }, rows));
  return { sh, store };
}
const stateOf = (store) => store.getSnapshot().state;
const count = (r, label) => buttonLabels(r).filter((l) => l === label).length;
const selected = (r, label) => buttons(r).find((n) => labelOf(n) === label)?.props.accessibilityState?.selected === true;

const existing = () => ({
  systems: [systemRow({ id: 'sys-1', name: 'School-night reset' })],
  systemSteps: [
    stepRow({ id: 'st-1', systemId: 'sys-1', position: 0, title: 'Pack uniform' }),
    stepRow({ id: 'st-2', systemId: 'sys-1', position: 10, title: 'Fill water bottle' }),
    stepRow({ id: 'st-3', systemId: 'sys-1', position: 20, title: 'Put bag by door' }),
  ],
});

describe('Editor — creating a System', () => {
  test('B / W — name + area is enough; typing writes nothing; Save writes once and closes', async () => {
    const { sh, store } = await open();
    await withScreen(store, <SystemEditor />, async (r) => {
      assert.ok(selected(r, 'Home'), 'the Home area is a visible default');
      const writes = sh.storage.writeLog.length;

      await press(r, 'Save System');
      assert.match(allText(r), /Give this System a name\./);
      assert.equal(stateOf(store).systems.length, 0, 'a blank name writes nothing');
      assert.deepEqual(navigation.calls, [], 'and does not close');

      await typeInto(r, 'Name', 'Sunday reset');
      await press(r, 'Add a step');
      await typeInto(r, 'Step 1', 'Wipe counters');
      await typeInto(r, 'Minutes for step 1 (optional)', '10');
      assert.equal(sh.storage.writeLog.length, writes, 'the draft is presentation state: nothing reached storage');
      assert.equal(stateOf(store).systems.length, 0);

      await press(r, 'Save System');
      assert.equal(stateOf(store).systems.length, 1);
      assert.deepEqual(stepsInOrder(stateOf(store), stateOf(store).systems[0].id).map((s) => [s.title, s.effortMinutes]), [['Wipe counters', 10]]);
      assert.deepEqual(navigation.calls, [['back']]);
    });
  });

  test('X — a double tap on Save is one System, not two', async () => {
    const { store } = await open();
    await withScreen(store, <SystemEditor />, async (r) => {
      await typeInto(r, 'Name', 'Sunday reset');
      await press(r, 'Add a step');
      await typeInto(r, 'Step 1', 'Wipe counters');
      const save = buttons(r).find((n) => labelOf(n) === 'Save System');
      await act(async () => {
        await Promise.all([save.props.onPress(), save.props.onPress()]);
      });
      assert.equal(stateOf(store).systems.length, 1);
      assert.equal(stateOf(store).systemSteps.length, 1);
    });
  });

  test('a step with no words is refused by name, and steps take minutes as whole numbers or nothing', async () => {
    const { store } = await open();
    await withScreen(store, <SystemEditor />, async (r) => {
      await typeInto(r, 'Name', 'Sunday reset');
      await press(r, 'Add a step');
      await typeInto(r, 'Minutes for step 1 (optional)', '2x');
      await press(r, 'Save System');
      assert.match(allText(r), /Step 1 needs some words\./);
      assert.equal(stateOf(store).systems.length, 0);
    });
  });

  test('it never offers what does not exist: no delete, archive, duplicate, run, or child-subject control', async () => {
    const { store } = await open();
    await withScreen(store, <SystemEditor />, async (r) => {
      const text = `${buttonLabels(r).join(' | ')} ${allText(r)}`;
      assert.doesNotMatch(text, /delete|archive|duplicate|copy|start (a )?run|check off|which child|for a child/i);
    });
  });
});

describe('Editor — editing steps', () => {
  test('D / E — existing steps can be reordered and edited but never removed; the new order saves', async () => {
    const { store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      assert.equal(count(r, 'Up'), 2, 'no Up on the first step');
      assert.equal(count(r, 'Down'), 2, 'no Down on the last step');
      assert.equal(count(r, 'Remove'), 0, 'an existing step has no Remove: there is no retire semantic');

      await press(r, 'Down'); // step 1 down
      await press(r, 'Save changes');
      assert.deepEqual(stepsInOrder(stateOf(store), 'sys-1').map((s) => s.title), ['Fill water bottle', 'Pack uniform', 'Put bag by door']);
      assert.equal(stateOf(store).dependencies.length, 0, 'order created no dependency');
    });
  });

  test('a step added in this draft can be dropped before saving; nothing was ever written for it', async () => {
    const { sh, store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      const writes = sh.storage.writeLog.length;
      await press(r, 'Add a step');
      assert.equal(count(r, 'Remove'), 1);
      await press(r, 'Remove');
      assert.equal(count(r, 'Remove'), 0);
      assert.equal(sh.storage.writeLog.length, writes);
      assert.equal(stateOf(store).systemSteps.length, 3);
    });
  });
});

describe('Editor — the schedule and its preview', () => {
  test('F / G — Repeats starts as a visible weekly default; the preview is three dates, presentation-only, and matches what is saved', async () => {
    const { store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      await press(r, 'Repeats');
      assert.ok(selected(r, 'Weekly') && selected(r, 'Wed'), 'weekly, on today’s weekday, visibly');
      assert.match(allText(r), /Wed, Sep 16 · Wed, Sep 23 · Wed, Sep 30/);
      assert.match(allText(r), /A preview only\. Nothing is scheduled, and no reminder is sent\./);
      assert.equal(stateOf(store).recurrences.length, 0, 'previewing creates no rule and no occurrence');

      await press(r, 'Sun');
      assert.match(allText(r), /Wed, Sep 16 · Sun, Sep 20 · Wed, Sep 23/);
      await typeInto(r, 'Repeat every (number)', '2');
      assert.match(allText(r), /Wed, Sep 16 · Sun, Sep 27 · Wed, Sep 30/, 'every 2 weeks counts from today, and the preview says so');

      await typeInto(r, 'Time (optional, like 7:30 AM)', '7:30 pm');
      await press(r, 'Save changes');
      const after = stateOf(store);
      assert.equal(after.recurrences.length, 1);
      const [rule] = after.recurrences;
      assert.deepEqual([rule.frequency, rule.interval, rule.byWeekday, rule.timeOfDayMinutes, rule.anchorDate], ['weekly', 2, [0, 3], 1170, DAY]);
      assert.equal(scheduleViewFor(after, 'sys-1', DAY).nextExpected, DAY, 'the first previewed date is the derived next date');
      assert.equal(after.observations.length, 0, 'nothing was scheduled, sent or materialized');
    });
  });

  test('an impossible schedule is refused in words and nothing is written', async () => {
    const { store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      await press(r, 'Repeats');
      await typeInto(r, 'Repeat every (number)', '0');
      await press(r, 'Save changes');
      assert.match(allText(r), /Repeat every should be a whole number from 1 to 366\./);
      await typeInto(r, 'Repeat every (number)', '1');
      await typeInto(r, 'Time (optional, like 7:30 AM)', '25:00');
      await press(r, 'Save changes');
      assert.match(allText(r), /That doesn’t look like a time\. Try something like 7:30 AM\./);
      assert.equal(stateOf(store).recurrences.length, 0);
    });
  });

  test('L — "No schedule" is a complete choice; the System is saved without one', async () => {
    const { store } = await open();
    await withScreen(store, <SystemEditor />, async (r) => {
      assert.ok(selected(r, 'No schedule'));
      await typeInto(r, 'Name', 'Grocery reset');
      await press(r, 'Save System');
      assert.equal(stateOf(store).systems.length, 1);
      assert.equal(stateOf(store).recurrences.length, 0);
    });
  });

  test('a rule this editor cannot author is left alone unless she replaces or stops it', async () => {
    const rows = { ...existing(), recurrences: [ruleRow({ id: 'r-1', trigger: 'after_completion', frequency: 'weekly' })] };
    const { store } = await open({ rows });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      assert.match(allText(r), /This System repeats after it’s done\./);
      assert.match(allText(r), /That kind of schedule can’t be changed here\./);
      await press(r, 'Save changes');
      assert.equal(stateOf(store).recurrences[0].trigger, 'after_completion', 'untouched');
      assert.equal(stateOf(store).recurrences[0].status, 'active');
    });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      await press(r, 'Stop repeating');
      await press(r, 'Save changes');
      assert.equal(stateOf(store).recurrences[0].status, 'ended');
    });
  });
});

describe('Editor — staleness, availability and missing Systems', () => {
  test('Y — if the System changes underneath, the editor says so, blocks Save, and Load latest rebases it', async () => {
    const { store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      await typeInto(r, 'Name', 'My edit from the old screen');
      assert.doesNotMatch(allText(r), /changed while you were editing/);

      await act(() => store.commit((state) => ({ ...state, systems: state.systems.map((s) => (s.id === 'sys-1' ? { ...s, name: 'Renamed elsewhere' } : s)) })));
      assert.match(allText(r), /This System changed while you were editing/);
      assert.equal(buttons(r).find((n) => labelOf(n) === 'Save changes').props.disabled, true, 'Save is blocked, and the banner says why');

      await press(r, 'Load latest');
      assert.doesNotMatch(allText(r), /changed while you were editing/);
      assert.equal(field(r, 'Name').props.value, 'Renamed elsewhere', 'the latest version, not the old draft');
      assert.equal(stateOf(store).systems[0].name, 'Renamed elsewhere', 'and canonical state was never overwritten');
    });
  });

  test('AC — a session that cannot save shows why and offers no form', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ anything: true }, CURRENT_SCHEMA_VERSION + 1) } });
    const store = await sh.open('empty');
    await withScreen(store, <SystemEditor />, async (r) => {
      assert.match(allText(r), /This session isn’t saving changes/);
      assert.deepEqual(buttonLabels(r), []);
    });
  });

  test('editing a System that is not here says so and offers the way back', async () => {
    const { store } = await open({ rows: existing() });
    await withScreen(store, <SystemEditor systemId="nope" />, async (r) => {
      assert.match(allText(r), /This System isn’t here/);
      await press(r, 'Back to Systems');
      assert.deepEqual(navigation.calls, [['back']]);
    });
  });
});
