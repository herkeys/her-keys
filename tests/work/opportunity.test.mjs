import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CareerOpportunitySchema, OPPORTUNITY_CLOSED_REASONS, OPPORTUNITY_STAGES, isOpportunityOpen } from '../../src/domain/foundation/opportunity.ts';
import { DEPENDENCY_REF_KINDS } from '../../src/domain/foundation/structure.ts';
import { CONTENT_REF_KINDS, TYPED_REF_KINDS } from '../../src/domain/foundation/typedRef.ts';
import {
  addOpportunity,
  addOpportunityNextAction,
  archiveOpportunity,
  hasOpenNextAction,
  linkedInterviewsOf,
  linkedTasksOf,
  openLinkedTaskCount,
  restoreOpportunity,
  scheduleOpportunityInterview,
  setOpportunityStage,
  updateOpportunity,
} from '../../src/domain/opportunities.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { workCareerAttention, workCareerVerdict } from '../../src/domain/reasoning/workCareer.ts';
import { completeTask } from '../../src/domain/tasks.ts';
import { ONE_MOVE_TARGET_TYPES, validateAppState } from '../../src/domain/state.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { completeOnboarding } from '../../src/domain/onboarding.ts';
import { MORNING, DAY, TZ } from '../support/fixtures.mjs';

/**
 * HK-FEATURE-10 — Work/Career OS. Doctrine tests, ADDENDUM AD's eight required mutation targets, and the
 * adversarial scenarios the F10 prompt names. Each doctrine test is written so that reverting the fix it
 * guards makes it fail — see scripts-dev/f10-mutation-check.cjs for the automated proof.
 *
 * `ctx()` (unlike fixtures.mjs's own, single-transition helper) shares ONE monotonic id counter per test,
 * matching the pattern every other multi-entity suite in this repo uses (e.g. tests/foundationOps.test.mjs) —
 * a fresh-per-call counter would mint the SAME id for two different opportunities in one test.
 */
let n = 0;
const ctx = (overrides = {}) => ({ nowMs: MORNING, today: DAY, createId: (p) => `${p}-${++n}`, ...overrides });

const real = () => {
  let s = createEmptyState(TZ);
  s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(s, 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
  return completeOnboarding(s, ctx());
};
const valid = (state) => { const r = validateAppState(state); assert.equal(r.ok, true, JSON.stringify(r.issues)); return state; };
const opp = (s) => s.careerOpportunities[s.careerOpportunities.length - 1];

describe('B4-FE01-027/ADR-005 (F10) — the typed-reference registry gained one kind, minimally', () => {
  test('opportunity is a registered TypedRef kind', () => {
    assert.ok(TYPED_REF_KINDS.includes('opportunity'));
  });
  test('CONTENT_REF_KINDS (Responsibility/Pattern/ExternalReference/Intent) is UNCHANGED — the widening is Dependency-only', () => {
    assert.deepEqual([...CONTENT_REF_KINDS], ['task', 'event', 'needsMe', 'system', 'meal', 'goal']);
    assert.ok(!CONTENT_REF_KINDS.includes('opportunity'));
  });
  test("Dependency's own endpoint list adds exactly opportunity to the content kinds", () => {
    assert.deepEqual([...DEPENDENCY_REF_KINDS], [...CONTENT_REF_KINDS, 'opportunity']);
  });
});

describe('F10 — CareerOpportunity: creation and field edits', () => {
  test('a new opportunity always starts at exploring, whatever she eventually plans to record', () => {
    const s = addOpportunity(real(), ctx(), { title: 'Senior Analyst role', opportunityType: 'job' });
    assert.equal(opp(s).stage, 'exploring');
    assert.equal(opp(s).closedReason, null);
    assert.equal(opp(s).archivedAt, null);
    valid(s);
  });

  test('updateOpportunity edits plain fields but cannot touch stage, closedReason or archivedAt', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    // stage/closedReason/archivedAt are not in UpdateOpportunityInput and must be silently ignored.
    s = updateOpportunity(s, ctx(), id, {
      title: 'Senior Role', organizationName: 'Brightline',
      stage: 'closed', closedReason: 'withdrawn', archivedAt: '2026-01-01T00:00:00.000Z',
    });
    const row = s.careerOpportunities.find((o) => o.id === id);
    assert.equal(row.title, 'Senior Role');
    assert.equal(row.organizationName, 'Brightline');
    assert.equal(row.stage, 'exploring', 'stage is untouched by a plain-field edit');
    assert.equal(row.closedReason, null);
    assert.equal(row.archivedAt, null);
    valid(s);
  });

  test('a missing opportunity is a no-op, not a crash', () => {
    const s = real();
    assert.equal(updateOpportunity(s, ctx(), 'opp-ghost', { title: 'x' }), s);
  });
});

