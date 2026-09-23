/**
 * HK-FEATURE-12 — the Life Admin screen, rendered (M4).
 *
 * The pure views are rendered without providers; the CONTAINER is rendered against a REAL store (in-memory repository), so what
 * is asserted about opening, cancelling and saving is what the household actually holds and what was actually written.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { addLifeRecord } from '../../src/domain/lifeRecords.ts';
import { LifeAdminBody } from '../../src/features/lifeAdmin/LifeAdminBody.tsx';
import { LifeAdminContainer } from '../../src/features/lifeAdmin/LifeAdminContainer.tsx';
import { LIFE_ADMIN_COPY as COPY } from '../../src/features/lifeAdmin/lifeAdminCopy.ts';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { maskReference } from '../../src/features/lifeAdmin/sensitive.ts';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

const TODAY = '2026-09-16';
const READY = { state: 'ready', canWrite: true };
const noop = () => {};

const flat = (node) => [].concat(node.props.children ?? []).map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : '')).join('');
const texts = (r) => r.root.findAllByType('Text').map(flat);
const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).filter((p) => p.props.accessibilityLabel === label);
const startsWith = (r, prefix) => pressables(r).filter((p) => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.startsWith(prefix));
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const inputs = (r) => r.root.findAllByType('TextInput');
const type = async (input, text) => TestRenderer.act(async () => input.props.onChangeText(text));

const body = (view, over = {}) => render(<LifeAdminBody gate={READY} view={view} flash={null} onAddRecord={noop} onSkip={noop} onOpenRecord={noop} {...over} />);
const withRecords = (specs, base = real()) => specs.reduce((s, spec) => addLifeRecord(s, at(), { kind: 'other', ...spec }).state, base);

describe('F12 home view', () => {
  test('loading and recovery never claim she has no records, and offer no writes', async () => {
    const loading = await body(buildLifeAdminView(real(), TODAY), { gate: { state: 'loading', canWrite: false } });
    assert.ok(texts(loading).includes(COPY.loading));
    assert.equal(texts(loading).includes(COPY.emptyTitle), false);
    assert.equal(byLabel(loading, COPY.addRecord).length, 0);
    const recovery = await body(buildLifeAdminView(real(), TODAY), { gate: { state: 'recovery', canWrite: false } });
    assert.ok(texts(recovery).includes(COPY.recoveryTitle));
    assert.equal(texts(recovery).includes(COPY.emptyTitle), false);
  });

  test('the zero-record empty state is short and calm, offers Add record and Skip, and asks for no inventory', async () => {
    let skipped = 0;
    const r = await body(buildLifeAdminView(real(), TODAY), { onSkip: () => (skipped += 1) });
    const all = texts(r);
    assert.ok(all.includes('Add one record you don’t want to keep track of in your head.'));
    assert.equal(byLabel(r, COPY.addRecord).length, 1);
    await press(byLabel(r, COPY.skip)[0]);
    assert.equal(skipped, 1);
    assert.equal(all.some((t) => /categor|inventory|all your documents|set up/i.test(t)), false);
  });

  test('Needs Review shows at most three, then See all reveals the rest; the verdict is one plain sentence', async () => {
    const state = withRecords([1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, title: `Record ${i}`, renewBy: `2026-09-0${i}` })));
    const r = await body(buildLifeAdminView(state, TODAY));
    assert.ok(texts(r).includes('5 records need review.'));
    assert.equal(startsWith(r, 'Record ').filter((p) => /Renew-by date was/.test(p.props.accessibilityLabel)).length, 3 + 5, 'three under Needs Review, five under Records');
    await press(byLabel(r, COPY.seeAll(5))[0]);
    assert.equal(startsWith(r, 'Record ').filter((p) => /Renew-by date was/.test(p.props.accessibilityLabel)).length, 5 + 5);
  });

  test('archived records are one tap away, not on the active list', async () => {
    let state = withRecords([{ id: 'r1', title: 'Old lease' }]);
    const { archiveLifeRecord } = await import('../../src/domain/lifeRecords.ts');
    state = archiveLifeRecord(state, at(), 'r1').state;
    const r = await body(buildLifeAdminView(state, TODAY));
    assert.equal(startsWith(r, 'Old lease').length, 0);
    await press(byLabel(r, COPY.showArchived(1))[0]);
    assert.equal(startsWith(r, 'Old lease').length, 1);
  });
});

/** The container, driven by a real store: re-renders on every store change, as the app does. */
function Live({ store, onOpenTask = noop, onSkip = noop }) {
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <LifeAdminContainer
      state={snapshot.state}
      today={snapshot.today}
      gateInput={{ storeStatus: snapshot.status, persistence: snapshot.persistence, syncHydration: null }}
      store={store}
      onOpenTask={onOpenTask}
      onSkip={onSkip}
    />
  );
}

