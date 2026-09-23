/**
 * PHASE 5 — feature doctrines that were true in the code but held by no test (HK-F01-F13 integration audit).
 *
 * The Phase 5 evidence map traced every item of every feature's checklist to the test that holds it. These were true when read in the
 * source and pinned by nothing. Most are ABSENCES, or a boundary between two features, which is exactly what a later change breaks
 * without anyone noticing: an opportunity turning into an Event or into load, an interpreter kind added for a Wave 3/4 record, People or
 * Life Admin growing a routine, Money growing a split or a bank call, a record growing a file.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { INTERPRETATION_KINDS } from '../../src/domain/foundation/interpretation.ts';
import { CareerOpportunitySchema } from '../../src/domain/foundation/opportunity.ts';
import * as lifeRecordCommands from '../../src/domain/lifeRecords.ts';
import { addLifeRecord, addLifeRecordTask, archiveLifeRecord, updateLifeRecord } from '../../src/domain/lifeRecords.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { addOpportunity, scheduleOpportunityInterview, updateOpportunity } from '../../src/domain/opportunities.ts';
import { addExternalPerson, addFollowUp, archiveExternalPerson, editPersonContext, openPersonContext, renamePerson } from '../../src/domain/people.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { LifeRecordSchema, validateAppState } from '../../src/domain/state.ts';
import { LifeAdminBody } from '../../src/features/lifeAdmin/LifeAdminBody.tsx';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { createObligation, duplicateMoneyItemForward, editMoneyItem, moneyItemRevision, resolveMoneyItem } from '../../src/features/money/mutations.ts';
import { attentionView } from '../../src/features/today/model/attentionView.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ, ctx, demoState, nyInstant } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcesUnder = (dir) =>
  readdirSync(join(REPO, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(REPO, path)).isDirectory()) return sourcesUnder(path);
    return /\.(ts|tsx)$/.test(name) ? [{ path, text: readFileSync(join(REPO, path), 'utf8') }] : [];
  });
/** The declared field names of a closed (strict) object schema, whether or not it carries refinements. */
const fieldsOf = (schema) => Object.keys(schema.shape ?? schema._def?.schema?.shape ?? schema.def?.shape).sort();

function onboarded() {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) state = toggleOnboardingOption(state, group, id);
  return completeOnboarding(state, ctx());
}
const saved = (result, label) => {
  const refusal = result.refusal ?? (result.outcome !== undefined && result.outcome !== 'saved' ? result.outcome : null);
  assert.equal(refusal ?? null, null, `${label} was refused: ${refusal}`);
  return result;
};

describe('F01 × F10 — an opportunity reaches Today only through a date she recorded', () => {
  test('undated it says nothing; with a follow-up today it is one factual row — never the One Move, never load', () => {
    const c = ctx();
    const base = onboarded();
    const undated = addOpportunity(base, c, { title: 'Senior analyst', organizationName: 'Northwind', opportunityType: 'job' });
    const id = undated.careerOpportunities[0].id;
    assert.deepEqual(attentionFor(undated, MORNING).filter((item) => item.about.kind === 'opportunity'), [], 'no date, no attention (no inactivity timer)');

    const dated = updateOpportunity(undated, c, id, { followUpDate: DAY });
    const about = attentionFor(dated, MORNING).filter((item) => item.about.kind === 'opportunity');
    assert.deepEqual(about.map((item) => [item.reason, item.urgency, item.about.id]), [['opportunity_follow_up', 'today', id]]);
    const rows = attentionView(dated, MORNING, DAY, projectStateDay(dated, DAY), attentionFor(dated, MORNING), { delegated: [], unacknowledged: [] }).rows;
    const row = rows.find((r) => r.key === `opp:${id}`);
    assert.ok(row, 'Today shows the date she recorded');
    assert.equal(row.statement, 'The follow-up for “Senior analyst” at Northwind is today.', 'the fact she recorded, and nothing inferred');

    const decided = resolveOneMoveForToday(dated, c).oneMoves.find((record) => record.forDate === DAY);
    assert.ok(decided === undefined || (decided.targetType !== 'opportunity' && decided.targetId !== id), 'never the One Move');
    assert.deepEqual(projectStateDay(dated, DAY), projectStateDay(base, DAY), 'the opportunity itself adds nothing to the day or its load');
  });
});