describe('F10 DOCTRINE — stage changes only through setOpportunityStage, and closed always says why', () => {
  for (const [from, to] of [['exploring', 'applied'], ['applied', 'interviewing'], ['interviewing', 'offer'], ['offer', 'accepted']]) {
    test(`DOCTRINE: ${from} does not become ${to} — a stage is what she recorded, never a follow-on inference`, () => {
      let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
      const id = opp(s).id;
      ({ state: s } = setOpportunityStage(s, ctx(), id, from));
      // Nothing else in the system may move the stage. Simulate "time passing" / unrelated mutations and re-check.
      s = updateOpportunity(s, ctx(), id, { notes: 'still the same stage' });
      assert.equal(s.careerOpportunities.find((o) => o.id === id).stage, from, `${from} must stay ${from} until an explicit setOpportunityStage call`);
    });
  }

  test('closed requires a real reason; missing or invalid reason is refused, not defaulted', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    const missing = setOpportunityStage(s, ctx(), id, 'closed', null);
    assert.equal(missing.refusal, 'missing_closed_reason');
    assert.equal(missing.state.careerOpportunities.find((o) => o.id === id).stage, 'exploring');

    const bad = setOpportunityStage(s, ctx(), id, 'closed', /** @type any */ ('ghosted'));
    assert.equal(bad.refusal, 'missing_closed_reason');
  });

  test('a reason may not be recorded on a non-closed stage', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    const r = setOpportunityStage(s, ctx(), id, 'accepted', 'withdrawn');
    assert.equal(r.refusal, 'unexpected_closed_reason');
  });

  test('closing, then correcting away from closed, clears the reason', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'closed', 'no_further_response'));
    assert.equal(s.careerOpportunities.find((o) => o.id === id).closedReason, 'no_further_response');
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'interviewing'));
    assert.equal(s.careerOpportunities.find((o) => o.id === id).closedReason, null, 'DOCTRINE: a correction away from closed is not still carrying a reason');
    valid(s);
  });

  test('the stage vocabulary is exactly the smallest truthful lifecycle, and isOpportunityOpen agrees with it', () => {
    assert.deepEqual([...OPPORTUNITY_STAGES], ['exploring', 'interested', 'applied', 'interviewing', 'offer', 'accepted', 'closed']);
    assert.deepEqual([...OPPORTUNITY_CLOSED_REASONS], ['withdrawn', 'declined_by_organization', 'offer_rescinded', 'no_further_response', 'other']);
    for (const stage of OPPORTUNITY_STAGES) assert.equal(isOpportunityOpen({ stage }), stage !== 'closed', stage);
  });

  test('every stage in the vocabulary is reachable, forward, sideways or backward, with no enforced order', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    for (const stage of ['offer', 'exploring', 'accepted', 'interested', 'applied']) {
      ({ state: s } = setOpportunityStage(s, ctx(), id, stage));
      assert.equal(s.careerOpportunities.find((o) => o.id === id).stage, stage, `moving to ${stage} from wherever it was is permitted`);
    }
  });

  test('stageChangedAt moves only when the stage actually changes', () => {
    let s = addOpportunity(real(), ctx({ nowMs: 1000 }), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    const t0 = s.careerOpportunities.find((o) => o.id === id).stageChangedAt;
    ({ state: s } = setOpportunityStage(s, ctx({ nowMs: 999_000 }), id, 'exploring'));
    assert.equal(s.careerOpportunities.find((o) => o.id === id).stageChangedAt, t0, 're-recording the SAME stage does not move stageChangedAt');
    ({ state: s } = setOpportunityStage(s, ctx({ nowMs: 999_000 }), id, 'applied'));
    assert.notEqual(s.careerOpportunities.find((o) => o.id === id).stageChangedAt, t0);
  });

  test('multiple opportunities may independently be interviewing / offer / accepted — no exclusivity, no cascade', () => {
    let s = real();
    s = addOpportunity(s, ctx(), { title: 'Role A', opportunityType: 'job' });
    const a = opp(s).id;
    s = addOpportunity(s, ctx(), { title: 'Role B', opportunityType: 'job' });
    const b = opp(s).id;
    ({ state: s } = setOpportunityStage(s, ctx(), a, 'accepted'));
    ({ state: s } = setOpportunityStage(s, ctx(), b, 'offer'));
    assert.equal(s.careerOpportunities.find((o) => o.id === a).stage, 'accepted', 'DOCTRINE: accepting A does not close B');
    assert.equal(s.careerOpportunities.find((o) => o.id === b).stage, 'offer');
    valid(s);
  });
});

