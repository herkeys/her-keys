/**
 * PHASE 6 — THE MANDATORY CROSS-SEAM TESTS (HK-F01-F13 integration audit).
 *
 * Each feature branch proved its own seams against a household holding only its own rows. These tests build ONE household holding
 * every feature's rows at once — a child (F05), a co-parent reimbursement (F07), money (F09), a career opportunity with a next action
 * and an interview (F10), a Focus with a next step (F11), a record about the child with a renewal Task (F12), and a person with a
 * follow-up (F13) — and attack the seams between them: only a canonical Task ever reaches Today and One Move, each feature reads
 * another's truth without copying or mutating it, and archiving, dangling or same-named rows never break a neighbour.
 * (Device-level seams — offline edits across features, account switch — are in integratedDevices.test.mjs.)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addFollowUp, archiveExternalPerson, followUpTaskId, openPersonContext, renamePerson, addExternalPerson, editPersonContext } from '../../src/domain/people.ts';
import { addLifeRecord, addLifeRecordTask, linkedTasksOf as recordTasksOf } from '../../src/domain/lifeRecords.ts';
import { addNextStep, addRebuildFocus } from '../../src/domain/rebuild/commands.ts';
import { openNextActions } from '../../src/domain/rebuild/read.ts';
import {
  addOpportunity, addOpportunityNextAction, hasOpenNextAction, linkedInterviewsOf, linkedTasksOf as opportunityTasksOf, scheduleOpportunityInterview,
} from '../../src/domain/opportunities.ts';
import { oneMoveForDay, resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { applyCloudTombstone } from '../../src/domain/sync/apply.ts';
import { archiveTask, completeTask, updateTask } from '../../src/domain/tasks.ts';
import { projectCalendarDay } from '../../src/features/calendar/model/projectCalendar.ts';
import { completeFollowUp, createMoneyFollowUp } from '../../src/features/coparent/mutations.ts';
import { addChildToHousehold } from '../../src/features/kids/mutations.ts';
import { buildLifeAdminView, buildRecordDetail } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { createObligation } from '../../src/features/money/mutations.ts';
import { buildMoneyHomeView } from '../../src/features/money/projection.ts';
import { reimbursementProjections } from '../../src/features/money/reimbursements.ts';
import { buildPeopleHome, peopleRows } from '../../src/features/people/projection.ts';
import { buildFocusDetail, buildRebuildHome } from '../../src/features/rebuild/model.ts';
import { mattersSection } from '../../src/features/today/model/mattersView.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, NEXT_DAY, TZ, ctx, nyInstant, nyMs } from '../support/fixtures.mjs';

const PREVIOUS_DAY = '2026-09-15';
const DRAFT_JORDAN = 'jordanfollowup0000000000000001'.slice(0, 30);
const DRAFT_COPARENT = 'coparentfollowup00000000000001'.slice(0, 30);

function onboarded(context) {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) state = toggleOnboardingOption(state, group, id);
  return completeOnboarding(state, context);
}

const ok = (result, label) => {
  const refusal = result.refusal ?? (result.outcome !== undefined && !['saved', 'added', 'already_saved'].includes(result.outcome) ? result.outcome : null);
  assert.equal(refusal ?? null, null, `${label} was refused: ${refusal}`);
  return result;
};

/** ONE household holding every feature's rows. Each piece is created through the feature's own canonical command. */
function integratedWorld() {
  const c = ctx();
  let s = onboarded(c);
  const ids = {};

  // F05 — a child, the canonical identity everything else refers to by id.
  const child = addChildToHousehold(s, c, { displayName: 'Maya', birthDate: '2016-04-02' });
  assert.equal(child.outcome, 'added');
  s = child.state;
  ids.child = child.childId;

  // F07 — a reimbursement the co-parent was asked for; the co-parent identity is created by Co-Parent.
  const reimbursement = createMoneyFollowUp(
    s, c,
    { childId: ids.child, title: 'Soccer registration', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: NEXT_DAY, notes: '' },
    { kind: 'new', displayName: 'Alex', relationship: 'co-parent' },
  );
  s = reimbursement.state;
  ids.reimbursementTask = reimbursement.id;
  ids.coParent = s.people.find((p) => p.relationship === 'co-parent').id;

  // F09 — a manual obligation due today and an autopay obligation due today.
  const bill = ok(createObligation(s, c, { title: 'Water bill', amountText: '64.20', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '' }), 'obligation');
  s = bill.state;
  ids.moneyTask = bill.id;
  const autopay = ok(createObligation(s, c, { title: 'Phone plan', amountText: '45', dueDate: DAY, paymentMechanism: 'autopay', childId: null, notes: '' }), 'autopay');
  s = autopay.state;
  ids.autopayTask = autopay.id;

  // F10 — an opportunity, its next action (a Task) due today and its interview (an Event) today.
  s = addOpportunity(s, c, { title: 'Senior analyst', organizationName: 'Northwind', opportunityType: 'job' });
  ids.opportunity = s.careerOpportunities.at(-1).id;
  const action = addOpportunityNextAction(s, c, ids.opportunity, { title: 'Send portfolio', categoryId: 'cat-work', dueDate: DAY });
  s = action.state;
  ids.opportunityTask = action.task.id;
  const interview = scheduleOpportunityInterview(s, c, ids.opportunity, { title: 'Interview', categoryId: 'cat-work', startsAt: nyInstant(14), endsAt: nyInstant(15), commitment: 'fixed' });
  s = interview.state;
  ids.interview = interview.event.id;

  // F11 — a Focus and its next step (an undated owner-private Task).
  s = addRebuildFocus(s, c, { id: 'focus-rest', title: 'Rest without guilt' });
  s = addNextStep(s, c, { focusId: 'focus-rest', title: 'Book a quiet morning', categoryId: 'cat-wellbeing', taskId: 'task-focus-step', linkId: 'link-focus-step' });
  ids.focus = 'focus-rest';
  ids.focusTask = 'task-focus-step';

  // F12 — a record ABOUT the child (by id) and its renewal Task due today.
  s = ok(addLifeRecord(s, c, { id: 'rec-passport', title: 'Passport', kind: 'document', subjectMemberId: ids.child, referenceNumber: 'P-99887766', expiresOn: '2027-03-01' }), 'record').state;
  ids.record = 'rec-passport';
  s = ok(addLifeRecordTask(s, c, { recordId: ids.record, taskId: 'task-renew-passport', linkId: 'link-renew-passport', relation: 'renewal', title: 'Renew passport', categoryId: 'cat-home', dueDate: DAY }), 'record task').state;
  ids.recordTask = 'task-renew-passport';

  // F13 — an external person with a private context and a follow-up due today.
  const jordan = ok(addExternalPerson(s, c, { displayName: 'Jordan Lee', relationshipName: 'Maya\'s coach', contextNote: 'Prefers texts' }), 'person');
  s = jordan.state;
  ids.person = jordan.id;
  ids.personContext = s.personContexts.find((ctxRow) => ctxRow.personId === ids.person).id;
  s = ok(addFollowUp(s, c, { contextId: ids.personContext, draftKey: DRAFT_JORDAN, title: 'Confirm Saturday practice', dueDate: DAY }), 'follow-up').state;
  ids.personTask = followUpTaskId(DRAFT_JORDAN);

  const validated = validateAppState(s);
  assert.equal(validated.ok, true, `the integrated household is valid: ${JSON.stringify(validated.issues ?? [])}`);
  return { state: s, ids, c };
}

