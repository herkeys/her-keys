/**
 * HK-INTEGRATION-READINESS-01 / HA-011 — the System editor's contract for "who it is for", as the screen model.
 *
 * The visual chooser is deliberately NOT rendered by this branch (design-system placement is integration's); what integration needs
 * is exactly what is asserted here: `subjectChoices` (the household's own children and nobody else), `actions.setSubject`, the
 * refusal words when a subject is not one of them, and a stale banner that fires when the subject changes underneath the editor.
 * The hook is driven through a real store, so a Save is a real commit and a refused save really wrote nothing.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CHILDREN, DAY, MORNING, childSystemRow, realHousehold, systemRow, withRows } from './support/canon.mjs';
import { systemsHarness } from './support/store.mjs';
import { act, allText, navigation, press, withScreen } from './support/ui.mjs';

const { useSystemEditor } = await import('../../src/features/systems/editor/useSystemEditor.ts');
const { SystemEditor } = await import('../../src/features/systems/editor/SystemEditor.tsx');

const stateOf = (store) => store.getSnapshot().state;

async function openStore(rows) {
  const store = await systemsHarness().open();
  await store.commit((state) => withRows({ ...state, children: CHILDREN }, rows ?? {}));
  return store;
}

/** Mounts the editor's hook without any control, so its model can be read and driven directly. */
function probe() {
  const box = { current: null };
  function Probe({ systemId }) {
    box.current = useSystemEditor(systemId);
    return null;
  }
  return { box, Probe };
}

/** A store that shows exactly the state it is handed WITHOUT validating it, and counts commits: the only way to see a row the household cannot resolve. */
const showing = (state) => {
  const snapshot = { status: 'ready', state, today: DAY, recovery: null, persistence: 'enabled', nowMs: MORNING };
  const store = { commits: 0, getSnapshot: () => snapshot, subscribe: () => () => {}, hydrate: async () => {}, refreshDay: () => {}, commit: async () => { store.commits += 1; return true; } };
  return store;
};

describe('the editor model offers the household’s children, and only them', () => {
  test('subjectChoices are the existing children; setSubject → save writes child scope AND that child; the default is a household routine', async () => {
    const store = await openStore();
    const { box, Probe } = probe();
    await withScreen(store, <Probe />, async () => {
      assert.deepEqual(box.current.subjectChoices, [{ id: 'child-1', name: 'Josie' }, { id: 'child-2', name: 'Theo' }]);
      assert.equal(box.current.draft.subjectMemberId, null, 'never defaulted to a child');

      await act(() => box.current.actions.setName('Josie bedtime'));
      await act(() => box.current.actions.setSubject('child-1'));
      assert.equal(box.current.draft.subjectMemberId, 'child-1');
      assert.deepEqual(box.current.issues, []);
      assert.equal(stateOf(store).systems.length, 0, 'choosing a child is presentation state: nothing is written until Save');

      await act(() => box.current.actions.save());
      const [row] = stateOf(store).systems;
      assert.deepEqual([row.name, row.scope, row.subjectMemberId], ['Josie bedtime', 'child', 'child-1']);
      assert.deepEqual(navigation.calls, [['back']]);
    });
  });

  test('a household with no children offers none, and a household routine saves with a null subject', async () => {
    const store = await systemsHarness().open();
    const { box, Probe } = probe();
    await withScreen(store, <Probe />, async () => {
      assert.deepEqual(box.current.subjectChoices, []);
      await act(() => box.current.actions.setName('Sunday reset'));
      await act(() => box.current.actions.save());
      assert.deepEqual([stateOf(store).systems[0].scope, stateOf(store).systems[0].subjectMemberId], ['household', null]);
    });
  });

  test('a subject that is not a child of this household is an issue on the "subject" field and Save writes nothing', async () => {
    const store = await openStore({ systems: [systemRow({ id: 'sys-1', name: 'Bedtime' })] });
    const { box, Probe } = probe();
    await withScreen(store, <Probe systemId="sys-1" />, async () => {
      for (const bad of [stateOf(store).user.id, 'child-nope', 'Josie']) {
        await act(() => box.current.actions.setSubject(bad));
        assert.deepEqual(box.current.issues, [{ code: 'subject_unavailable', field: 'subject' }], String(bad));
        const before = stateOf(store);
        await act(() => box.current.actions.save());
        assert.equal(stateOf(store), before, 'nothing written');
        assert.deepEqual(navigation.calls, [], 'and the editor did not close');
      }
      await act(() => box.current.actions.setSubject('child-2'));
      assert.deepEqual(box.current.issues, [], 'choosing a real child clears it');
    });
  });

  test('editing keeps the child through an unrelated change, and setSubject(null) returns it to the household', async () => {
    const store = await openStore({ systems: [childSystemRow('child-1', { id: 'sys-1', name: 'Bedtime' })] });
    const { box, Probe } = probe();
    await withScreen(store, <Probe systemId="sys-1" />, async () => {
      assert.equal(box.current.draft.subjectMemberId, 'child-1', 'the editor opened on the child the System names');
      await act(() => box.current.actions.setName('Bedtime wind-down'));
      await act(() => box.current.actions.save());
      assert.deepEqual([stateOf(store).systems[0].name, stateOf(store).systems[0].scope, stateOf(store).systems[0].subjectMemberId], ['Bedtime wind-down', 'child', 'child-1']);
    });
    const again = probe();
    await withScreen(store, <again.Probe systemId="sys-1" />, async () => {
      await act(() => again.box.current.actions.setSubject(null));
      await act(() => again.box.current.actions.save());
      assert.deepEqual([stateOf(store).systems[0].scope, stateOf(store).systems[0].subjectMemberId], ['household', null]);
    });
  });
});