describe('F10 DOCTRINE — the next action is a canonical Task, and an interview is a canonical Event', () => {
  test('addOpportunityNextAction creates an ordinary Task, linked by the existing Dependency mechanism', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    const before = s.tasks.length;
    let task;
    ({ state: s, task } = addOpportunityNextAction(s, ctx(), id, { title: 'Send the follow-up email', categoryId: 'cat-work' }));
    assert.equal(s.tasks.length, before + 1, 'exactly one canonical Task was created — no second task shape');
    assert.equal(task.title, 'Send the follow-up email');
    assert.equal(task.scope, 'professional', 'DOCTRINE (ADDENDUM M): defaults to the opportunity-preserving scope, not household-visible');
    const edge = s.dependencies.find((d) => d.status === 'active' && d.relation === 'part_of' && d.from.kind === 'task' && d.from.id === task.id);
    assert.ok(edge, 'the Task is linked via part_of, the SAME relation a Goal step uses');
    assert.equal(edge.to.kind, 'opportunity');
    assert.equal(edge.to.id, id);
    assert.deepEqual(linkedTasksOf(s, id).map((t) => t.id), [task.id]);
    assert.equal(hasOpenNextAction(s, id), true);
    valid(s);
  });

  test('refuses (creates nothing) when the opportunity does not exist', () => {
    const s = real();
    const before = { tasks: s.tasks.length, deps: s.dependencies.length };
    const result = addOpportunityNextAction(s, ctx(), 'opp-ghost', { title: 'x', categoryId: 'cat-work' });
    assert.equal(result.task, null);
    assert.equal(result.state.tasks.length, before.tasks);
    assert.equal(result.state.dependencies.length, before.deps);
  });

  test('scheduleOpportunityInterview creates an ordinary Event, linked the same way', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    let event;
    ({ state: s, event } = scheduleOpportunityInterview(s, ctx(), id, {
      title: 'Phone screen', categoryId: 'cat-work', startsAt: '2026-09-24T14:00:00.000Z', endsAt: '2026-09-24T14:30:00.000Z', commitment: 'fixed',
    }));
    assert.equal(event.scope, 'professional');
    assert.deepEqual(linkedInterviewsOf(s, id).map((e) => e.id), [event.id]);
    const edge = s.dependencies.find((d) => d.relation === 'part_of' && d.from.kind === 'event' && d.from.id === event.id);
    assert.equal(edge.to.id, id);
    valid(s);
  });

  test('DOCTRINE: completing the linked next-action Task does not advance the Opportunity stage', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    let task;
    ({ state: s, task } = addOpportunityNextAction(s, ctx(), id, { title: 'Send the follow-up email', categoryId: 'cat-work' }));
    s = completeTask(s, ctx(), task.id);
    assert.equal(s.careerOpportunities.find((o) => o.id === id).stage, 'exploring', 'a finished Task never moves the Opportunity forward on its own');
    assert.equal(hasOpenNextAction(s, id), false, 'but momentum can now truthfully say there is no OPEN next step');
  });

  test('DOCTRINE: an Event\'s time passing does not advance the Opportunity stage, and rescheduling/removal never touches it', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    ({ state: s } = scheduleOpportunityInterview(s, ctx(), id, {
      title: 'Onsite interview', categoryId: 'cat-work', startsAt: '2020-01-01T14:00:00.000Z', endsAt: '2020-01-01T15:00:00.000Z', commitment: 'fixed',
    }));
    // The interview's start/end are already far in the past relative to any `today` this suite uses; nothing reads clock time to change stage.
    assert.equal(s.careerOpportunities.find((o) => o.id === id).stage, 'exploring');
  });
});

