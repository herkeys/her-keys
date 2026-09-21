/**
 * HK-FEATURE-06 / HM3 — COPY-TRUTH AUDIT and ACCESSIBILITY of the words Home says.
 *
 * Every fact a row states has a `code`. Here each code is bound to a predicate over the canonical item that must be TRUE for the
 * wording to be used, so a claim can never outrun its evidence. Then every string Home can emit is scanned for the words it may
 * never assert — fixed, repaired, safe, verified, resolved, handled, all clear, caught up, "never done" — which are allowed only
 * inside an explicit "not known" statement.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archiveCategory } from '../../src/domain/categories.ts';
import { buildHomeView } from '../../src/features/home/model/buildHomeView.ts';
import { ACTION_LABEL, HOME_COPY, NEVER_ASSERTED, NOT_A_CLAIM, REFUSAL_COPY, SECTION_NOTE, SECTION_TITLE, describeItem, describeRepeat, spoken } from '../../src/features/home/copy.ts';
import { NOW, SAM, TODAY, TZ, accept, acknowledge, addDependency, archiveTask, completeTask, delegate, denseHousehold, fresh, homeTask, homeVisit, household, lastTask, makeCtx, repeating, atLocal } from '../support/homeFixtures.mjs';

const copyContext = { today: TODAY, timeZone: TZ };

/** code -> a predicate that must hold on the canonical item for the wording to be truthful. */
const EVIDENCE = {
  attention_no_answer: (i) => i.attentionFacts.some((a) => a.reason === 'unacknowledged_delegation') && i.responsibility.coverage === 'no_answer',
  attention_high_consequence: (i) => i.attentionFacts.some((a) => a.reason === 'risk'),
  attention_source_changed: (i) => i.attentionFacts.some((a) => a.reason === 'external_source_changed'),
  due_overdue: (i) => i.timing.some((t) => t.kind === 'due' && t.when === 'overdue'),
  due_today: (i) => i.timing.some((t) => t.kind === 'due' && t.when === 'today'),
  due_tomorrow: (i) => i.timing.some((t) => t.kind === 'due' && t.when === 'tomorrow'),
  due_later: (i) => i.timing.some((t) => t.kind === 'due' && t.when === 'later'),
  planned_earlier: (i) => i.timing.some((t) => t.kind === 'planned' && t.when === 'earlier'),
  planned_today: (i) => i.timing.some((t) => t.kind === 'planned' && t.when === 'today'),
  planned_tomorrow: (i) => i.timing.some((t) => t.kind === 'planned' && t.when === 'tomorrow'),
  planned_later: (i) => i.timing.some((t) => t.kind === 'planned' && t.when === 'later'),
  visit_now: (i) => i.canonicalKind === 'event' && i.scheduledState === 'scheduled_visit' && i.timing.some((t) => t.kind === 'visit' && t.when === 'now'),
  visit_scheduled: (i) => i.canonicalKind === 'event' && i.scheduledState === 'scheduled_visit',
  visit_outcome_unknown: (i) => i.canonicalKind === 'event' && i.unknownFacts.includes('visit_outcome_unknown'),
  visit_location: (i) => i.canonicalKind === 'event' && Boolean(i.location),
  no_due_date: (i) => i.unknownFacts.includes('no_due_date') && i.timing.length === 0,
  dependency_waiting: (i) => i.dependency.readiness === 'blocked' && i.dependency.prerequisites.some((p) => p.standing === 'pending'),
  dependency_unavailable: (i) => i.dependency.readiness === 'needsReview' && i.dependency.prerequisites.some((p) => p.standing === 'unavailable'),
  coverage_asked: (i) => i.responsibility.coverage === 'asked' && i.responsibility.state === 'requested',
  coverage_seen: (i) => i.responsibility.coverage === 'seen' && i.responsibility.state === 'acknowledged',
  coverage_accepted_needs_you: (i) => i.responsibility.coverage === 'accepted_needs_you' && i.responsibility.state === 'accepted' && i.responsibility.stillNeedsMe !== false,
  coverage_covered: (i) => i.responsibility.coverage === 'covered' && i.responsibility.state === 'accepted' && i.responsibility.stillNeedsMe === false,
  coverage_declined: (i) => i.responsibility.coverage === 'declined',
  coverage_returned: (i) => i.responsibility.coverage === 'returned',
  coverage_reported_finished: (i) => i.responsibility.coverage === 'reported_finished' && i.responsibility.completedAt !== null,
  repeat_rule: (i) => i.recurrence.state === 'active' && i.recurrence.rule !== null,
  repeat_paused: (i) => i.recurrence.state === 'paused' && i.recurrence.rule !== null,
  next_expected: (i) => i.recurrence.nextExpected !== null && i.recurrence.nextExpectedBasis === 'schedule_rule',
  last_done: (i) => i.lastDone !== null && ['completion_observation', 'task_completed_at', 'system_completion_observation'].includes(i.lastDone.evidence),
  no_completion_recorded: (i) => i.lastDone === null && i.lastDoneApplicable && (i.recurrence.state === 'active' || i.recurrence.state === 'paused' || i.canonicalKind === 'system'),
  duration_user: (i) => i.duration.kind === 'task' && i.duration.knowledge === 'user-provided',
  duration_default: (i) => i.duration.kind === 'task' && i.duration.knowledge === 'default-estimate',
  duration_inferred: (i) => i.duration.kind === 'task' && i.duration.knowledge === 'inferred-estimate',
  duration_unrecorded: (i) => i.duration.kind === 'task' && i.duration.knowledge === 'unrecorded',
  condition_not_verified: (i) => i.resolutionState === 'marked_done',
  provider_not_verified: (i) => i.responsibility.holder?.relationship === 'contractor',
};