const matters = (state) => mattersSection({ state, day: projectStateDay(state, DAY), nowMinutes: 10 * 60, exclude: new Set() });
const deadlineIds = (state, nowMs = MORNING) => attentionFor(state, nowMs).filter((item) => item.reason === 'deadline').map((item) => item.about.id);
/** Everything Today can say, as one string, for "never says X" checks. */
const todayText = (state) => JSON.stringify({ attention: attentionFor(state, MORNING), matters: matters(state), day: projectStateDay(state, DAY) });
/** Close every open Task on today's radar except `keep`, so the One Move decision has exactly one candidate. */
const onlyCandidate = (state, c, keep) =>
  projectStateDay(state, DAY).tasks.map((t) => t.id).filter((id) => id !== keep).reduce((next, id) => completeTask(next, c, id), state);

describe('the integrated household', () => {
  test('every feature\'s rows coexist in one valid household, each created through its own canonical command', () => {
    const { state, ids } = integratedWorld();
    assert.equal(state.children.length, 1);
    assert.equal(state.careerOpportunities.length, 1);
    assert.equal(state.rebuildFocuses.length, 1);
    assert.equal(state.lifeRecords.length, 1);
    assert.equal(state.personContexts.length, 1);
    for (const id of [ids.moneyTask, ids.autopayTask, ids.opportunityTask, ids.focusTask, ids.recordTask, ids.personTask, ids.reimbursementTask]) {
      assert.ok(state.tasks.some((t) => t.id === id), `task ${id} exists`);
    }
  });

  test('ONLY canonical Tasks reach Today, and each exactly once: no Person, Record or Focus becomes a Today item, nor an undated Opportunity', () => {
    const { state, ids } = integratedWorld();
    const deadlines = deadlineIds(state);
    for (const id of [ids.moneyTask, ids.opportunityTask, ids.recordTask, ids.personTask]) assert.equal(deadlines.filter((d) => d === id).length, 1, `${id} once`);
    // An opportunity is spoken of in Today only when SHE recorded a follow-up date or a deadline on it (F10 Addendum N/O; held by
    // doctrineClosures.test.mjs). This one has neither, so nothing about it may appear.
    for (const item of attentionFor(state, MORNING)) {
      assert.ok(['task', 'event', 'needsMe', 'responsibility'].includes(item.about.kind), `attention about ${item.about.kind}`);
    }
    const text = todayText(state);
    for (const leak of ['Jordan Lee', 'Prefers texts', 'Rest without guilt', 'P-99887766', 'Maya\'s coach']) assert.equal(text.includes(leak), false, `Today says "${leak}"`);
    const anchors = matters(state).anchors.map((a) => a.title);
    for (const title of ['Passport', 'Senior analyst', 'Jordan Lee']) assert.equal(anchors.includes(title), false, `${title} is not a Today anchor`);
  });

  test('the One Move is only ever a Task or a Needs Me item — never a person, record, Focus or opportunity id', () => {
    const { state, ids, c } = integratedWorld();
    const decided = resolveOneMoveForToday(state, c);
    const record = decided.oneMoves.find((r) => r.forDate === DAY);
    assert.ok(record, 'a decision was made');
    assert.ok(['task', 'needsMe'].includes(record.targetType), record.targetType);
    for (const notATarget of [ids.person, ids.personContext, ids.record, ids.focus, ids.opportunity, ids.child, ids.coParent]) assert.notEqual(record.targetId, notATarget);
  });
});