describe('F10 DOCTRINE — closing or archiving an Opportunity never rewrites linked Tasks or Events', () => {
  test('closing with an open linked Task leaves the Task open, and the count is visible', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    let task;
    ({ state: s, task } = addOpportunityNextAction(s, ctx(), id, { title: 'Send the follow-up email', categoryId: 'cat-work' }));
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'closed', 'no_further_response'));
    assert.equal(s.tasks.find((t) => t.id === task.id).status, 'open', 'DOCTRINE: closing never completes a linked Task');
    assert.equal(openLinkedTaskCount(s, id), 1);
    valid(s);
  });

  test('archiving leaves the recorded stage and reason exactly as they were', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'closed', 'withdrawn'));
    s = archiveOpportunity(s, ctx(), id);
    const row = s.careerOpportunities.find((o) => o.id === id);
    assert.notEqual(row.archivedAt, null);
    assert.equal(row.stage, 'closed');
    assert.equal(row.closedReason, 'withdrawn', 'DOCTRINE: archiving never rewrites the recorded outcome');
    s = restoreOpportunity(s, ctx(), id);
    assert.equal(s.careerOpportunities.find((o) => o.id === id).archivedAt, null);
    assert.equal(s.careerOpportunities.find((o) => o.id === id).stage, 'closed', 'restoring from archive does not reopen the professional outcome either');
  });

  test('fresh-client reconstruction: close then archive round-trips through validateAppState unchanged', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job' });
    const id = opp(s).id;
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'closed', 'offer_rescinded'));
    s = archiveOpportunity(s, ctx(), id);
    const reloaded = JSON.parse(JSON.stringify(s));
    const verdict = validateAppState(reloaded);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.state.careerOpportunities.find((o) => o.id === id).stage, 'closed');
  });
});

