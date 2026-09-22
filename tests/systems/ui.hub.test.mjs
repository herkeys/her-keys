/**
 * The Systems hub as it renders: A (empty) · AB (loading) · AC (recovery) · AH (order) · N (no run).
 * Rendered with the shared react-native stub, so this proves WHAT is presented and which controls
 * exist and what they ask the router for; layout and pixels are verified in the running app.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/envelope.ts';
import { delegate } from '../../src/domain/responsibility.ts';
import { STORAGE_KEYS, rawEnvelope } from '../support/fixtures.mjs';
import { CHILDREN, DAY, MORNING, ctxAt, ruleRow, stepRow, systemRow, withRows } from './support/canon.mjs';
import { systemsHarness } from './support/store.mjs';
import { allText, buttonLabels, navigation, neverSettles, press, texts, withScreen } from './support/ui.mjs';

const { SystemsHub } = await import('../../src/features/systems/ui/SystemsHub.tsx');

const seeded = async (rows) => {
  const sh = systemsHarness();
  const store = await sh.open();
  await store.commit((state) => withRows({ ...state, children: CHILDREN }, rows));
  return store;
};

describe('Systems hub — empty, loading and unavailable are different screens', () => {
  test('A — a known-empty household: calm words, one create action, and it navigates to the editor', async () => {
    const store = await systemsHarness().open();
    await withScreen(store, <SystemsHub />, async (r) => {
      const text = allText(r);
      assert.match(text, /No Systems yet/);
      assert.match(text, /Add one whenever you’re ready/);
      assert.deepEqual(buttonLabels(r), ['Add a System']);
      await press(r, 'Add a System');
      assert.deepEqual(navigation.calls, [['push', '/systems/edit']]);
      assert.doesNotMatch(text, /organi[sz]ed|behind|should|need to/i, 'no pressure to get organized');
    });
  });

  test('AB — while state is unknown there is no empty state and no create action', async () => {
    const snapshot = { status: 'hydrating', state: null, today: null, recovery: null, persistence: 'enabled', identity: null, diagnostics: {}, persistenceDegraded: false };
    await withScreen(neverSettles(snapshot), <SystemsHub />, async (r) => {
      const text = allText(r);
      assert.match(text, /Loading your Systems/);
      assert.doesNotMatch(text, /No Systems yet/);
      assert.deepEqual(buttonLabels(r), []);
    });
  });

  test('AC — a session that cannot save shows an explanation, no Systems and no create action', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ anything: true }, CURRENT_SCHEMA_VERSION + 1) } });
    const store = await sh.open('empty');
    await withScreen(store, <SystemsHub />, async (r) => {
      const text = allText(r);
      assert.match(text, /Systems aren’t available right now/);
      assert.match(text, /newer version of Her Keys/);
      assert.doesNotMatch(text, /No Systems yet/);
      assert.deepEqual(buttonLabels(r), []);
    });
  });

  test('a start-over recovery shows a calm notice and still lets her add', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: '{ not json' } });
    const store = await sh.open('empty');
    await withScreen(store, <SystemsHub />, async (r) => {
      assert.match(allText(r), /Her Keys started over on this device/);
      assert.ok(buttonLabels(r).includes('Add a System'));
    });
  });
});

describe('Systems hub — a reusable-pattern list, not a habit tracker', () => {
  const rows = () => ({
    systems: [
      systemRow({ id: 'sys-a', name: 'Sunday reset', description: 'Twenty minutes to reset the house.' }),
      systemRow({ id: 'sys-b', name: 'School-night reset', categoryId: 'cat-kids' }),
      systemRow({ id: 'sys-c', name: 'Summer swim bag' }),
      systemRow({ id: 'sys-d', name: 'Pickup handoff' }),
    ],
    systemSteps: [
      stepRow({ id: 'st-1', systemId: 'sys-b', position: 0, title: 'Pack uniform', effortMinutes: 5 }),
      stepRow({ id: 'st-2', systemId: 'sys-b', position: 10, title: 'Fill water bottle', effortMinutes: null }),
    ],
    recurrences: [
      ruleRow({ id: 'r-a', about: { kind: 'system', id: 'sys-a' }, byWeekday: [0], anchorDate: '2026-09-01' }),
      ruleRow({ id: 'r-c', about: { kind: 'system', id: 'sys-c' }, status: 'paused' }),
    ],
  });

  test('every canonical System appears once, with its area, purpose and truthful schedule; nothing claims it is "working"', async () => {
    const store = await seeded(rows());
    await withScreen(store, <SystemsHub />, async (r) => {
      const text = allText(r);
      for (const name of ['Sunday reset', 'School-night reset', 'Summer swim bag', 'Pickup handoff']) {
        assert.equal(texts(r).filter((t) => t === name).length, 1, `${name} appears exactly once`);
      }
      assert.match(text, /Twenty minutes to reset the house/);
      assert.match(text, /next: sun, sep 20/i, 'the next expected date is derived from the rule, in the household’s calendar');
      assert.match(text, /Every week on Sunday/);
      assert.match(text, /schedule paused/i);
      assert.match(text, /no schedule/i);
      assert.match(text, /At least 5 min · 1 of 2 steps have an estimate/, 'unknown minutes are never counted as zero');
      assert.doesNotMatch(text, /working/i, 'the old hard-coded WORKING tag is gone');
    });
  });

  test('N — nothing on the hub can be checked off: no checkbox, switch or progress', async () => {
    const store = await seeded(rows());
    await withScreen(store, <SystemsHub />, async (r) => {
      const risky = r.root.findAll((n) => typeof n.type === 'string' && ['checkbox', 'switch', 'progressbar', 'radio'].includes(n.props.accessibilityRole));
      assert.equal(risky.length, 0);
    });
  });

  test('a card opens its System through the router by id', async () => {
    const store = await seeded(rows());
    await withScreen(store, <SystemsHub />, async (r) => {
      const label = buttonLabels(r).find((l) => l.startsWith('School-night reset.'));
      assert.ok(label, 'the card is one button with one spoken sentence');
      await press(r, label);
      assert.deepEqual(navigation.calls, [['push', { pathname: '/systems/[id]', params: { id: 'sys-b' } }]]);
    });
  });

  test('AH — a request she made that nobody answered comes first, with words (not colour alone)', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    await store.commit((state) => {
      const base = withRows({ ...state, children: CHILDREN }, rows());
      return delegate(base, ctxAt(MORNING, DAY), { about: { kind: 'system', id: 'sys-d' }, to: { kind: 'child', id: 'child-1' }, ackWithinMinutes: 60 });
    });
    await withScreen(store, <SystemsHub />, async (r) => {
      const cards = buttonLabels(r).filter((l) => l !== 'Add a System');
      assert.ok(cards[0].startsWith('Pickup handoff.'), `first card was: ${cards[0]}`);
      assert.match(allText(r), /Josie hasn’t answered yet/);
    });
  });
});