describe('a stale editor and the subject', () => {
  test('the editor goes stale when the child changes underneath it, and its save is refused (the newer child stands)', async () => {
    const store = await openStore({ systems: [childSystemRow('child-1', { id: 'sys-1', name: 'Bedtime' })] });
    const { box, Probe } = probe();
    await withScreen(store, <Probe systemId="sys-1" />, async () => {
      assert.equal(box.current.stale, false);
      await act(() => store.commit((state) => ({ ...state, systems: state.systems.map((s) => ({ ...s, subjectMemberId: 'child-2' })) })));
      assert.equal(box.current.stale, true, 'a subject change is a change the editor must notice');
      await act(() => box.current.actions.setName('Edited on the old screen'));
      const after = stateOf(store);
      await act(() => box.current.actions.save());
      assert.equal(stateOf(store), after, 'nothing written');
      assert.equal(stateOf(store).systems[0].subjectMemberId, 'child-2');
      assert.deepEqual(navigation.calls, []);

      await act(() => box.current.actions.reload());
      assert.equal(box.current.stale, false);
      assert.equal(box.current.draft.subjectMemberId, 'child-2', 'reloading picks up the newer child');
    });
  });

  test('the screen says so in words (the stale banner), not with a silent failure', async () => {
    const store = await openStore({ systems: [childSystemRow('child-1', { id: 'sys-1', name: 'Bedtime' })] });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      assert.doesNotMatch(allText(r), /changed while you were editing/);
      await act(() => store.commit((state) => ({ ...state, systems: state.systems.map((s) => ({ ...s, subjectMemberId: 'child-2' })) })));
      assert.match(allText(r), /This System changed while you were editing/);
    });
  });
});

describe('the refusal reaches the screen in words, through the copy module', () => {
  test('a row that names a child this household does not have: Save says so calmly, commits nothing, and does not close', async () => {
    const store = showing({ ...realHousehold({ children: CHILDREN }), systems: [systemRow({ id: 'sys-1', name: 'Bedtime', scope: 'child', subjectMemberId: 'child-gone' })] });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      await press(r, 'Save changes');
      assert.match(allText(r), /That child isn’t in your household\. Choose one of your children, or leave it for the whole household\./);
      assert.equal(store.commits, 0, 'nothing was committed');
      assert.deepEqual(navigation.calls, []);
    });
  });
});
