import { formatAmount } from '../../domain/foundation/money';
import { isActiveResponsibility, isUnacknowledged, type Responsibility } from '../../domain/foundation/responsibility';
import type { Dependency, RecurrenceRule } from '../../domain/foundation/structure';
import { refKey, type TypedRef } from '../../domain/foundation/typedRef';
import { epochMsOf } from '../../domain/logicalDay';
import { needsMePersonally } from '../../domain/responsibility';
import type { AppState, CalendarEvent, Task } from '../../domain/state';
import { standingOf } from '../../domain/structure';
import { buildEvidenceIndex, type EvidenceIndex } from './evidence';
import { blockedReasons, childRefOf, coparentCategory, counterpartOf, isOwnerOnlyScope, personLabels } from './identity';
import { currentOccurrence, localParts, RECENT_WINDOW_MS } from './time';
import type {
  ChildOption,
  ChildRef,
  Clock,
  CompletedEntry,
  CoParentLogisticsView,
  Coverage,
  MoneyFollowUpDetailView,
  MoneyFollowUpView,
  NeedsMeReason,
  PersonOption,
  PrepGroup,
  PrepItemView,
  PrepStanding,
  PreparationSummary,
  RepeatView,
  ResponsibilityStage,
  ResponsibilityView,
  ReviewReason,
  TimeStatus,
  TransitionDetailView,
  TransitionView,
  UnknownFact,
} from './types';

/**
 * THE CO-PARENT LOGISTICS PROJECTION.
 *
 *   buildCoParentLogisticsView(canonicalState, householdId, clock)
 *
 * One bounded, deterministic, NON-MUTATING derivation. It reads canonical rows and nothing else; it stores nothing; it decides nothing
 * about the other household; and it never turns what SHE recorded into something a third party did.
 *
 * A "co-parent logistics record" is decided by the household's own category: a record whose category carries the explicit system role
 * `coparenting`. Identity is always an id. A missing fact stays missing (no counterpart recorded is NOT "she is handling it"; no
 * preparation recorded is NOT "ready"; no amount is NOT $0; no outcome is NOT completed).
 */