describe('Person -> private follow-up Task -> Today -> One Move', () => {
  test('the follow-up is ONE owner-private canonical Task linked `follow_up`; it reaches Today as a Task and can be the One Move', () => {
    const { state, ids, c } = integratedWorld();
    const task = state.tasks.find((t) => t.id === ids.personTask);
    assert.equal(task.scope, 'personal');
    assert.equal(task.title, 'Confirm Saturday practice', 'her words, no name or note copied in');
    const links = state.personTaskLinks.filter((l) => l.followUp.id === ids.personTask);
    assert.deepEqual(links.map((l) => [l.relation, l.contextId, l.scope]), [['follow_up', ids.personContext, 'personal']]);
    assert.ok(deadlineIds(state).includes(ids.personTask));
    const decided = resolveOneMoveForToday(onlyCandidate(state, c, ids.personTask), c);
    // Saved without a duration: the planning default is not her estimate, so it neither makes the Task "small" nor is quoted (HK13-D12).
    assert.equal(task.durationSource, 'default');
    assert.deepEqual(oneMoveForDay(decided, DAY), { status: 'selected', move: { id: ids.personTask, observation: 'Already on your list.', action: 'Confirm Saturday practice', effect: 'adds_work' } });
  });
});

describe('LifeRecord -> private Task -> Today', () => {
  test('the renewal Task is owner-private and reaches Today; the record, its dates and its reference number do not', () => {
    const { state, ids } = integratedWorld();
    assert.equal(state.tasks.find((t) => t.id === ids.recordTask).scope, 'personal');
    assert.deepEqual(recordTasksOf(state, ids.record).map((l) => l.taskId), [ids.recordTask]);
    assert.ok(deadlineIds(state).includes(ids.recordTask));
    assert.equal(todayText(state).includes('P-99887766'), false);
  });
});