async function liveWith(setup) {
  const h = harness({ mode: 'empty' });
  const store = await launch(h);
  if (setup) await store.commit(setup);
  await store.flush();
  const r = await render(<Live store={store} />);
  return { h, store, r, writes: () => h.primaryWrites().length, state: () => store.getSnapshot().state };
}

describe('F12 container against a real store — opening creates NOTHING; saving creates exactly one of each', () => {
  test('opening and cancelling the Add record sheet writes nothing; saving a title-only record writes one record', async () => {
    const live = await liveWith(null);
    const before = live.writes();
    await press(byLabel(live.r, COPY.addRecord)[0]);
    assert.ok(texts(live.r).includes(COPY.sheetAddTitle));
    await live.store.flush();
    assert.equal(live.writes(), before, 'opening wrote nothing');
    assert.equal(live.state().lifeRecords.length, 0);
    await press(byLabel(live.r, COPY.cancel)[0]);
    await live.store.flush();
    assert.equal(live.writes(), before, 'cancelling wrote nothing');

    await press(byLabel(live.r, COPY.addRecord)[0]);
    await type(inputs(live.r)[0], 'Passport');
    await press(byLabel(live.r, COPY.save)[0]);
    await live.store.flush();
    assert.equal(live.state().lifeRecords.length, 1);
    assert.equal(live.state().lifeRecords[0].title, 'Passport');
    assert.equal(live.state().tasks.length, 0, 'a record is never a Task');
  });

  test('Add renewal task: opening and cancelling create nothing; saving (even twice, quickly) creates ONE owner-private Task and ONE link', async () => {
    const live = await liveWith((state, ctx) => addLifeRecord(state, ctx, { id: 'rec-1', title: 'Passport', kind: 'credential', renewBy: '2026-10-01' }).state);
    const tasksBefore = live.state().tasks.length;
    const writesBefore = live.writes();

    await press(startsWith(live.r, 'Passport')[0]);
    await press(byLabel(live.r, COPY.addRenewalTask)[0]);
    assert.ok(texts(live.r).includes(COPY.taskSheetTitle.renewal));
    assert.ok(inputs(live.r).some((input) => input.props.value === 'Renew Passport'), 'the suggested title is visible and editable');
    await live.store.flush();
    assert.equal(live.state().tasks.length, tasksBefore);
    assert.equal(live.state().lifeRecordLinks.length, 0);
    assert.equal(live.writes(), writesBefore, 'opening the task flow wrote nothing');

    await press(byLabel(live.r, COPY.cancel)[0]);
    await live.store.flush();
    assert.equal(live.state().tasks.length, tasksBefore, 'cancelling created no Task');
    assert.equal(live.state().lifeRecordLinks.length, 0, 'cancelling created no link');

    await press(byLabel(live.r, COPY.addRenewalTask)[0]);
    const save = byLabel(live.r, COPY.addTask)[0];
    assert.equal(save.props.disabled, true, 'no category chosen yet: nothing can be saved');
    const firstCategory = live.state().categories.filter((c) => c.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder)[0];
    await press(byLabel(live.r, firstCategory.name)[0]);
    const button = byLabel(live.r, COPY.addTask)[0];
    await TestRenderer.act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    await live.store.flush();
    const state = live.state();
    assert.equal(state.tasks.length, tasksBefore + 1, 'one accepted creation -> one Task');
    assert.equal(state.lifeRecordLinks.length, 1, 'one accepted creation -> one link');
    const task = state.tasks.find((row) => row.id === state.lifeRecordLinks[0].taskId);
    assert.equal(task.scope, 'personal');
    assert.equal(task.title, 'Renew Passport');
    assert.equal(task.dueDate, null, 'the renew-by date was offered, not applied');
    assert.equal(task.categoryId, firstCategory.id);
  });

  test('the reference is masked until Reveal, and the reveal does not survive leaving the record', async () => {
    const live = await liveWith((state, ctx) => addLifeRecord(state, ctx, { id: 'rec-1', title: 'Insurance', kind: 'policy', referenceNumber: 'POL-1234-5678' }).state);
    assert.equal(texts(live.r).some((t) => t.includes('POL-1234-5678') || t.includes('5678')), false, 'the home shows no reference at all');
    await press(startsWith(live.r, 'Insurance')[0]);
    assert.ok(texts(live.r).includes(maskReference('POL-1234-5678')));
    assert.equal(texts(live.r).includes('POL-1234-5678'), false);
    await press(byLabel(live.r, COPY.reveal)[0]);
    assert.ok(texts(live.r).includes('POL-1234-5678'));
    await press(byLabel(live.r, COPY.close)[0]);
    await press(startsWith(live.r, 'Insurance')[0]);
    assert.equal(texts(live.r).includes('POL-1234-5678'), false, 'reopened: masked again');
    assert.ok(texts(live.r).includes(COPY.copyUnavailable), 'Copy is said to be unavailable rather than silently missing');
    assert.equal(JSON.stringify(live.h.storage.contents()).includes('revealed'), false, 'no reveal state is stored');
  });

  test('archiving from the detail keeps the record (archived) and leaves its Task exactly as it was', async () => {
    const live = await liveWith((state, ctx) => addLifeRecord(state, ctx, { id: 'rec-1', title: 'Old lease', kind: 'document' }).state);
    await live.store.commit((state, ctx) => {
      const { addLifeRecordTask } = LIFE;
      return addLifeRecordTask(state, ctx, { recordId: 'rec-1', taskId: 'task-l', linkId: 'link-l', relation: 'follow_up', title: 'Return keys', categoryId: 'cat-home' }).state;
    });
    const taskBefore = live.state().tasks.find((task) => task.id === 'task-l');
    await press(startsWith(live.r, 'Old lease')[0]);
    await press(byLabel(live.r, COPY.archive)[0]);
    await live.store.flush();
    const state = live.state();
    assert.equal(state.lifeRecords[0].status, 'archived');
    assert.equal(state.tasks.find((task) => task.id === 'task-l'), taskBefore);
    assert.ok(texts(live.r).includes(COPY.archivedFlash));
  });
});

