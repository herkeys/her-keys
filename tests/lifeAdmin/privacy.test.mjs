/**
 * HK-FEATURE-12 — sensitive-field handling (M4, addendum N/O/P/Q/R).
 *
 * Sentinel values are planted in the reference number, the location hint and the note (and in the type and issuer, which may be
 * identifying), then every surface Life Admin can reach is scanned for them: the home view, its rendering, the Life hub summary and
 * row set, Today (attention, What Matters, One Move, briefing), the Calendar day, store diagnostics, console output, refusal
 * results and state-validation issues. Only the record's own detail may hold them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { describe, test } from 'node:test';
import { addLifeRecord, addLifeRecordTask, archiveLifeRecord, updateLifeRecord } from '../../src/domain/lifeRecords.ts';
import { oneMoveForDay } from '../../src/domain/oneMove.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { briefingFor } from '../../src/domain/reasoning/briefing.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { LifeAdminBody } from '../../src/features/lifeAdmin/LifeAdminBody.tsx';
import { buildLifeAdminView, buildRecordDetail, lifeAdminHubSummary } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { DETAIL_ONLY_FIELDS, maskReference } from '../../src/features/lifeAdmin/sensitive.ts';
import { deriveLifeStatus } from '../../src/features/life/lifeStatus.ts';
import { mattersSection } from '../../src/features/today/model/mattersView.ts';
import { at, real } from '../support/acceptance.mjs';
import { DAY, MORNING, harness, launch } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

const REF = 'REF-SENTINEL-99887766';
const LOC = 'LOCSENTINEL drawer';
const NOTE = 'NOTESENTINEL private words';
const SECRETS = [REF, 'REFSENTINEL99887766', '99887766', 'LOCSENTINEL', 'NOTESENTINEL'];

const planted = () => {
  let state = { ...real(), children: [{ id: 'child-1', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' }] };
  state = addLifeRecord(state, at(), {
    id: 'rec-1', title: 'Passport', kind: 'credential', typeName: 'Passport', issuerName: 'Issuing office', referenceNumber: REF, locationHint: LOC, note: NOTE,
    subjectMemberId: 'child-1', expiresOn: '2026-09-01', renewBy: DAY, reviewOn: DAY,
  }).state;
  state = addLifeRecordTask(state, at(), { recordId: 'rec-1', taskId: 'task-p', linkId: 'link-p', relation: 'renewal', title: 'Renew passport', categoryId: 'cat-home', dueDate: DAY }).state;
  return state;
};
const clean = (label, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of SECRETS) assert.equal(text.includes(secret), false, `${label} leaked ${secret}`);
};
const flat = (node) => [].concat(node.props.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join('');

describe('F12 masking rules (addendum N)', () => {
  test('eight or more normalised characters: only the last four; fewer: nothing; none: null', () => {
    const bullets = String.fromCharCode(0x2022).repeat(4);
    assert.equal(maskReference('AB-1234-5678'), `${bullets}5678`);
    assert.equal(maskReference(' 12 34 56 78 '), `${bullets}5678`);
    assert.equal(maskReference('ABCD-1234'), `${bullets}1234`, 'exactly eight normalised characters');
    assert.equal(maskReference('ABC-1234'), bullets, 'seven normalised characters reveal nothing');
    assert.equal(maskReference('1234'), bullets, 'a short identifier is never revealed');
    assert.equal(maskReference(null), null);
  });
});

describe('F12 sensitive values reach the record detail and nowhere else', () => {
  test('the detail holds them (reference masked by default); the home view, its rendering and the hub hold none of them', async () => {
    const state = planted();
    const detail = buildRecordDetail(state, DAY, 'rec-1');
    assert.equal(detail.referenceNumber, REF);
    assert.equal(detail.maskedReference, maskReference(REF));
    assert.equal(detail.locationHint, LOC);
    assert.equal(detail.note, NOTE);

    const view = buildLifeAdminView(state, DAY);
    clean('home view', view);
    const r = await render(<LifeAdminBody gate={{ state: 'ready', canWrite: true }} view={view} flash={null} onAddRecord={() => {}} onSkip={() => {}} onOpenRecord={() => {}} />);
    clean('rendered home', r.root.findAllByType('Text').map(flat));
    clean('rendered home labels', r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel));
    clean('Life hub summary', lifeAdminHubSummary(state, DAY));
    for (const hubSecret of ['Passport', 'Issuing office', 'Josie']) assert.equal(JSON.stringify(lifeAdminHubSummary(state, DAY)).includes(hubSecret), false, hubSecret);
    assert.deepEqual([...DETAIL_ONLY_FIELDS], ['referenceNumber', 'locationHint', 'note']);
  });

  test('Today, the Life areas, the Calendar day and the briefing carry none of them (only the linked Task, under its own title)', () => {
    const state = planted();
    clean('attention', attentionFor(state, MORNING));
    clean('What Matters', mattersSection({ state, day: projectStateDay(state, DAY), nowMinutes: 9 * 60, exclude: new Set() }));
    clean('One Move', oneMoveForDay(state, DAY));
    clean('briefing', briefingFor(state, MORNING, MORNING - 86_400_000));
    clean('Calendar day', projectStateDay(state, DAY));
    // The Life areas are derived from categories, events, tasks, systems and meals only: records are not an input at all.
    for (const file of ['../../src/features/life/lifeStatus.ts', '../../src/features/life/useLifeStatus.ts', '../../src/store/useHousehold.ts', '../../src/store/ScheduleContext.tsx']) {
      assert.equal(readFileSync(new URL(file, import.meta.url), 'utf8').includes('lifeRecord'), false, `${file} never reads records`);
    }
    assert.equal(typeof deriveLifeStatus, 'function');
  });

  test('refusals and state-validation issues name the field, never the value', () => {
    const base = planted();
    const tooLong = addLifeRecord(base, at(), { id: 'rec-2', title: 'X', kind: 'other', referenceNumber: `${REF}${'9'.repeat(80)}` });
    assert.equal(tooLong.field, 'referenceNumber');
    clean('refusal', { refusal: tooLong.refusal, field: tooLong.field, id: tooLong.id });
    const badNote = updateLifeRecord(base, at(), 'rec-1', { note: `${NOTE}${'x'.repeat(600)}` });
    clean('edit refusal', { refusal: badNote.refusal, field: badNote.field, id: badNote.id });
    const corrupted = { ...base, lifeRecords: base.lifeRecords.map((row) => ({ ...row, locationHint: `${LOC}${'y'.repeat(200)}`, note: `${NOTE}${'z'.repeat(600)}` })) };
    const verdict = validateAppState(corrupted);
    assert.equal(verdict.ok, false);
    clean('validation issues', verdict.issues);
  });

  test('store diagnostics and console output during create, edit, task, archive and relaunch carry none of them', async () => {
    const captured = [];
    const original = {};
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      original[method] = console[method];
      console[method] = (...args) => captured.push(args.map(String).join(' '));
    }
    try {
      const h = harness({ mode: 'empty' });
      const store = await launch(h);
      await store.commit((state, ctx) => addLifeRecord(state, ctx, { id: 'rec-1', title: 'Passport', kind: 'credential', referenceNumber: REF, locationHint: LOC, note: NOTE }).state);
      await store.commit((state, ctx) => addLifeRecordTask(state, ctx, { recordId: 'rec-1', taskId: 'task-p', linkId: 'link-p', relation: 'renewal', title: 'Renew passport', categoryId: 'cat-home' }).state);
      await store.commit((state, ctx) => updateLifeRecord(state, ctx, 'rec-1', { note: `${NOTE} edited` }).state);
      await store.commit((state, ctx) => archiveLifeRecord(state, ctx, 'rec-1').state);
      await store.flush();
      await launch(h);
      clean('store diagnostics', h.diagnostics);
    } finally {
      for (const method of Object.keys(original)) console[method] = original[method];
    }
    clean('console output', captured);
  });
});