describe('RebuildFocus -> private Task -> Today / One Move', () => {
  test('an undated next step is on her list but not on today\'s radar; dated today, it reaches Today and can be the One Move', () => {
    const { state, ids, c } = integratedWorld();
    const step = state.tasks.find((t) => t.id === ids.focusTask);
    assert.equal(step.scope, 'personal');
    assert.deepEqual(openNextActions(state, ids.focus).map((t) => t.id), [ids.focusTask]);
    assert.equal(deadlineIds(state).includes(ids.focusTask), false, 'undated: no deadline');
    assert.equal(projectStateDay(state, DAY).tasks.some((t) => t.id === ids.focusTask), false, 'undated: not on today\'s radar');

    const dated = updateTask(state, c, ids.focusTask, { dueDate: DAY });
    assert.ok(deadlineIds(dated).includes(ids.focusTask), 'dated: a Task like any other');
    const decided = resolveOneMoveForToday(onlyCandidate(dated, c, ids.focusTask), c);
    assert.equal(oneMoveForDay(decided, DAY).move.id, ids.focusTask);
  });

  test('the Focus itself adds nothing to Today: removing every Focus and link leaves Today identical', () => {
    const { state } = integratedWorld();
    const withoutFocus = { ...state, rebuildFocuses: [], rebuildFocusLinks: [] };
    assert.deepEqual(attentionFor(state, MORNING), attentionFor(withoutFocus, MORNING));
    assert.deepEqual(matters(state), matters(withoutFocus));
  });
});

describe('CareerOpportunity -> Task and CareerOpportunity -> Event', () => {
  test('the next action is a canonical Task linked `part_of` the opportunity; the opportunity stays private and its stage does not move', () => {
    const { state, ids, c } = integratedWorld();
    const task = state.tasks.find((t) => t.id === ids.opportunityTask);
    assert.equal(task.scope, 'professional', 'as private as the opportunity it serves');
    assert.deepEqual(opportunityTasksOf(state, ids.opportunity).map((t) => t.id), [ids.opportunityTask]);
    assert.equal(hasOpenNextAction(state, ids.opportunity), true);
    assert.ok(deadlineIds(state).includes(ids.opportunityTask));
    const done = completeTask(state, c, ids.opportunityTask);
    assert.equal(done.careerOpportunities[0].stage, state.careerOpportunities[0].stage, 'finishing a step never advances the stage');
    assert.equal(hasOpenNextAction(done, ids.opportunity), false);
  });

  test('the interview is a canonical Event on the calendar; after it has happened nothing advances the opportunity or creates work', () => {
    const { state, ids } = integratedWorld();
    const event = state.events.find((e) => e.id === ids.interview);
    assert.equal(event.scope, 'professional');
    assert.deepEqual(linkedInterviewsOf(state, ids.opportunity).map((e) => e.id), [ids.interview]);
    assert.ok(projectStateDay(state, DAY).events.some((e) => e.id === ids.interview));
    const calendar = projectCalendarDay({ state, date: DAY, today: DAY, nowMs: MORNING });
    assert.equal(calendar.dayItems.filter((item) => item.ref.id === ids.interview).length, 1, 'on the calendar once');
    const after = nyMs(18);
    assert.equal(attentionFor(state, after).some((item) => item.about.id === ids.opportunity && item.reason !== 'opportunity_follow_up'), false);
    assert.equal(state.careerOpportunities[0].stage, 'exploring', 'the smallest truthful default, unchanged by an Event');
  });
});