const LIFE = await import('../../src/domain/lifeRecords.ts');

describe('F12 boundaries of the presentational layer', () => {
  test('the pure views import no store, no router, no persistence and no platform module, and never read a clock', () => {
    const dir = fileURLToPath(new URL('../../src/features/lifeAdmin/', import.meta.url));
    for (const name of ['LifeAdminBody.tsx', 'RecordSheet.tsx', 'RecordDetailSheet.tsx', 'RecordTaskSheet.tsx', 'lifeAdminView.ts', 'sensitive.ts', 'lifeAdminDates.ts', 'lifeAdminCopy.ts']) {
      const text = readFileSync(dir + name, 'utf8');
      assert.equal(/from 'expo-router'|store\/|persistence\/|platform\/|Date\.now|new Date\(/.test(text), false, name);
    }
    const container = readFileSync(dir + 'LifeAdminContainer.tsx', 'utf8');
    assert.equal(/from 'expo-router'|store\/(AppStateProvider|AccountProvider)|console\./.test(container), false, 'the container holds no router, no store hook and no log line');
    for (const name of readdirSync(dir)) assert.equal(/console\.|fetch\(|supabase|analytics|Sentry|posthog/i.test(readFileSync(dir + name, 'utf8')), false, `${name}: no logging, network or telemetry`);
  });
});