describe('F02 — the Wave 3/4 interpretation seams stay pending', () => {
  test('a reading can become only a Task, an Event or a Needs Me item — never a person context, a record, a Focus, an opportunity or money', () => {
    assert.deepEqual([...INTERPRETATION_KINDS], ['task', 'event', 'needsMe']);
  });
});

describe('F03 × F10 — dates on an opportunity are not Events; only an interview is', () => {
  test('a deadline and a follow-up date create no Event; scheduling an interview creates exactly one, linked', () => {
    const c = ctx();
    const base = onboarded();
    const withDates = addOpportunity(base, c, { title: 'Data lead', opportunityType: 'job', applicationDeadline: DAY, followUpDate: DAY });
    assert.deepEqual(withDates.events, base.events, 'no Event from a deadline or a follow-up date');
    const moved = updateOpportunity(withDates, c, withDates.careerOpportunities[0].id, { applicationDeadline: '2026-09-20', followUpDate: '2026-09-18' });
    assert.deepEqual(moved.events, base.events, 'none from moving them either');
    const interview = scheduleOpportunityInterview(moved, c, moved.careerOpportunities[0].id, { title: 'Interview', categoryId: 'cat-work', startsAt: nyInstant(14), endsAt: nyInstant(15), commitment: 'fixed' });
    assert.equal(interview.state.events.length, base.events.length + 1);
    assert.equal(validateAppState(interview.state).ok, true);
  });
});

describe('F04 / F06 × F12, F13 — People and Life Admin grow no routine, procedure or service workflow', () => {
  test('every People and Life Admin command leaves Systems, their steps, recurrences, Events and responsibilities exactly as they were', () => {
    const c = ctx();
    const before = demoState();
    assert.ok(before.systems.length > 0 && before.events.length > 0, 'the household has Systems and Events to disturb');
    let s = before;
    const person = saved(addExternalPerson(s, c, { displayName: 'Dana Ortiz', relationshipName: 'Plumber', contextNote: 'Knows the old pipes' }), 'person');
    s = person.state;
    const contextId = s.personContexts.find((row) => row.personId === person.id).id;
    s = saved(editPersonContext(s, c, contextId, { organizationName: 'Ortiz Plumbing' }), 'context edit').state;
    s = saved(addFollowUp(s, c, { contextId, draftKey: 'plumberfollowup000000000000001', title: 'Ask Dana about the water heater', dueDate: DAY }), 'follow-up').state;
    s = saved(renamePerson(s, c, person.id, 'Dana Ortiz-Reyes'), 'rename').state;
    const child = s.children[0];
    s = saved(openPersonContext(s, c, { kind: 'child', id: child.id }, { contextNote: 'Allergic to nuts' }), 'child context').state;
    s = saved(archiveExternalPerson(s, c, person.id), 'archive person').state;
    s = saved(addLifeRecord(s, c, { id: 'rec-warranty', title: 'Water heater warranty', kind: 'document', renewBy: DAY }), 'record').state;
    s = saved(addLifeRecordTask(s, c, { recordId: 'rec-warranty', taskId: 'task-warranty', linkId: 'link-warranty', relation: 'renewal', title: 'Renew the warranty', categoryId: 'cat-home', dueDate: DAY }), 'record task').state;
    s = saved(updateLifeRecord(s, c, 'rec-warranty', { issuerName: 'Acme Heaters' }), 'record edit').state;
    s = saved(archiveLifeRecord(s, c, 'rec-warranty'), 'archive record').state;

    assert.equal(validateAppState(s).ok, true);
    for (const collection of ['systems', 'systemSteps', 'recurrences', 'events', 'responsibilities']) {
      assert.deepEqual(s[collection], before[collection], `${collection} untouched`);
    }
    assert.equal(s.tasks.length, before.tasks.length + 2, 'the only work either feature makes is the Task she asked for (a follow-up, a renewal)');
  });
});

