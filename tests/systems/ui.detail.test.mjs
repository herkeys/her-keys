/**
 * The System detail screen as it renders: N · J · K · M · V · AF · AI · AC.
 * Driven through a real store, so every button press is a real committed change.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/envelope.ts';
import { STORAGE_KEYS, rawEnvelope } from '../support/fixtures.mjs';
import { AUTOMATION, CHILDREN, T0, USER, ruleRow, stepRow, systemRow, withRows } from './support/canon.mjs';
import { systemsHarness } from './support/store.mjs';
import { allText, buttonLabels, navigation, press, pressLast, withScreen } from './support/ui.mjs';

const { SystemDetail } = await import('../../src/features/systems/ui/SystemDetail.tsx');

async function storeWith(rows, { children = CHILDREN } = {}) {
  const store = await systemsHarness().open();
  await store.commit((state) => withRows({ ...state, children }, rows));
  return store;
}
const stateOf = (store) => store.getSnapshot().state;

const schoolNight = () => ({
  systems: [systemRow({ id: 'sys-1', name: 'School-night reset', description: 'Bag, bottle, uniform.', categoryId: 'cat-kids' })],
  systemSteps: [
    stepRow({ id: 'st-1', systemId: 'sys-1', position: 0, title: 'Pack uniform', effortMinutes: 5 }),
    stepRow({ id: 'st-2', systemId: 'sys-1', position: 10, title: 'Fill water bottle', effortMinutes: null }),
    stepRow({ id: 'st-3', systemId: 'sys-1', position: 20, title: 'Put bag by door', effortMinutes: 10 }),
  ],
  recurrences: [ruleRow({ id: 'r-1', byWeekday: [0], anchorDate: '2026-09-01', timeOfDayMinutes: 1140 })],
});

describe('System detail — the reusable blueprint', () => {
  test('N — ordered steps are content, not a checklist: no checkbox, no progress, no "done", nothing to complete', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      const text = allText(r);
      assert.match(text, /School-night reset/);
      assert.match(text, /Bag, bottle, uniform\./);
      assert.ok(text.indexOf('Pack uniform') < text.indexOf('Fill water bottle') && text.indexOf('Fill water bottle') < text.indexOf('Put bag by door'), 'steps read in order');
      assert.match(text, /At least 15 min · 2 of 3 steps have an estimate/, 'unknown is not zero');
      assert.match(text, /Every week on Sunday at 7:00 PM/);
      assert.match(text, /Next expected: Sun, Sep 20/);
      assert.doesNotMatch(text, /\bdone\b|completed|progress|streak|well done|great job/i);
      const interactive = r.root.findAll((n) => typeof n.type === 'string' && ['checkbox', 'switch', 'radio', 'progressbar'].includes(n.props.accessibilityRole));
      assert.equal(interactive.length, 0);
      // each step is ONE spoken item, in order
      const spoken = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Step '));
      assert.deepEqual(spoken.map((n) => n.props.accessibilityLabel), ['Step 1: Pack uniform, about 5 minutes', 'Step 2: Fill water bottle', 'Step 3: Put bag by door, about 10 minutes']);
    });
  });

  test('V — archive, delete, duplicate and run controls are ABSENT, not disabled; only real actions are offered', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      const labels = buttonLabels(r);
      for (const gone of [/delete/i, /archive/i, /duplicate|copy/i, /start|begin|run\b/i, /complete|mark done|check off/i, /remove/i]) {
        assert.equal(labels.some((l) => gone.test(l)), false, `no button matching ${gone}`);
      }
      assert.deepEqual(labels.slice().sort(), ['Ask someone to take this', 'Edit', 'Pause schedule', 'Show details', 'Skip Sun, Sep 20', 'Stop repeating'].sort());
      assert.equal(r.root.findAll((n) => typeof n.type === 'string' && n.props.disabled === true && n.props.accessibilityRole === 'button').length, 0, 'no disabled decoy buttons');
    });
  });

  test('Edit asks the router for the editor of THIS System', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Edit');
      assert.deepEqual(navigation.calls, [['push', { pathname: '/systems/edit', params: { id: 'sys-1' } }]]);
    });
  });

  test('a System that is not here says so calmly and offers the way back', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="nope" />, async (r) => {
      assert.match(allText(r), /This System isn’t here/);
      await press(r, 'Back to Systems');
      assert.deepEqual(navigation.calls, [['back']]);
    });
  });

  test('AC — in a session that cannot save, a System is not shown and nothing can be changed', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ anything: true }, CURRENT_SCHEMA_VERSION + 1) } });
    const store = await sh.open('empty');
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      assert.match(allText(r), /Systems aren’t available right now/);
      assert.deepEqual(buttonLabels(r), []);
    });
  });
});

describe('System detail — the schedule acts on the schedule', () => {
  test('M — pause and resume are real commits, and the screen re-derives from canonical state', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Pause schedule');
      assert.equal(stateOf(store).recurrences[0].status, 'paused');
      assert.match(allText(r), /This schedule is paused, so no date is expected until you resume it/);
      assert.doesNotMatch(allText(r), /Next expected/, 'a paused schedule is not presented as actively recurring');
      assert.ok(buttonLabels(r).includes('Resume schedule') && !buttonLabels(r).includes('Pause schedule') && !buttonLabels(r).some((l) => l.startsWith('Skip')));
      await press(r, 'Resume schedule');
      assert.equal(stateOf(store).recurrences[0].status, 'active');
      assert.match(allText(r), /Next expected: Sun, Sep 20/);
    });
  });

  test('skipping is confirmed, says plainly it cannot be undone, and records ONE neutral skip', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Skip Sun, Sep 20');
      assert.match(allText(r), /Skip Sun, Sep 20\?/);
      assert.match(allText(r), /Skipping is recorded and can’t be undone/);
      await press(r, 'Keep it');
      assert.equal(stateOf(store).observations.filter((o) => o.outcome === 'skipped').length, 0, 'declining the confirmation writes nothing');

      await press(r, 'Skip Sun, Sep 20');
      await press(r, 'Skip it');
      assert.deepEqual(stateOf(store).observations.filter((o) => o.outcome === 'skipped').map((o) => o.plannedDate), ['2026-09-20']);
      assert.match(allText(r), /Skipped: Sun, Sep 20/);
      assert.match(allText(r), /Next expected: Sun, Sep 27/);
      assert.equal(stateOf(store).recurrences[0].status, 'active', 'a skipped occurrence is not a disabled System');
      assert.doesNotMatch(allText(r), /missed|failed|behind|streak/i);
    });
  });

  test('stopping asks first, keeps the steps, and offers a new schedule instead', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Stop repeating');
      assert.match(allText(r), /Its steps stay, and you can set a new schedule any time/);
      await pressLast(r, 'Stop repeating'); // the confirm button inside the open sheet
      assert.equal(stateOf(store).recurrences[0].status, 'ended');
      assert.equal(stateOf(store).systemSteps.length, 3);
      assert.match(allText(r), /stopped repeating/i);
      assert.ok(buttonLabels(r).includes('Set a schedule'));
    });
  });
});

describe('System detail — who is responsible', () => {
  test('J — the handoff is a request, then seen, then yes: each its own recorded fact, in words', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      assert.match(allText(r), /Nobody has been asked to take this/);
      await press(r, 'Ask someone to take this');
      assert.deepEqual(buttonLabels(r).filter((l) => ['Josie', 'Theo'].includes(l)), ['Josie', 'Theo'], 'only children and people that exist can be chosen');
      await press(r, 'Josie');
      assert.match(allText(r), /Asked of Josie\. They haven’t answered yet\./);
      assert.equal(stateOf(store).responsibilities[0].state, 'requested');
      assert.doesNotMatch(allText(r), /said yes|accepted/i);

      await press(r, 'What did they say?');
      await press(r, 'They’ve seen it');
      assert.match(allText(r), /Josie has seen this\. They haven’t said yes yet\./);
      await press(r, 'What did they say?');
      await press(r, 'They said yes');
      assert.match(allText(r), /Josie said yes\./);
      assert.deepEqual(stateOf(store).observations.filter((o) => o.about.kind === 'responsibility').map((o) => o.outcome), ['delegated', 'acknowledged', 'accepted']);
    });
  });

  test('taking it back returns it to her, and she can hand it to someone else', async () => {
    const store = await storeWith(schoolNight());
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Ask someone to take this');
      await press(r, 'Josie');
      await press(r, 'Take it back');
      assert.match(allText(r), /This came back to you/);
      assert.ok(buttonLabels(r).includes('Ask someone to take this'));
      await press(r, 'Ask someone to take this');
      await press(r, 'Theo');
      assert.match(allText(r), /Asked of Theo/);
    });
  });

  test('K — with nobody to choose, assignment is not offered and no section pretends otherwise', async () => {
    const store = await storeWith(schoolNight(), { children: [] });
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      assert.equal(buttonLabels(r).some((l) => /ask someone/i.test(l)), false);
      assert.doesNotMatch(allText(r), /Who’s responsible/i);
      assert.equal(stateOf(store).people.length, 0, 'and no person was invented');
    });
  });
});

describe('System detail — details, provenance and what Her Keys itself recorded', () => {
  test('AI — a child-scoped System that cannot name its child says so; nothing guesses', async () => {
    const legacy = { systems: [systemRow({ id: 'sys-1', name: 'Old bedtime routine', scope: 'child', provenance: { producer: 'ai-inference', artifactId: null, confidence: 'possible' } })] };
    const store = await storeWith(legacy);
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Show details');
      assert.match(allText(r), /marked as being for a child, but Her Keys doesn’t have which child recorded/);
      assert.match(allText(r), /Her Keys inferred this/);
      assert.match(allText(r), /POSSIBLE/);
    });
  });

  test('AF — a failed attempt reads as not working, a proposal as waiting, and no dead approve/decline buttons appear', async () => {
    const intent = (id) => ({ id, category: 'financial_action', about: { kind: 'system', id: 'sys-1' }, consequence: 'critical', reversibility: 'irreversible', summaryCode: 'pay_utility', amount: { amountMinor: 4200, currency: 'USD', direction: 'outflow' }, provider: null, permittedMode: 'ask_approval', createdAt: T0, expiresAt: null, provenance: AUTOMATION, scope: 'personal' });
    const store = await storeWith({ systems: [systemRow({ id: 'sys-1', name: 'Bill review' })] });
    await store.commit((state) => ({
      ...state,
      intents: [intent('i-1'), intent('i-2')],
      decisions: [{ id: 'd-1', intentId: 'i-1', decision: 'approved', basis: 'explicit', authorityId: null, decidedAt: T0, createdAt: T0, provenance: USER, scope: 'personal' }],
      executions: [{ id: 'e-1', intentId: 'i-1', decisionId: 'd-1', authorityId: null, attempt: 1, attemptedAt: T0, provider: null, externalActionId: null, externalReferenceId: null, result: 'failed', errorClass: 'transient', reversibility: 'irreversible', compensationCode: null, compensatesExecutionId: null, createdAt: T0, provenance: AUTOMATION, scope: 'personal' }],
      outcomes: [],
    }));
    await withScreen(store, <SystemDetail systemId="sys-1" />, async (r) => {
      await press(r, 'Show details');
      const text = allText(r);
      assert.match(text, /Didn’t work — needs you/i, 'a failed attempt is never shown as done');
      assert.match(text, /Waiting for your answer/);
      assert.doesNotMatch(text, /Done|Verified|Paid|succeeded/i);
      assert.equal(buttonLabels(r).some((l) => /go ahead|^No$/i.test(l)), false, 'a proposal here has no dead approve/decline buttons');
    });
  });
});