describe('F10 DOCTRINE — Career Momentum is deterministic, and invents no inactivity timer', () => {
  test('no attention item exists for an opportunity with neither a follow-up date nor a deadline', () => {
    const s = addOpportunity(real(), ctx({ today: '2026-09-16' }), { title: 'Role', opportunityType: 'job' });
    const items = attentionFor(s, Date.parse('2026-09-16T15:00:00.000Z'));
    assert.deepEqual(items.filter((i) => i.reason === 'opportunity_follow_up'), []);
  });

  test('an explicit follow-up date today or overdue produces exactly one bounded item, at the right urgency', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job', followUpDate: '2026-09-14' });
    const now = Date.parse('2026-09-16T15:00:00.000Z');
    const items = attentionFor(s, now).filter((i) => i.reason === 'opportunity_follow_up');
    assert.equal(items.length, 1);
    assert.equal(items[0].urgency, 'now', 'an overdue follow-up is "now", exactly like an overdue task deadline');
  });

  test('a closed or archived opportunity never produces an attention item, even with a live-looking date', () => {
    let s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job', followUpDate: '2026-09-14' });
    const id = opp(s).id;
    ({ state: s } = setOpportunityStage(s, ctx(), id, 'closed', 'withdrawn'));
    const now = Date.parse('2026-09-16T15:00:00.000Z');
    assert.deepEqual(attentionFor(s, now).filter((i) => i.reason === 'opportunity_follow_up'), []);
  });

  test('both a follow-up date and a deadline qualifying produces ONE item, not two, keyed by the earlier date', () => {
    const s = addOpportunity(real(), ctx(), { title: 'Role', opportunityType: 'job', followUpDate: '2026-09-14', applicationDeadline: '2026-09-15' });
    const now = Date.parse('2026-09-16T15:00:00.000Z');
    const items = attentionFor(s, now).filter((i) => i.reason === 'opportunity_follow_up');
    assert.equal(items.length, 1, 'no duplicate row for the same opportunity');
  });

  test('workCareerAttention is scoped to opportunities and work-categorized tasks/events only', () => {
    let s = real();
    s = addOpportunity(s, ctx(), { title: 'Role', opportunityType: 'job', followUpDate: '2026-09-14' });
    const now = Date.parse('2026-09-16T15:00:00.000Z');
    const items = workCareerAttention(s, now);
    assert.ok(items.some((i) => i.reason === 'opportunity_follow_up'));
  });

  test('workCareerVerdict composition: none -> one -> many, and a future item when nothing is due now', () => {
    let s = real();
    const now = Date.parse('2026-09-16T15:00:00.000Z');
    assert.equal(workCareerVerdict(s, now), 'Nothing at work needs attention right now.');

    s = addOpportunity(s, ctx(), { title: 'Role A', opportunityType: 'job', followUpDate: '2026-09-16' });
    assert.match(workCareerVerdict(s, now), /Role A/);

    s = addOpportunity(s, ctx(), { title: 'Role B', opportunityType: 'job', followUpDate: '2026-09-16' });
    assert.match(workCareerVerdict(s, now), /^2 work items need attention today\.$/);
  });
});

describe('F10 DOCTRINE — CareerOpportunity is never itself a One Move target', () => {
  test('opportunity is not in the closed One Move target-type vocabulary', () => {
    assert.ok(!ONE_MOVE_TARGET_TYPES.includes('opportunity'));
  });

  test('a One Move record naming targetType "opportunity" fails schema validation outright', () => {
    let s = real();
    s = addOpportunity(s, ctx(), { title: 'Role', opportunityType: 'job' });
    const bad = {
      ...s,
      oneMoves: [{
        id: 'om-bad', forDate: '2026-09-16', targetType: 'opportunity', targetId: opp(s).id,
        status: 'selected', decidedAt: '2026-09-16T10:00:00.000Z', completedAt: null, scope: 'personal',
      }],
    };
    const verdict = validateAppState(bad);
    assert.equal(verdict.ok, false, 'DOCTRINE: an Opportunity can never masquerade as a One Move target');
  });
});

describe('F10 — money boundary: no structured compensation field exists to populate', () => {
  test('the stored schema itself has no structured compensation field (not just the constructor)', () => {
    const keys = Object.keys(CareerOpportunitySchema.shape);
    assert.deepEqual(keys.filter((k) => /amount|salary|wage|rate|currency|price|cents/i.test(k)), []);
  });

  test('addOpportunity accepts no salary/amount-shaped input at all', () => {
    // salaryCents/annualSalary/currency do not exist on AddOpportunityInput and must be dropped, not stored.
    const s = addOpportunity(real(), ctx(), {
      title: 'Role', opportunityType: 'job', compensationNote: '$120k mentioned verbally, unconfirmed',
      salaryCents: 12_000_000, annualSalary: 120_000, currency: 'USD',
    });
    const row = opp(s);
    assert.equal(row.compensationNote, '$120k mentioned verbally, unconfirmed');
    assert.equal('salaryCents' in row, false);
    assert.equal('annualSalary' in row, false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'currency'), false);
  });
});
