/**
 * HK-OCR-ASSIST — the F12 integration seam, proven against a REAL store.
 *
 * `ScanEntryPoint` and `ocrNativeAdapter` reach real native modules (camera, photo picker, the OCR engine) that this Node harness
 * cannot load (see `ocrArchitectureGuard.test.mjs` for why, and for the static proof that neither file can save anything
 * regardless). What this file proves instead, end to end, against a real in-memory repository: values shaped exactly like what
 * the OCR review screen hands back (`OcrReviewScreen.onUseValues`, proven in `ocrReview.test.mjs`) reach Life Admin through the
 * SAME, unmodified `RecordSheet` -> `submitRecord` -> `addLifeRecord` path manual entry already uses — opening writes nothing,
 * only her own Save writes anything, and what gets written carries the same `user-action` provenance a typed record gets. No
 * `ai-inference` producer is ever created by this feature.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { addLifeRecord } from '../../src/domain/lifeRecords.ts';
import { LifeAdminContainer } from '../../src/features/lifeAdmin/LifeAdminContainer.tsx';
import { LIFE_ADMIN_COPY as COPY } from '../../src/features/lifeAdmin/lifeAdminCopy.ts';
import { EMPTY_RECORD_VALUES, RecordSheet } from '../../src/features/lifeAdmin/RecordSheet.tsx';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).filter((p) => p.props.accessibilityLabel === label);
const inputs = (r) => r.root.findAllByType('TextInput');
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const type = async (input, text) => TestRenderer.act(async () => input.props.onChangeText(text));

// What OcrReviewScreen.onUseValues would hand back after she assigned a date and an issuer (proven in ocrReview.test.mjs).
const OCR_ASSIGNED = { title: '', expiresOn: '2027-03-15', issuerName: 'Acme Insurance Co.' };

function Live({ store }) {
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <LifeAdminContainer
      state={snapshot.state}
      today={snapshot.today}
      gateInput={{ storeStatus: snapshot.status, persistence: snapshot.persistence, syncHydration: null }}
      store={store}
      onOpenTask={() => {}}
      onSkip={() => {}}
    />
  );
}

async function liveWith(setup) {
  const h = harness({ mode: 'empty' });
  const store = await launch(h);
  if (setup) await store.commit(setup);
  await store.flush();
  const r = await render(<Live store={store} />);
  return { store, r, state: () => store.getSnapshot().state };
}

describe('OCR -> F12: the review screen only ever pre-fills the existing, unmodified Add-record form', () => {
  test('a form pre-filled with OCR-assigned values shows them, unconfirmed, and saves nothing merely by being open', async () => {
    const initial = { ...EMPTY_RECORD_VALUES, ...OCR_ASSIGNED, title: 'Auto policy' };
    let submitted = null;
    const r = await render(
      <RecordSheet visible mode="create" initial={initial} childOptions={[]} notice={null} busy={false} canWrite onSubmit={(v) => (submitted = v)} onClose={() => {}} />
    );
    assert.ok(inputs(r).some((i) => i.props.value === 'Auto policy'));
    assert.ok(inputs(r).some((i) => i.props.value === 'Acme Insurance Co.'));
    assert.ok(inputs(r).some((i) => i.props.value === '2027-03-15'));
    assert.equal(submitted, null, 'rendering the pre-filled form calls no submit handler');
  });

  test('opening Add record and saving OCR-shaped values writes exactly one record, with default (user-action) provenance — never ai-inference', async () => {
    const live = await liveWith(null);
    await press(byLabel(live.r, COPY.addRecord)[0]);
    assert.equal(live.state().lifeRecords.length, 0, 'opening the form wrote nothing');

    const findInput = (label) => inputs(live.r).find((i) => i.props.accessibilityLabel === label);
    await type(findInput(COPY.fieldTitle), 'Auto policy');
    await press(byLabel(live.r, COPY.optionalDetails)[0]);
    await type(findInput(COPY.fieldIssuer), OCR_ASSIGNED.issuerName);
    await type(findInput(COPY.fieldExpires), OCR_ASSIGNED.expiresOn);
    await press(byLabel(live.r, COPY.save)[0]);
    await live.store.flush();

    const records = live.state().lifeRecords;
    assert.equal(records.length, 1);
    assert.equal(records[0].title, 'Auto policy');
    assert.equal(records[0].issuerName, OCR_ASSIGNED.issuerName);
    assert.equal(records[0].expiresOn, OCR_ASSIGNED.expiresOn);
    assert.equal(records[0].provenance.producer, 'user-action', 'an OCR-assisted save carries the same provenance manual entry gets');
    assert.equal(records[0].provenance.producer === 'ai-inference', false);
    assert.equal(records[0].provenance.confidence, null, 'user-action never carries a confidence level');
  });

  test('cancelling out of the pre-filled form (Cancel, or the sheet\'s own dismiss) writes nothing', async () => {
    const live = await liveWith(null);
    await press(byLabel(live.r, COPY.addRecord)[0]);
    await type(inputs(live.r)[0], 'Would-be policy');
    await press(byLabel(live.r, COPY.cancel)[0]);
    await live.store.flush();
    assert.equal(live.state().lifeRecords.length, 0);
  });
});

describe('OCR -> F12: the domain command itself never assigns ai-inference provenance when called the way this feature calls it', () => {
  test('addLifeRecord with no provenance argument (exactly how this feature calls it) defaults to user-action, not ai-inference', () => {
    const result = addLifeRecord(real(), at(), { id: 'r1', title: 'Auto policy', kind: 'other', expiresOn: '2027-03-15', issuerName: 'Acme Insurance Co.' });
    assert.equal(result.refusal, null);
    assert.equal(result.state.lifeRecords[0].provenance.producer, 'user-action');
  });
});
