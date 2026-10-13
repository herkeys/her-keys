/**
 * HK-INTEGRATION-READINESS-01 / HA-011 — the System editor's contract for "who it is for", as the screen model.
 *
 * B2B-N01 exposes the existing model through a consumer chooser. Interaction tests cover both native platforms;
 * model tests retain eligible choices, refusal words and stale-editor protection.
 * The hook is driven through a real store, so a Save is a real commit and a refused save really wrote nothing.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Platform } from 'react-native';
import { CHILDREN, DAY, MORNING, childSystemRow, realHousehold, systemRow, withRows } from './support/canon.mjs';
import { systemsHarness } from './support/store.mjs';
import { act, allText, buttons, labelOf, navigation, press, typeInto, withScreen } from './support/ui.mjs';

const { useSystemEditor } = await import('../../src/features/systems/editor/useSystemEditor.ts');
const { SystemEditor } = await import('../../src/features/systems/editor/SystemEditor.tsx');

const stateOf = (store) => store.getSnapshot().state;
const isSelected = (r, label) => buttons(r).find((node) => labelOf(node) === label)?.props.accessibilityState.selected === true;

for (const platform of ['android', 'ios']) {
  test(`B2B-N01 ${platform}: consumer chooses, saves, restarts, edits and clears a child`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      const h = systemsHarness();
      const store = await h.open();
      await store.commit((state) => ({ ...state, children: CHILDREN }));
      await withScreen(store, <SystemEditor />, async (r) => {
        assert.ok(isSelected(r, 'The whole household'));
        assert.ok(buttons(r).some((node) => labelOf(node) === 'For Josie'));
        assert.ok(buttons(r).some((node) => labelOf(node) === 'For Theo'));
        await typeInto(r, 'Name', 'Bedtime');
        await press(r, 'For Josie');
        assert.ok(isSelected(r, 'For Josie'));
        assert.equal(isSelected(r, 'The whole household'), false);
        assert.equal(stateOf(store).systems.length, 0, 'choosing does not persist before Save');
        await press(r, 'Save System');
      });
      await store.flush();
      const restarted = await h.open();
      const id = stateOf(restarted).systems[0].id;
      assert.equal(stateOf(restarted).systems[0].subjectMemberId, 'child-1');
      await withScreen(restarted, <SystemEditor systemId={id} />, async (r) => {
        assert.ok(isSelected(r, 'For Josie'), 'saved association is shown on edit');
        await press(r, 'For Theo');
        await press(r, 'Save changes');
      });
      await restarted.flush();
      const edited = await h.open();
      assert.equal(stateOf(edited).systems[0].subjectMemberId, 'child-2');
      await withScreen(edited, <SystemEditor systemId={id} />, async (r) => {
        assert.ok(isSelected(r, 'For Theo'));
        await press(r, 'The whole household');
        await press(r, 'Save changes');
      });
      await edited.flush();
      const cleared = stateOf(await h.open()).systems[0];
      assert.equal(cleared.subjectMemberId, null);
      assert.equal(cleared.scope, 'household');
    } finally { Platform.OS = previous; }
  });
}

test('B2B-N01: no children means only household scope, not invented choices', async () => {
  const store = await systemsHarness().open();
  await withScreen(store, <SystemEditor />, async (r) => {
    assert.ok(isSelected(r, 'The whole household'));
    assert.equal(buttons(r).filter((node) => /^For /.test(labelOf(node))).length, 0);
  });
});

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
  test('B2B-N01: a refused save keeps the child selection, reports failure and leaves the editor open', async () => {
    let failWrites = false;
    const h = systemsHarness({ storageOptions: { failWrite: () => failWrites } });
    const store = await h.open();
    await store.commit((state) => ({ ...state, children: CHILDREN }));
    await store.flush();
    failWrites = true;
    await withScreen(store, <SystemEditor />, async (r) => {
      await typeInto(r, 'Name', 'Bedtime');
      await press(r, 'For Josie');
      await press(r, 'Save System');
      assert.ok(isSelected(r, 'For Josie'));
      assert.match(allText(r), /couldn’t save that yet/);
      assert.equal(stateOf(store).systems.length, 0);
      assert.deepEqual(navigation.calls, []);
    });
    failWrites = false;
    await store.flush();
  });
  test('a row that names a child this household does not have: Save says so calmly, commits nothing, and does not close', async () => {
    const store = showing({ ...realHousehold({ children: CHILDREN }), systems: [systemRow({ id: 'sys-1', name: 'Bedtime', scope: 'child', subjectMemberId: 'child-gone' })] });
    await withScreen(store, <SystemEditor systemId="sys-1" />, async (r) => {
      assert.match(allText(r), /doesn’t have which child recorded/);
      assert.equal(isSelected(r, 'The whole household'), false, 'missing association is not silently cleared');
      await press(r, 'Save changes');
      assert.match(allText(r), /That child isn’t in your household\. Choose one of your children, or leave it for the whole household\./);
      assert.equal(store.commits, 0, 'nothing was committed');
      assert.deepEqual(navigation.calls, []);
      await press(r, 'The whole household');
      assert.ok(isSelected(r, 'The whole household'), 'consumer may explicitly clear an unavailable association');
    });
  });
});