/** A household exercising every state Home can word. */
function everyState() {
  const ctx = fresh();
  let s = household();
  const add = (title, extra) => { s = homeTask(s, ctx, title, extra); return lastTask(s).id; };
  const ask = (id, then) => {
    s = delegate(s, ctx, { about: { kind: 'task', id }, to: { kind: 'person', id: SAM(s) }, ackWithinMinutes: 120 });
    const rid = s.responsibilities[s.responsibilities.length - 1].id;
    if (then) s = then(s, rid);
  };
  add('overdue', { dueDate: '2026-09-18' });
  add('due today', { dueDate: TODAY });
  add('due tomorrow', { dueDate: '2026-09-22' });
  add('due later', { dueDate: '2026-10-05' });
  add('undated');
  add('planned today', { plan: { kind: 'day', date: TODAY } });
  add('planned later', { plan: { kind: 'day', date: '2026-09-30' } });
  add('planned earlier', { plan: { kind: 'day', date: '2026-09-15' } });
  add('unrecorded duration', { durationMinutes: 15, durationSource: null });
  add('default duration', { durationMinutes: 15, durationSource: 'default' });
  add('inferred duration', { durationMinutes: 15, durationSource: 'inferred' });
  ask(add('asked'));
  ask(add('seen'), (st, rid) => acknowledge(st, ctx, rid));
  ask(add('accepted needs you'), (st, rid) => accept(st, ctx, rid, true));
  ask(add('covered'), (st, rid) => accept(st, ctx, rid, false));
  const requires = add('needs first');
  const first = add('first');
  s = addDependency(s, ctx, { relation: 'requires', from: { kind: 'task', id: requires }, to: { kind: 'task', id: first } }).state;
  const gone = add('needs gone');
  const goneTo = add('to be set aside');
  s = addDependency(s, ctx, { relation: 'requires', from: { kind: 'task', id: gone }, to: { kind: 'task', id: goneTo } }).state;
  s = archiveTask(s, ctx, goneTo);
  const repeats = add('repeats, no completion');
  s = repeating(s, ctx, repeats);
  const doneRepeats = add('repeats and done');
  s = repeating(s, ctx, doneRepeats);
  s = completeTask(s, makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k-'), doneRepeats);
  const done = add('marked done');
  s = completeTask(s, ctx, done);
  s = homeVisit(s, ctx, 'visit later', { date: '2026-09-25' });
  s = homeVisit(s, ctx, 'visit today', { date: TODAY, from: [14, 0], to: [15, 0] });
  s = homeVisit(s, ctx, 'visit earlier today', { date: TODAY, from: [8, 0], to: [9, 0] });
  s = homeVisit(s, ctx, 'visit past', { date: '2026-09-19', location: '12 Elm St' });
  s = { ...s, systems: [{ id: 'sys-1', name: 'Seasonal checks', description: 'Twice a year', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
  return s;
}

const allFacts = () => {
  const view = buildHomeView(everyState(), NOW);
  const dense = buildHomeView(denseHousehold({ homeTasks: 120, otherTasks: 10 }), NOW);
  return [...view.items, ...dense.items].map((item) => ({ item, row: describeItem(item, copyContext) }));
};

describe('COPY-TRUTH — every claim maps to canonical evidence', () => {
  test('every stated fact has a known evidence code, and that evidence is TRUE for the item it is stated about', () => {
    const rows = allFacts();
    const seen = new Set();
    for (const { item, row } of rows) {
      for (const fact of row.facts) {
        seen.add(fact.code);
        assert.ok(EVIDENCE[fact.code], `unknown claim code: ${fact.code}`);
        assert.ok(EVIDENCE[fact.code](item), `"${fact.text}" (${fact.code}) is stated about ${item.homeItemId} without its evidence`);
      }
    }
    // The audit is only meaningful if the fixtures actually exercise the wording.
    for (const code of ['due_overdue', 'due_today', 'coverage_asked', 'coverage_seen', 'coverage_accepted_needs_you', 'coverage_covered', 'dependency_waiting', 'dependency_unavailable', 'repeat_rule', 'next_expected', 'last_done', 'no_completion_recorded', 'duration_user', 'duration_default', 'duration_inferred', 'duration_unrecorded', 'condition_not_verified', 'visit_scheduled', 'visit_outcome_unknown', 'provider_not_verified', 'no_due_date', 'visit_location']) {
      assert.ok(seen.has(code), `the audit fixtures never produced ${code}`);
    }
  });

  test('the strong words are used ONLY where the record proves them: none of them appears as an assertion anywhere', () => {
    for (const { item, row } of allFacts()) {
      for (const fact of row.facts) {
        if (NOT_A_CLAIM.includes(fact.code)) continue;
        assert.ok(!NEVER_ASSERTED.test(fact.text), `${item.homeItemId}: "${fact.text}" asserts something Home cannot know`);
        assert.ok(!/\b(covered|handled|completed|ready|never|safe)\b/i.test(fact.text), `${item.homeItemId}: "${fact.text}" uses a claim word`);
      }
    }
  });

  test('the "not known" statements exist exactly where the evidence says something is not known', () => {
    for (const { item, row } of allFacts()) {
      const codes = row.facts.map((f) => f.code);
      assert.equal(codes.includes('condition_not_verified'), item.resolutionState === 'marked_done', `${item.homeItemId}: a marked-done task says the condition is not verified`);
      assert.equal(codes.includes('visit_outcome_unknown'), item.unknownFacts.includes('visit_outcome_unknown'));
    }
  });

  test('a repeat rule is described as a rule, never as something done: no completion wording comes from a rule alone', () => {
    const view = buildHomeView(everyState(), NOW);
    const item = view.items.find((i) => i.title === 'repeats, no completion');
    const codes = describeItem(item, copyContext).facts.map((f) => f.code);
    assert.ok(codes.includes('repeat_rule') && codes.includes('no_completion_recorded'));
    assert.ok(!codes.includes('last_done'));
    const text = describeItem(item, copyContext).facts.map((f) => f.text).join(' | ');
    assert.match(text, /No completion recorded/);
    assert.doesNotMatch(text, /\bnever\b/i, 'no completion record is not "never done"');
  });

  test('a completed task never reads as fixed, repaired, safe or verified — it reads "Marked done" and says Her Keys does not check', () => {
    const view = buildHomeView(everyState(), NOW);
    const row = describeItem(view.items.find((i) => i.title === 'marked done'), copyContext);
    const text = row.facts.map((f) => f.text).join(' | ');
    assert.match(text, /Marked done/);
    assert.match(text, /doesn’t check that the problem is actually fixed/);
    assert.doesNotMatch(row.facts.filter((f) => f.code !== 'condition_not_verified').map((f) => f.text).join(' '), NEVER_ASSERTED);
  });

  test('a visit is worded as scheduled, and a past visit says Her Keys does not know whether it happened', () => {
    const view = buildHomeView(everyState(), NOW);
    const text = (title) => describeItem(view.items.find((i) => i.title === title), copyContext).facts.map((f) => f.text).join(' | ');
    assert.match(text('visit later'), /^Scheduled /);
    assert.match(text('visit past'), /doesn’t know whether this happened/);
    assert.match(text('visit earlier today'), /Earlier today.*doesn’t know whether this happened/);
  });
});

describe('COPY-TRUTH — every string Home can emit', () => {
  const strings = () => {
    const out = [];
    const walk = (v) => { if (typeof v === 'string') out.push(v); else if (typeof v === 'function') { for (const args of [[ 'Home', false ], [ 'Home', true ], [true], [false], ['read_failed', true], ['future_version', false], ['mode_mismatch', false], ['invalid_state', true], [3]]) { try { const r = v(...args); walk(r); } catch { /* not that arity */ } } } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(HOME_COPY); walk(REFUSAL_COPY); walk(ACTION_LABEL); walk(SECTION_TITLE); walk(SECTION_NOTE);
    return out;
  };

  test('nothing Home can say asserts an all-clear, a fix, a safety, a verification or a handled state', () => {
    const all = strings();
    assert.ok(all.length > 40);
    for (const text of all) assert.ok(!NEVER_ASSERTED.test(text), `asserts something Home cannot know: "${text}"`);
    for (const text of all) assert.ok(!/\b(caught up|all set|all clear|nothing to worry|you’re good|everything is)\b/i.test(text), text);
  });

  test('AH. an empty Home says what it knows and what it does not — never that the house is fine', () => {
    for (const anySaved of [false, true]) {
      const body = HOME_COPY.empty.body(anySaved);
      assert.match(body, /only knows what you’ve added/);
      assert.match(body, /doesn’t mean nothing at home needs attention/);
      assert.doesNotMatch(HOME_COPY.empty.title('Home', anySaved), /clear|fine|good|nothing needs/i);
    }
    assert.notEqual(HOME_COPY.empty.title('Home', true), HOME_COPY.empty.title('Home', false), 'nothing saved and nothing open are different statements');
    assert.match(HOME_COPY.scope('House stuff'), /can’t see the house itself/);
  });

  test('unrecovered and missing states say what happened and say nothing about the house', () => {
    for (const [reason, quarantined] of [['invalid_state', true], ['read_failed', false], ['future_version', false], ['mode_mismatch', false]]) {
      const u = HOME_COPY.unrecovered(reason, quarantined);
      assert.match(u.body, /says nothing about the house itself/);
    }
    assert.match(HOME_COPY.unrecovered('invalid_state', true).body, /kept aside, not deleted/);
    assert.doesNotMatch(HOME_COPY.unrecovered('invalid_state', false).body, /kept aside/, 'it does not claim data was kept when it was not');
    assert.match(HOME_COPY.missing.body, /says nothing about the house itself/);
  });

  test('every refusal Home can return has words', () => {
    for (const reason of ['no_home_context', 'context_archived', 'not_found', 'not_a_home_record', 'invalid_input', 'stale', 'wrong_state', 'already_delegated', 'invalid_holder', 'nothing_to_answer', 'refused', 'not_saved']) {
      assert.ok(REFUSAL_COPY[reason] && REFUSAL_COPY[reason].length > 10, reason);
    }
  });

  test('affordance audit: no placeholder, fake reminder, notification, AI, covered, repair or safety affordance anywhere in Home copy', () => {
    const banned = /\b(coming soon|todo|tbd|not implemented|lorem|placeholder|reminder set|notify|notification|ai-powered|smart suggestion)\b/i;
    for (const text of strings()) assert.doesNotMatch(text, banned, text);
  });

  test('describeRepeat words a rule and only a rule', () => {
    assert.equal(describeRepeat({ trigger: 'schedule', frequency: 'monthly', interval: 3, byWeekday: null, byMonthDay: null, anchorDate: '2026-06-12' }), 'every 3 months');
    assert.equal(describeRepeat({ trigger: 'schedule', frequency: 'weekly', interval: 1, byWeekday: [2], byMonthDay: null, anchorDate: '2026-06-12' }), 'every week on Tuesday');
    assert.equal(describeRepeat({ trigger: 'after_completion', frequency: 'yearly', interval: 1, byWeekday: null, byMonthDay: null, anchorDate: '2026-06-12' }), 'every year after it’s done');
    assert.equal(describeRepeat({ trigger: 'manual', frequency: null, interval: 1, byWeekday: null, byMonthDay: null, anchorDate: '2026-06-12' }), 'when you start it');
  });
});

describe('ACCESSIBILITY — what a screen reader is told is built from the same facts, and carries every critical state', () => {
  const label = (title) => describeItem(buildHomeView(everyState(), NOW).items.find((i) => i.title === title), copyContext).accessibilityLabel;

  test('AZ. responsibility state is spoken: asked, seen, accepted (still needs you), covered', () => {
    assert.match(label('asked'), /Asked Sam, no answer yet/);
    assert.match(label('seen'), /Sam has seen this, hasn’t said yes/);
    assert.match(label('accepted needs you'), /Sam said yes, it still needs you/);
    assert.match(label('covered'), /said yes, and you’ve marked it as not needing you/);
  });

  test('BA. unknown, default and completion state are spoken', () => {
    assert.match(label('default duration'), /planning estimate, not from you/);
    assert.match(label('inferred duration'), /estimated by Her Keys/);
    assert.match(label('unrecorded duration'), /Duration not recorded/);
    assert.match(label('undated'), /No due date/);
    assert.match(label('repeats, no completion'), /No completion recorded/);
    assert.match(label('marked done'), /Marked done.*doesn’t check that the problem is actually fixed/);
    assert.match(label('visit past'), /doesn’t know whether this happened/);
  });

  test('dependency and timing state are spoken, and the kind of thing is named', () => {
    assert.match(label('needs first'), /^Task: needs first\./);
    assert.match(label('needs first'), /Needs “first” first/);
    assert.match(label('needs gone'), /was set aside/);
    assert.match(label('overdue'), /Overdue, was due Fri, Sep 18/);
    assert.match(label('visit later'), /^Visit: visit later\. Scheduled/);
    assert.match(label('Seasonal checks'), /^Routine: Seasonal checks/);
  });

  test('critical state never relies on color: every fact that is styled as attention states itself in words', () => {
    for (const { row } of allFacts()) {
      for (const fact of row.facts) assert.ok(fact.text.trim().length > 3, fact.code);
      assert.ok(row.facts.every((f) => row.accessibilityLabel.includes(spoken(f.text))), 'the spoken label carries every stated fact');
      assert.doesNotMatch(row.accessibilityLabel, / [,.]|[—–]/, 'and reads cleanly: no orphaned punctuation or dashes');
    }
  });

  test('an archived Home area is stated in words', () => {
    assert.match(HOME_COPY.archived.title, /archived/);
    void archiveCategory;
  });
});