describe('Money Task -> Today and -> Calendar', () => {
  test('a manual obligation due today is a Today deadline; an autopay one due today gets no pre-due nudge; overdue autopay surfaces again', () => {
    const { state, ids, c } = integratedWorld();
    const deadlines = deadlineIds(state);
    assert.ok(deadlines.includes(ids.moneyTask));
    assert.equal(deadlines.includes(ids.autopayTask), false, 'autopay, not yet past due');
    const overdue = updateTask(state, c, ids.autopayTask, { dueDate: PREVIOUS_DAY });
    assert.ok(attentionFor(overdue, MORNING).some((item) => item.about.id === ids.autopayTask), 'past due: it surfaces again (never silence)');
  });

  test('on the calendar a money item is its Task, once — Money creates no Event', () => {
    const { state, ids } = integratedWorld();
    const moneyEvents = state.events.filter((e) => e.categoryId === 'cat-money');
    assert.deepEqual(moneyEvents, [], 'no duplicate Event for a money item');
    const calendar = projectCalendarDay({ state, date: DAY, today: DAY, nowMs: MORNING });
    assert.equal(calendar.dayItems.filter((item) => item.ref.id === ids.moneyTask).length, 1);
    assert.equal(calendar.dayItems.find((item) => item.ref.id === ids.moneyTask).ref.kind, 'task');
  });
});

describe('F07 reimbursement -> Money projection', () => {
  test('marked done by her is still not paid in Money, and Money never mutates Co-Parent\'s row', () => {
    const { state, ids, c } = integratedWorld();
    const done = completeFollowUp(state, c, ids.reimbursementTask).state;
    const before = JSON.stringify(done);
    const [projection] = reimbursementProjections(done, done.household.id, { nowMs: MORNING });
    assert.equal(projection.taskId, ids.reimbursementTask);
    assert.equal(projection.interpretation, 'marked_done_no_payment_record');
    assert.equal(projection.resolved, false, 'DONE != PAID');
    buildMoneyHomeView(done, done.household.id, { nowMs: MORNING });
    assert.equal(JSON.stringify(done), before, 'reading Money changed nothing');
  });
});

describe('the child: one canonical identity, read by id', () => {
  const renamed = (state, childId, name) => ({ ...state, children: state.children.map((ch) => (ch.id === childId ? { ...ch, displayName: name } : ch)) });

  test('a record about the child follows the child\'s CURRENT name (a pulled rename) and stores no name of its own', () => {
    const { state, ids } = integratedWorld();
    const record = state.lifeRecords.find((r) => r.id === ids.record);
    assert.equal(record.subjectMemberId, ids.child);
    assert.equal(JSON.stringify(record).includes('Maya'), false, 'the record holds the id, never the name');
    assert.ok(JSON.stringify(buildRecordDetail(state, DAY, ids.record)).includes('Maya'));
    const after = renamed(state, ids.child, 'Maya Rose');
    const detail = JSON.stringify(buildRecordDetail(after, DAY, ids.record));
    assert.ok(detail.includes('Maya Rose'), 'the current name');
    assert.equal(validateAppState(after).ok, true);
  });

  test('People shows the child from Kids\' identity (no second person), and a context about the child is keyed by the child\'s id', () => {
    const { state, ids, c } = integratedWorld();
    assert.equal(state.people.some((p) => p.displayName === 'Maya'), false, 'People created no person for the child');
    const row = peopleRows(state).find((r) => r.key === `child:${ids.child}`);
    assert.ok(row, 'the child is a People row');
    assert.equal(row.displayName, 'Maya');
    const opened = ok(openPersonContext(state, c, { kind: 'child', id: ids.child }, { contextNote: 'Allergic to wasps' }), 'child context');
    const context = opened.state.personContexts.find((x) => x.id === opened.id);
    assert.deepEqual([context.childId, context.personId], [ids.child, null]);
    const after = renamed(opened.state, ids.child, 'Maya Rose');
    assert.equal(peopleRows(after).find((r) => r.key === `child:${ids.child}`).displayName, 'Maya Rose', 'the current name, the same row');
  });
});