interface Ctx {
  state: AppState;
  nowMs: number;
  zone: string;
  labels: Map<string, string>;
  evidence: EvidenceIndex;
  categoryId: string | null;
  respByAbout: Map<string, Responsibility[]>;
  requiresFrom: Map<string, Dependency[]>;
  requiresTo: Map<string, Dependency[]>;
  ruleByAbout: Map<string, RecurrenceRule>;
  eventById: Map<string, CalendarEvent>;
  taskById: Map<string, Task>;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

function contextFor(state: AppState, clock: Clock): Ctx {
  const respByAbout = new Map<string, Responsibility[]>();
  for (const responsibility of state.responsibilities) push(respByAbout, refKey(responsibility.about), responsibility);

  const requiresFrom = new Map<string, Dependency[]>();
  const requiresTo = new Map<string, Dependency[]>();
  for (const dependency of state.dependencies) {
    if (dependency.status !== 'active' || dependency.relation !== 'requires') continue;
    push(requiresFrom, refKey(dependency.from), dependency);
    push(requiresTo, refKey(dependency.to), dependency);
  }

  // One live rule per thing is a state invariant. A paused rule is shown as paused; an ended one is history and is not shown.
  const ruleByAbout = new Map<string, RecurrenceRule>();
  for (const rule of state.recurrences) {
    if (rule.status === 'ended') continue;
    const key = refKey(rule.about);
    const held = ruleByAbout.get(key);
    if (!held || (held.status !== 'active' && rule.status === 'active')) ruleByAbout.set(key, rule);
  }

  return {
    state,
    nowMs: clock.nowMs,
    zone: state.user.timezone,
    labels: personLabels(state.people),
    evidence: buildEvidenceIndex(state),
    categoryId: coparentCategory(state)?.id ?? null,
    respByAbout,
    requiresFrom,
    requiresTo,
    ruleByAbout,
    eventById: new Map(state.events.map((event) => [event.id, event])),
    taskById: new Map(state.tasks.map((task) => [task.id, task])),
  };
}

// --------------------------------------------------------------------------------------------------------- responsibility

function stageOf(r: Responsibility): ResponsibilityStage {
  switch (r.state) {
    case 'owned':
      return r.responsibleKind === 'self' ? 'with_you' : 'assigned';
    case 'requested':
      return 'requested';
    case 'acknowledged':
      return 'acknowledged';
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'completed':
      return 'completed';
    case 'returned':
      return 'with_you';
  }
}

/** Stages that say "somebody positively holds this" — the ones an unavailable holder must never keep. */
const POSITIVE_STAGES: ReadonlySet<ResponsibilityStage> = new Set(['assigned', 'requested', 'acknowledged', 'accepted']);

function responsibilityViewOf(ctx: Ctx, about: TypedRef): ResponsibilityView {
  const list = ctx.respByAbout.get(refKey(about)) ?? [];
  const live = list.find((candidate) => isActiveResponsibility(candidate)) ?? null;
  const r = live ?? (list.length > 0 ? list[list.length - 1] : null);

  if (r === null) {
    return {
      responsibilityId: null,
      holder: 'none',
      holderChild: null,
      stage: 'none_recorded',
      coverage: 'unknown',
      counterpart: null,
      stillNeedsMe: null,
      answerOverdue: false,
      requestedAt: null,
      acknowledgedAt: null,
      respondedAt: null,
      completedAt: null,
      returnedAt: null,
      evidence: ctx.evidence.request([about]),
      recordedBy: 'you',
    };
  }

  const stage = stageOf(r);
  const counterpart = r.responsibleKind === 'person' ? counterpartOf(ctx.state, ctx.labels, r.responsiblePersonId) : null;
  const holderUnavailable = counterpart !== null && counterpart.standing !== 'active';

  let coverage: Coverage;
  if (stage === 'completed') coverage = 'completed';
  else if (holderUnavailable && POSITIVE_STAGES.has(stage)) coverage = 'needs_review';
  else if (stage === 'accepted' && r.stillNeedsMe === false) coverage = 'covered';
  else coverage = 'not_covered';

  return {
    responsibilityId: r.id,
    holder: r.responsibleKind,
    holderChild: r.responsibleKind === 'child' ? childRefOf(ctx.state, r.responsibleChildId) : null,
    stage,
    coverage,
    counterpart,
    stillNeedsMe: r.stillNeedsMe,
    answerOverdue: live !== null && isUnacknowledged(live, ctx.nowMs),
    requestedAt: r.requestedAt,
    acknowledgedAt: r.acknowledgedAt,
    respondedAt: r.respondedAt,
    completedAt: r.completedAt,
    returnedAt: r.returnedAt,
    evidence: ctx.evidence.request([about, { kind: 'responsibility', id: r.id }]),
    recordedBy: 'you',
  };
}

const needsReviewFromResponsibility = (view: ResponsibilityView): boolean => view.coverage === 'needs_review';

// ------------------------------------------------------------------------------------------------------------ preparation

const prepStandingOf = (state: AppState, taskId: string): PrepStanding => {
  const standing = standingOf(state, { kind: 'task', id: taskId });
  if (standing.standing === 'satisfied') return 'done';
  if (standing.standing === 'pending') return 'open';
  return standing.cause === 'retired' ? 'removed' : 'missing';
};

function prepItemOf(ctx: Ctx, taskId: string, edge: Dependency | null, linkedEventId: string | null): PrepItemView {
  const task = ctx.taskById.get(taskId) ?? null;
  const linkedEvent = linkedEventId === null ? null : (ctx.eventById.get(linkedEventId) ?? null);
  return {
    taskId,
    title: task?.title ?? '',
    child: childRefOf(ctx.state, task?.subjectMemberId ?? null),
    dueDate: task?.dueDate ?? null,
    standing: prepStandingOf(ctx.state, taskId),
    completedAt: task?.completedAt ?? null,
    linkedTransitionId: linkedEventId,
    linkedTransitionRemoved: linkedEvent !== null && linkedEvent.status === 'removed',
    dependencyId: edge?.id ?? null,
  };
}

const byDueThenTitle = (a: PrepItemView, b: PrepItemView) =>
  (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId);

function preparationOf(ctx: Ctx, eventId: string): PreparationSummary {
  const items: PrepItemView[] = [];
  for (const edge of ctx.requiresFrom.get(refKey({ kind: 'event', id: eventId })) ?? []) {
    if (edge.to.kind === 'task') items.push(prepItemOf(ctx, edge.to.id, edge, eventId));
  }
  items.sort(byDueThenTitle);

  const open = items.filter((item) => item.standing === 'open').length;
  const done = items.filter((item) => item.standing === 'done').length;
  const unavailable = items.length - open - done;
  // REMOVED != COMPLETED and MISSING != SATISFIED: an unavailable item never contributes to "all marked done".
  const readiness =
    items.length === 0 ? 'no_prep_recorded' : open > 0 ? 'waiting_on_prep' : unavailable > 0 ? 'needs_review' : 'all_marked_done';
  return { linked: items.length, open, done, unavailable, readiness, items };
}

// ------------------------------------------------------------------------------------------------------------ transitions

function repeatViewOf(rule: RecurrenceRule | undefined): RepeatView | null {
  if (!rule || rule.frequency === null || (rule.status !== 'active' && rule.status !== 'paused')) return null;
  return {
    ruleId: rule.id,
    status: rule.status,
    frequency: rule.frequency,
    interval: rule.interval,
    byWeekday: rule.byWeekday,
    byMonthDay: rule.byMonthDay,
    anchorDate: rule.anchorDate,
    timezone: rule.timezone,
  };
}

function needsMeReasonsOf(ctx: Ctx, event: CalendarEvent, responsibility: ResponsibilityView): NeedsMeReason[] {
  const reasons: NeedsMeReason[] = [];
  if (responsibility.stage === 'declined') reasons.push('back_with_you');
  if (responsibility.stage === 'with_you' && responsibility.returnedAt !== null) reasons.push('back_with_you');
  if (responsibility.answerOverdue) reasons.push('answer_overdue');
  if (responsibility.stage === 'accepted' && responsibility.stillNeedsMe === true && responsibility.coverage !== 'needs_review') {
    reasons.push('accepted_still_needs_you');
  }
  // Her own explicit "this needs me" counts only when nobody else is recorded as holding it.
  if (responsibility.stage === 'none_recorded' && event.needsMePersonally === true) reasons.push('marked_needs_you');
  return reasons;
}

function transitionViewOf(ctx: Ctx, event: CalendarEvent): TransitionView {
  const ref: TypedRef = { kind: 'event', id: event.id };
  const rule = ctx.ruleByAbout.get(refKey(ref));
  const occurrence = currentOccurrence(ctx.state, event, rule ?? null, ctx.nowMs);
  const recordedStartMs = epochMsOf(event.startsAt);

  const child = childRefOf(ctx.state, event.subjectMemberId);
  const responsibility = responsibilityViewOf(ctx, ref);
  const preparation = preparationOf(ctx, event.id);
  const lifecycle = event.status === 'removed' ? 'removed' : 'active';

  const review: ReviewReason[] = [];
  if (child.status === 'not_recorded') review.push('child_not_recorded');
  if (child.status === 'unavailable') review.push('child_unavailable');
  if (needsReviewFromResponsibility(responsibility)) review.push('counterpart_unavailable');
  if (preparation.unavailable > 0) review.push('preparation_unavailable');

  const needsMeReasons = needsMeReasonsOf(ctx, event, responsibility);
  const timeStatus: TimeStatus = occurrence.endsAtMs <= ctx.nowMs ? 'past' : occurrence.startsAtMs <= ctx.nowMs ? 'in_progress' : 'upcoming';

  const needsMe = needsMePersonally(ctx.state, ref, ctx.nowMs);
  const unknowns: UnknownFact[] = [];
  if (child.status === 'not_recorded') unknowns.push('child_not_recorded');
  if (event.location === null || event.location.trim() === '') unknowns.push('location_not_recorded');
  if (responsibility.stage === 'none_recorded') unknowns.push('counterpart_not_recorded');
  if (preparation.linked === 0) unknowns.push('preparation_not_recorded');
  if (needsMe === null) unknowns.push('needs_you_not_recorded');
  if (timeStatus === 'past') unknowns.push('outcome_not_recorded');

  const section =
    review.length > 0
      ? 'needs_review'
      : needsMeReasons.length > 0
        ? 'needs_me'
        : responsibility.stage === 'requested' || responsibility.stage === 'acknowledged'
          ? 'waiting'
          : 'none';

  const local = localParts(occurrence.startsAtMs, ctx.zone);
  return {
    id: event.id,
    title: event.title,
    child,
    startsAtMs: occurrence.startsAtMs,
    endsAtMs: occurrence.endsAtMs,
    occurrence: occurrence.kind,
    recordedStartsAt: event.startsAt,
    recordedLocalDate: localParts(recordedStartMs, ctx.zone).localDate,
    localDate: local.localDate,
    minutesOfDay: local.minutesOfDay,
    hasLocation: event.location !== null && event.location.trim() !== '',
    timeStatus,
    lifecycle,
    needsMe,
    needsMeReasons,
    responsibility,
    preparation,
    repeat: repeatViewOf(rule),
    review,
    unknowns,
    section,
    ownerOnly: isOwnerOnlyScope(event.scope),
  };
}

// ---------------------------------------------------------------------------------------------------------------- money

const followUpStanding = (task: Task) => (task.status === 'completed' ? 'done' : task.status === 'archived' ? 'removed' : 'open');

function moneyFollowUpOf(ctx: Ctx, task: Task): MoneyFollowUpView | null {
  if (task.value === null) return null;
  const ref: TypedRef = { kind: 'task', id: task.id };
  const child = childRefOf(ctx.state, task.subjectMemberId);
  const responsibility = responsibilityViewOf(ctx, ref);
  const review: ReviewReason[] = [];
  if (child.status === 'unavailable') review.push('child_unavailable');
  if (needsReviewFromResponsibility(responsibility)) review.push('counterpart_unavailable');
  return {
    taskId: task.id,
    title: task.title,
    child,
    amount: { amountMinor: task.value.amountMinor, currency: task.value.currency, decimal: formatAmount(task.value), direction: task.value.direction },
    followUpDate: task.dueDate,
    standing: followUpStanding(task),
    completedAt: task.completedAt,
    responsibility,
    paymentEvidence: ctx.evidence.serviceReportedPayment(ref) ? 'service_reported_paid' : 'none',
    review,
  };
}

// ------------------------------------------------------------------------------------------------------------------ hub

const childSortKey = (child: ChildRef): [number, string, string] =>
  child.status === 'known' ? [0, child.displayName.toLocaleLowerCase(), child.childId] : child.status === 'not_recorded' ? [1, '', ''] : [2, '', child.childId];

const compareChildren = (a: ChildRef, b: ChildRef): number => {
  const [ra, na, ia] = childSortKey(a);
  const [rb, nb, ib] = childSortKey(b);
  return ra - rb || na.localeCompare(nb) || ia.localeCompare(ib);
};

const childOptions = (state: AppState): ChildOption[] =>
  state.children
    .map((child) => ({ childId: child.id, displayName: child.displayName }))
    .sort((a, b) => a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase()) || a.childId.localeCompare(b.childId));