describe('F09 — Money is one amount on one Task, recurring only by her copy, and calls nobody', () => {
  test('marking a bill paid creates no next occurrence; only her explicit copy does, and a copy or an edit never widens who can see it', () => {
    const c = ctx();
    let s = onboarded();
    const bill = saved(createObligation(s, c, { title: 'Internet', amountText: '70', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '' }), 'bill');
    s = bill.state;
    const task = s.tasks.find((t) => t.id === bill.id);
    assert.deepEqual(Object.keys(task.value).sort(), ['amountMinor', 'currency', 'direction'], 'one amount: no split, share or participant field');
    assert.equal(validateAppState({ ...s, tasks: s.tasks.map((t) => (t.id === bill.id ? { ...t, value: { ...t.value, splits: [] } } : t)) }).ok, false, 'a split is not storable');

    const edited = saved(editMoneyItem(s, c, { taskId: bill.id, baseUpdatedAt: moneyItemRevision(task), fields: { title: 'Internet', amountText: '75', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '' } }), 'edit').state;
    assert.equal(edited.tasks.find((t) => t.id === bill.id).scope, task.scope, 'an edit keeps its visibility');

    const paid = saved(resolveMoneyItem(edited, c, bill.id), 'paid').state;
    assert.equal(paid.tasks.length, edited.tasks.length, 'no next occurrence appears when she marks it paid');
    assert.deepEqual(paid.recurrences, edited.recurrences, 'and no recurrence rule');

    const privateSource = { ...paid, tasks: paid.tasks.map((t) => (t.id === bill.id ? { ...t, scope: 'personal' } : t)) };
    const copy = saved(duplicateMoneyItemForward(privateSource, c, { taskId: bill.id, nextDueDate: '2026-10-16' }), 'copy');
    assert.equal(copy.state.tasks.length, paid.tasks.length + 1, 'her copy makes exactly one new item');
    assert.equal(copy.state.tasks.find((t) => t.id === copy.id).scope, 'personal', 'a copy is exactly as private as its source');
  });

  test('no Money source calls a bank, a payment provider or the network', () => {
    const offenders = sourcesUnder('src/features/money').filter(({ text }) => /\bfetch\(|XMLHttpRequest|WebSocket|axios|plaid|stripe|\.functions\.invoke|\.rpc\(|\.from\(\s*['"]/i.test(text));
    assert.deepEqual(offenders.map((f) => f.path), []);
  });
});

describe('F10 — an opportunity is a record of her own, not an ATS, a CRM or a calendar item', () => {
  test('its stored fields are exactly these: no pipeline, no contact book, no amount, no time or duration', () => {
    assert.deepEqual(fieldsOf(CareerOpportunitySchema), [
      'applicationDeadline', 'archivedAt', 'closedReason', 'compensationNote', 'contactName', 'createdAt', 'followUpDate', 'id', 'notes',
      'opportunityType', 'organizationName', 'provenance', 'scope', 'sourceNote', 'stage', 'stageChangedAt', 'title', 'updatedAt',
    ]);
  });
});

describe('F12 — a record is metadata she keeps: no file, no link, no scan, no search, no delete, no supersession', () => {
  test('its stored fields are exactly these', () => {
    assert.deepEqual(fieldsOf(LifeRecordSchema), [
      'archivedAt', 'createdAt', 'expiresOn', 'id', 'issuedOn', 'issuerName', 'kind', 'locationHint', 'note', 'provenance', 'referenceNumber',
      'renewBy', 'reviewOn', 'scope', 'status', 'subjectMemberId', 'title', 'typeName', 'updatedAt',
    ]);
  });

  test('no command deletes a record; no Life Admin screen offers Delete, a search field, an upload or a scan', async () => {
    assert.deepEqual(Object.keys(lifeRecordCommands).filter((name) => /delete|remove|purge|destroy|supersede/i.test(name)), []);
    const screens = sourcesUnder('src/features/lifeAdmin').filter(({ path }) => path.endsWith('.tsx'));
    for (const { path, text } of screens) {
      assert.equal(/label=\{?["'`][^"'`]*(delete|search|upload|attach|scan)/i.test(text), false, `${path} offers no such control`);
      assert.equal(/expo-document-picker|expo-image-picker|expo-camera|expo-file-system/.test(text), false, `${path} touches no file or camera`);
    }
    let s = onboarded();
    s = saved(addLifeRecord(s, ctx(), { id: 'rec-1', title: 'Passport', kind: 'document' }), 'record').state;
    const r = await render(<LifeAdminBody gate={{ state: 'ready', canWrite: true }} view={buildLifeAdminView(s, DAY)} flash={null} onAddRecord={() => {}} onSkip={() => {}} onOpenRecord={() => {}} />);
    assert.equal(r.root.findAllByType('TextInput').length, 0, 'the home has no search field');
    assert.equal(r.root.findAllByType('Pressable').some((p) => /delete|search/i.test(String(p.props.accessibilityLabel ?? ''))), false);
  });
});