describe('the co-parent: Co-Parent owns the identity, People only reads it', () => {
  const coParentSlices = (state) => JSON.stringify({
    person: state.people.find((p) => p.relationship === 'co-parent'),
    responsibilities: state.responsibilities,
    coparentTasks: state.tasks.filter((t) => t.categoryId === 'cat-coparenting'),
    events: state.events,
    recurrences: state.recurrences,
  });

  test('People shows the co-parent, refuses to rename or archive them, and her private context and follow-up change nothing of F07\'s', () => {
    const { state, ids, c } = integratedWorld();
    assert.ok(peopleRows(state).some((r) => r.key === `person:${ids.coParent}`));
    assert.equal(renamePerson(state, c, ids.coParent, 'Alexandra').outcome, 'read_only_identity');
    assert.equal(archiveExternalPerson(state, c, ids.coParent).outcome, 'read_only_identity');
    const before = coParentSlices(state);
    let next = ok(openPersonContext(state, c, { kind: 'person', id: ids.coParent }, { contextNote: 'Handoffs on Sundays' }), 'co-parent context');
    const contextId = next.id;
    next = ok(editPersonContext(next.state, c, contextId, { relationshipName: 'Maya\'s dad' }), 'edit');
    next = ok(addFollowUp(next.state, c, { contextId, draftKey: DRAFT_COPARENT, title: 'Ask about the dentist', dueDate: NEXT_DAY }), 'co-parent follow-up');
    assert.equal(coParentSlices(next.state), before, 'no F07 row moved');
    const followUp = next.state.tasks.find((t) => t.id === followUpTaskId(DRAFT_COPARENT));
    assert.equal(followUp.categoryId, 'cat-relationships', 'a private Relationships Task, never a co-parenting workflow item');
    assert.equal(followUp.scope, 'personal');
  });
});

describe('archiving a linked Task leaves its parent valid', () => {
  test('each feature\'s linked Task archived: the household stays valid, every parent stays active, every view still builds', () => {
    const { state, ids, c } = integratedWorld();
    const archived = [ids.personTask, ids.recordTask, ids.focusTask, ids.opportunityTask, ids.moneyTask].reduce((next, id) => archiveTask(next, c, id), state);
    assert.equal(validateAppState(archived).ok, true);
    assert.equal(archived.personContexts[0].status, 'active');
    assert.equal(archived.lifeRecords[0].status, 'active');
    assert.equal(archived.rebuildFocuses[0].state, 'active');
    assert.equal(archived.careerOpportunities[0].stage, 'exploring');
    assert.equal(hasOpenNextAction(archived, ids.opportunity), false);
    assert.deepEqual(openNextActions(archived, ids.focus), []);
    for (const build of [
      () => buildPeopleHome(archived, DAY), () => buildLifeAdminView(archived, DAY), () => buildRecordDetail(archived, DAY, ids.record),
      () => buildRebuildHome(archived, DAY, MORNING), () => buildFocusDetail(archived, ids.focus, DAY, MORNING), () => buildMoneyHomeView(archived, archived.household.id, { nowMs: MORNING }),
    ]) build();
    const deadlines = deadlineIds(archived);
    for (const id of [ids.personTask, ids.recordTask, ids.opportunityTask, ids.moneyTask]) assert.equal(deadlines.includes(id), false, `${id} left Today`);
  });
});