function personOptions(ctx: Ctx): PersonOption[] {
  return ctx.state.people
    .filter((person) => person.status === 'active')
    .map((person) => ({ personId: person.id, label: ctx.labels.get(person.id) ?? person.displayName, relationshipLabel: counterpartOf(ctx.state, ctx.labels, person.id)?.relationshipLabel ?? null }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.personId.localeCompare(b.personId));
}

const zoneOf = (state: AppState, clock: Clock) => {
  const device = clock.deviceTimeZone ?? null;
  return { household: state.user.timezone, device, differs: device !== null && device !== state.user.timezone };
};

const emptyView = (state: AppState, householdId: string, clock: Clock, status: CoParentLogisticsView['status']): CoParentLogisticsView => ({
  householdId,
  status,
  nowMs: clock.nowMs,
  zone: zoneOf(state, clock),
  capability: { canCreate: false, blocked: [], categoryId: null },
  children: [],
  people: [],
  transitions: [],
  nextTransitionId: null,
  needsReviewIds: [],
  needsMeIds: [],
  waitingIds: [],
  preparation: [],
  moneyFollowUps: [],
  needsReviewTasks: [],
  recentlyCompleted: [],
  // A view built for the WRONG household must never read as "nothing recorded".
  isEmpty: false,
});

const byStart = (a: TransitionView, b: TransitionView) => a.startsAtMs - b.startsAtMs || a.id.localeCompare(b.id);

export function buildCoParentLogisticsView(state: AppState, householdId: string, clock: Clock): CoParentLogisticsView {
  if (householdId !== state.household.id) return emptyView(state, householdId, clock, 'household_mismatch');

  const ctx = contextFor(state, clock);
  const categoryId = ctx.categoryId;
  const blocked = blockedReasons(state);

  // ---- handoffs: active events in the co-parenting category whose occurrence has not ended.
  const activeEvents = categoryId === null ? [] : state.events.filter((event) => event.categoryId === categoryId && event.status === 'active');
  const transitions = activeEvents
    .map((event) => transitionViewOf(ctx, event))
    .filter((view) => view.timeStatus !== 'past')
    .sort(byStart);

  // ---- tasks that belong here: the category's own, plus anything an active co-parenting handoff requires.
  const linkedFromHandoffs = new Set<string>();
  for (const event of activeEvents) {
    for (const edge of ctx.requiresFrom.get(refKey({ kind: 'event', id: event.id })) ?? []) if (edge.to.kind === 'task') linkedFromHandoffs.add(edge.to.id);
  }
  const hereTasks = state.tasks.filter((task) => (categoryId !== null && task.categoryId === categoryId) || linkedFromHandoffs.has(task.id));

  const followUps: MoneyFollowUpView[] = [];
  const prepItems: PrepItemView[] = [];
  const needsReviewTasks: CoParentLogisticsView['needsReviewTasks'] = [];
  const recentlyCompleted: CompletedEntry[] = [];
  const windowStart = clock.nowMs - RECENT_WINDOW_MS;

  for (const task of hereTasks) {
    const isFollowUp = categoryId !== null && task.categoryId === categoryId && task.value !== null;
    if (isFollowUp) {
      const view = moneyFollowUpOf(ctx, task);
      if (view === null) continue;
      if (view.standing === 'open') {
        followUps.push(view);
        if (view.review.length > 0) needsReviewTasks.push({ taskId: task.id, title: task.title, child: view.child, reasons: view.review });
      } else if (view.standing === 'done' && task.completedAt !== null && epochMsOf(task.completedAt) >= windowStart) {
        recentlyCompleted.push({ kind: 'task', id: task.id, title: task.title, child: view.child, completedAt: task.completedAt, followUp: true, counterpart: view.responsibility.counterpart });
      }
      continue;
    }

    // ---- preparation (a task with no amount). Its link, if any, is a recorded edge — never a guess.
    const edges = ctx.requiresTo.get(refKey({ kind: 'task', id: task.id })) ?? [];
    const linkable = edges
      .filter((edge) => edge.from.kind === 'event')
      .map((edge) => ({ edge, event: ctx.eventById.get(edge.from.id) ?? null }))
      // Only a CO-PARENTING handoff counts as "the handoff this is for"; a link to any other event is not this feature's to show.
      .filter((entry): entry is { edge: Dependency; event: CalendarEvent } => entry.event !== null && entry.event.categoryId === categoryId)
      .sort((a, b) => (a.event.status === 'active' ? 0 : 1) - (b.event.status === 'active' ? 0 : 1) || a.event.startsAt.localeCompare(b.event.startsAt) || a.event.id.localeCompare(b.event.id));
    const link = linkable[0] ?? null;
    const item = prepItemOf(ctx, task.id, link?.edge ?? null, link?.event.id ?? null);

    if (item.standing === 'open') {
      prepItems.push(item);
      const reasons: ReviewReason[] = [];
      if (item.child.status === 'unavailable') reasons.push('child_unavailable');
      if (item.linkedTransitionRemoved && linkable.every((entry) => entry.event.status === 'removed')) reasons.push('handoff_removed');
      if (reasons.length > 0) needsReviewTasks.push({ taskId: task.id, title: task.title, child: item.child, reasons });
    } else if (item.standing === 'done' && task.completedAt !== null && epochMsOf(task.completedAt) >= windowStart) {
      recentlyCompleted.push({ kind: 'task', id: task.id, title: task.title, child: item.child, completedAt: task.completedAt, followUp: false, counterpart: null });
    }
  }

  // ---- responsibilities recorded complete, about co-parenting records.
  const hereEventIds = new Set(activeEvents.map((event) => event.id));
  const hereTaskIds = new Set(hereTasks.map((task) => task.id));
  for (const responsibility of state.responsibilities) {
    if (responsibility.state !== 'completed' || responsibility.completedAt === null || epochMsOf(responsibility.completedAt) < windowStart) continue;
    const about = responsibility.about;
    const belongs = about.kind === 'event' ? hereEventIds.has(about.id) : about.kind === 'task' ? hereTaskIds.has(about.id) : false;
    if (!belongs) continue;
    const event = about.kind === 'event' ? ctx.eventById.get(about.id) : undefined;
    const task = about.kind === 'task' ? ctx.taskById.get(about.id) : undefined;
    recentlyCompleted.push({
      kind: 'responsibility',
      id: responsibility.id,
      title: event?.title ?? task?.title ?? '',
      child: childRefOf(state, event?.subjectMemberId ?? task?.subjectMemberId ?? null),
      completedAt: responsibility.completedAt,
      followUp: false,
      counterpart: responsibility.responsibleKind === 'person' ? counterpartOf(state, ctx.labels, responsibility.responsiblePersonId) : null,
    });
  }

  followUps.sort(
    (a, b) => (a.followUpDate ?? '9999-99-99').localeCompare(b.followUpDate ?? '9999-99-99') || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId)
  );
  recentlyCompleted.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
  needsReviewTasks.sort((a, b) => a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId));

  const groups = new Map<string, PrepGroup>();
  for (const item of prepItems.sort(byDueThenTitle)) {
    const key = item.child.status === 'known' ? `k:${item.child.childId}` : item.child.status === 'not_recorded' ? 'n' : `u:${item.child.childId}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { child: item.child, items: [item] });
  }
  const preparation = [...groups.values()].sort((a, b) => compareChildren(a.child, b.child));

  // The next handoff is the chronologically next one. If it needs review, the card says so — it is never skipped to look tidier.
  const nextTransition = transitions[0] ?? null;

  return {
    householdId,
    status: 'ok',
    nowMs: clock.nowMs,
    zone: zoneOf(state, clock),
    capability: { canCreate: blocked.length === 0, blocked, categoryId },
    children: childOptions(state),
    people: personOptions(ctx),
    transitions,
    nextTransitionId: nextTransition?.id ?? null,
    needsReviewIds: transitions.filter((view) => view.section === 'needs_review').map((view) => view.id),
    needsMeIds: transitions.filter((view) => view.section === 'needs_me').map((view) => view.id),
    waitingIds: transitions.filter((view) => view.section === 'waiting').map((view) => view.id),
    preparation,
    moneyFollowUps: followUps,
    needsReviewTasks,
    recentlyCompleted,
    isEmpty: transitions.length === 0 && preparation.length === 0 && followUps.length === 0 && needsReviewTasks.length === 0 && recentlyCompleted.length === 0,
  };
}

// --------------------------------------------------------------------------------------------------------------- detail

/** One handoff, opened — including a past or removed one. The location text exists ONLY on this view. */
export function buildTransitionDetail(state: AppState, householdId: string, eventId: string, clock: Clock): TransitionDetailView {
  const zone = zoneOf(state, clock);
  const base = { transition: null, location: null, notes: null, commitment: null, zone, people: [], children: [] };
  if (householdId !== state.household.id) return { status: 'household_mismatch', ...base };

  const ctx = contextFor(state, clock);
  const event = ctx.eventById.get(eventId);
  if (!event) return { status: 'not_found', ...base };
  if (ctx.categoryId === null || event.categoryId !== ctx.categoryId) return { status: 'not_a_handoff', ...base };

  return {
    status: 'ok',
    transition: transitionViewOf(ctx, event),
    location: event.location !== null && event.location.trim() !== '' ? event.location : null,
    notes: event.notes,
    commitment: event.commitment,
    zone,
    people: personOptions(ctx),
    children: childOptions(state),
  };
}

export function buildMoneyFollowUpDetail(state: AppState, householdId: string, taskId: string, clock: Clock): MoneyFollowUpDetailView {
  const base = { followUp: null, notes: null, people: [] as PersonOption[], children: [] as ChildOption[] };
  if (householdId !== state.household.id) return { status: 'household_mismatch', ...base };

  const ctx = contextFor(state, clock);
  const task = ctx.taskById.get(taskId);
  if (!task) return { status: 'not_found', ...base };
  if (ctx.categoryId === null || task.categoryId !== ctx.categoryId || task.value === null) return { status: 'not_a_follow_up', ...base };

  return { status: 'ok', followUp: moneyFollowUpOf(ctx, task), notes: task.notes, people: personOptions(ctx), children: childOptions(state) };
}