describe('a deleted or tombstoned linked Task', () => {
  test('Tasks have no delete path: a pulled tombstone for a linked Task changes nothing, so no link dangles', () => {
    const { state, ids } = integratedWorld();
    for (const id of [ids.personTask, ids.recordTask, ids.focusTask, ids.opportunityTask]) assert.equal(applyCloudTombstone(state, 'task', id), state);
  });

  test('a link to a Task this device does not hold is refused by the integrity gate (so a pull that would produce one never lands)', () => {
    const { state, ids } = integratedWorld();
    const dangling = { ...state, tasks: state.tasks.filter((t) => t.id !== ids.recordTask) };
    const result = validateAppState(dangling);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.includes(ids.recordTask)), result.issues.join('; '));
  });

  test('and every view still builds, without throwing, if it is ever handed links whose Task is missing', () => {
    const { state, ids } = integratedWorld();
    const missing = new Set([ids.personTask, ids.recordTask, ids.focusTask, ids.opportunityTask]);
    const dangling = { ...state, tasks: state.tasks.filter((t) => !missing.has(t.id)) };
    buildPeopleHome(dangling, DAY);
    buildLifeAdminView(dangling, DAY);
    buildRecordDetail(dangling, DAY, ids.record);
    buildRebuildHome(dangling, DAY, MORNING);
    buildFocusDetail(dangling, ids.focus, DAY, MORNING);
    assert.equal(hasOpenNextAction(dangling, ids.opportunity), false);
    attentionFor(dangling, MORNING);
    matters(dangling);
  });
});

describe('same names and titles stay separate', () => {
  test('two people named "Jordan Lee" are two people, two rows, two contexts, and a follow-up lands on the right one', () => {
    const { state, c } = integratedWorld();
    const second = ok(addExternalPerson(state, c, { displayName: 'Jordan Lee', relationshipName: 'Neighbour' }), 'second Jordan');
    const jordans = second.state.people.filter((p) => p.displayName === 'Jordan Lee');
    assert.equal(jordans.length, 2);
    const rows = peopleRows(second.state).filter((r) => r.displayName === 'Jordan Lee');
    assert.equal(new Set(rows.map((r) => r.key)).size, 2);
    const secondContext = second.state.personContexts.find((x) => x.personId === second.id);
    const followed = ok(addFollowUp(second.state, c, { contextId: secondContext.id, draftKey: 'neighbourfollowup0000000000001', title: 'Return the ladder' }), 'neighbour follow-up');
    const link = followed.state.personTaskLinks.find((l) => l.followUp.id === followed.id);
    assert.equal(link.contextId, secondContext.id);
  });

  test('two records titled "Passport" are two records; two Focuses titled alike are two Focuses', () => {
    const { state, c } = integratedWorld();
    const twoRecords = ok(addLifeRecord(state, c, { id: 'rec-passport-2', title: 'Passport', kind: 'document' }), 'second passport').state;
    assert.equal(twoRecords.lifeRecords.filter((r) => r.title === 'Passport').length, 2);
    assert.equal(buildLifeAdminView(twoRecords, DAY) !== null, true);
    const twoFocuses = addRebuildFocus(twoRecords, c, { id: 'focus-rest-2', title: 'Rest without guilt' });
    assert.equal(twoFocuses.rebuildFocuses.filter((f) => f.title === 'Rest without guilt').length, 2, 'duplicate titles are allowed (identity is the id)');
    assert.equal(validateAppState(twoFocuses).ok, true);
  });
});
