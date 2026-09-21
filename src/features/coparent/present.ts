import { weekdayOf, type LocalDate } from '../../domain/logicalDay';
import { COPY, WEEKDAY_NAMES } from './copy';
import { clockLabel, dateLabel, dayLabelFor, localParts } from './time';
import type {
  ChildRef,
  CompletedEntry,
  CoParentLogisticsView,
  MoneyFollowUpDetailView,
  MoneyFollowUpView,
  PrepItemView,
  RepeatView,
  ResponsibilityView,
  ReviewReason,
  TransitionDetailView,
  TransitionView,
  UnknownFact,
} from './types';

/**
 * PRESENTATION — the words, tones and accessibility labels for a view model.
 *
 * Pure. No JSX and no state: the UI renders exactly what this returns and composes no prose of its own. Everything a screen reader
 * needs (child, date and time, responsibility, coverage, preparation, unknowns, money) is spelled out in WORDS here, so no state is
 * carried by colour alone, and the copy-truth audit can scan these strings for every fixture.
 */

export interface PresentationContext {
  /** The household-local date of "now". */
  today: LocalDate;
  /** The household zone (never the device's). */
  zone: string;
}

export type TagTone = 'neutral' | 'attention' | 'success' | 'accent';
export interface Tag {
  label: string;
  tone: TagTone;
}

export const UPCOMING_COLLAPSED = 5;

/** One screen-reader sentence run: parts joined with a single full stop each, never "..". */
export const spoken = (parts: readonly string[]): string =>
  `${parts
    .map((part) => part.trim().replace(/\.+$/, ''))
    .filter((part) => part.length > 0)
    .join('. ')}.`;

// ---------------------------------------------------------------------------------------------------------------- pieces

export function childName(child: ChildRef): string {
  if (child.status === 'known') return child.displayName;
  return child.status === 'not_recorded' ? COPY.child.notRecorded : COPY.child.unavailable;
}

const dateOfInstant = (instant: string, ctx: PresentationContext): string => dateLabel(localParts(Date.parse(instant), ctx.zone).localDate, ctx.today);

export function whenText(view: Pick<TransitionView, 'occurrence' | 'localDate' | 'minutesOfDay'>, ctx: PresentationContext): string {
  const day = dayLabelFor(view.localDate, ctx.today);
  const text = `${day} · ${clockLabel(view.minutesOfDay)}`;
  return view.occurrence === 'repeat_pattern' ? COPY.time.nextDate(text) : text;
}

export function repeatPhrase(repeat: Pick<RepeatView, 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate'>): string {
  switch (repeat.frequency) {
    case 'weekly': {
      const days = (repeat.byWeekday ?? [weekdayOf(repeat.anchorDate)]).map((d) => WEEKDAY_NAMES[d]);
      const where = COPY.repeat.weekdays(days);
      return repeat.interval === 1 ? COPY.repeat.everyWeek(where) : COPY.repeat.everyNWeeks(repeat.interval, where);
    }
    case 'monthly': {
      const day = repeat.byMonthDay ?? Number(repeat.anchorDate.slice(8, 10));
      return repeat.interval === 1 ? COPY.repeat.everyMonth(day) : COPY.repeat.everyNMonths(repeat.interval, day);
    }
    case 'daily':
      return COPY.repeat.daily(repeat.interval);
    case 'yearly':
      return COPY.repeat.yearly(repeat.interval);
  }
}

export function repeatLine(repeat: RepeatView): string {
  const phrase = repeatPhrase(repeat);
  return repeat.status === 'paused' ? COPY.repeat.paused(phrase) : COPY.repeat.line(phrase);
}

/** The sentences that say where a responsibility stands — always as what SHE recorded, and never more than the record supports. */
export function responsibilityLines(view: ResponsibilityView, ctx: PresentationContext): string[] {
  const name = view.counterpart?.label ?? COPY.responsibility.someone;
  const lines: string[] = [];

  if (view.coverage === 'needs_review') {
    lines.push(COPY.review.counterpart_unavailable(name));
    return lines;
  }

  switch (view.stage) {
    case 'none_recorded':
      lines.push(COPY.responsibility.none_recorded);
      break;
    case 'with_you':
      lines.push(view.returnedAt !== null ? COPY.responsibility.back_with_you : COPY.responsibility.with_you);
      break;
    case 'assigned':
      lines.push(view.holder === 'child' && view.holderChild !== null ? COPY.responsibility.holderChild(childName(view.holderChild)) : COPY.responsibility.assigned(name));
      break;
    case 'requested':
      lines.push(view.requestedAt !== null ? COPY.responsibility.requestedOn(name, dateOfInstant(view.requestedAt, ctx)) : COPY.responsibility.requested(name));
      break;
    case 'acknowledged':
      lines.push(COPY.responsibility.acknowledged(name));
      break;
    case 'accepted':
      lines.push(view.coverage === 'covered' ? COPY.responsibility.covered(name) : COPY.responsibility.accepted_needs(name));
      break;
    case 'declined':
      lines.push(COPY.responsibility.declined(name));
      break;
    case 'completed':
      lines.push(view.holder === 'person' ? COPY.responsibility.completed(name) : COPY.responsibility.completedSelf);
      break;
  }

  // Evidence, if and only if a real execution row exists. Otherwise say plainly that nothing was sent.
  if (view.evidence.sent) lines.push(COPY.responsibility.sentEvidence);
  if (view.evidence.delivered) lines.push(COPY.responsibility.deliveredEvidence);
  if (!view.evidence.sent && view.holder === 'person' && (view.stage === 'requested' || view.stage === 'assigned')) {
    lines.push(COPY.responsibility.notContacted(name));
  }
  return lines;
}

export function reviewLines(view: Pick<TransitionView | MoneyFollowUpView, 'review' | 'responsibility'>): string[] {
  return view.review.map((reason: ReviewReason) =>
    reason === 'counterpart_unavailable'
      ? COPY.review.counterpart_unavailable(view.responsibility.counterpart?.label ?? COPY.responsibility.someone)
      : COPY.review[reason]
  );
}

export const unknownLines = (unknowns: readonly UnknownFact[]): string[] => unknowns.map((unknown) => COPY.unknown[unknown]);

// -------------------------------------------------------------------------------------------------------------- actions

export type ResponsibilityAction =
  | 'record_asked'
  | 'acknowledged'
  | 'accepted_covered'
  | 'accepted_needs_me'
  | 'declined'
  | 'completed'
  | 'returned'
  | 'reassign'
  | 'still_needs_me'
  | 'no_longer_needs_me';

/**
 * Which recordings are legitimately available for where a responsibility stands — the same rules the domain enforces, said up front
 * so the UI never offers a control that would be refused, and NEVER offers a positive recording for a person who is no longer
 * available (an unavailable person only ever gets "take it back" or "record a different person").
 */
export function availableResponsibilityActions(view: ResponsibilityView): ResponsibilityAction[] {
  if (view.coverage === 'needs_review') return ['reassign', 'returned'];
  switch (view.stage) {
    case 'none_recorded':
    case 'declined':
      return ['record_asked'];
    case 'with_you':
      // Handed back: she may record a new request. A live self-held row cannot be delegated by the domain, so nothing is offered.
      return view.returnedAt !== null ? ['record_asked'] : [];
    case 'assigned':
      return ['completed', 'reassign', 'returned'];
    case 'requested':
      return ['acknowledged', 'accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'reassign', 'returned'];
    case 'acknowledged':
      return ['accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'reassign', 'returned'];
    case 'accepted':
      return ['completed', view.stillNeedsMe === true ? 'no_longer_needs_me' : 'still_needs_me', 'reassign', 'returned'];
    case 'completed':
      return [];
  }
}

/** The button label for a responsibility action, naming the person where a name helps. */
export function responsibilityActionLabel(action: ResponsibilityAction, personName: string): string {
  switch (action) {
    case 'record_asked':
      return COPY.actions.recordAsked;
    case 'acknowledged':
      return COPY.actions.acknowledged(personName);
    case 'accepted_covered':
      return COPY.actions.acceptedCovered(personName);
    case 'accepted_needs_me':
      return COPY.actions.acceptedNeedsMe(personName);
    case 'declined':
      return COPY.actions.declined(personName);
    case 'completed':
      return COPY.actions.partComplete(personName);
    case 'returned':
      return COPY.actions.takeBack;
    case 'reassign':
      return COPY.actions.reassign;
    case 'still_needs_me':
      return COPY.actions.stillNeedsMe;
    case 'no_longer_needs_me':
      return COPY.actions.noLongerNeedsMe;
  }
}

// ------------------------------------------------------------------------------------------------------------------- rows

export interface TransitionRowPresentation {
  id: string;
  childName: string;
  title: string;
  whenLine: string;
  statusLine: string | null;
  tags: Tag[];
  lines: string[];
  accessibilityLabel: string;
}

function tagsFor(view: TransitionView): Tag[] {
  const tags: Tag[] = [];
  if (view.section === 'needs_review') tags.push({ label: COPY.sections.needsReview, tone: 'attention' });
  else if (view.section === 'needs_me') tags.push({ label: COPY.sections.needsYou, tone: 'attention' });
  else if (view.section === 'waiting') tags.push({ label: 'Waiting', tone: 'accent' });
  if (view.responsibility.coverage === 'covered') tags.push({ label: 'Covered', tone: 'success' });
  if (view.repeat !== null) tags.push({ label: 'Repeats', tone: 'neutral' });
  return tags;
}

const statusLineFor = (view: TransitionView): string | null =>
  view.timeStatus === 'in_progress' ? COPY.time.inProgress : view.timeStatus === 'past' ? COPY.time.past : null;

/** A hub row. Deliberately carries NO location text: exact place + time is elevated-sensitivity and is shown only on detail, on request. */
export function presentTransitionRow(view: TransitionView, ctx: PresentationContext): TransitionRowPresentation {
  const name = childName(view.child);
  const whenLine = whenText(view, ctx);
  const lines: string[] = [];
  const status = statusLineFor(view);
  if (status) lines.push(status);
  lines.push(...reviewLines(view));
  if (view.review.every((reason) => reason !== 'counterpart_unavailable')) lines.push(...responsibilityLines(view.responsibility, ctx));
  lines.push(readinessLine(view.preparation));
  const tags = tagsFor(view);
  const accessibilityLabel = spoken([name, view.title, whenLine, ...tags.map((tag) => tag.label), ...lines]);
  return { id: view.id, childName: name, title: view.title, whenLine, statusLine: status, tags, lines, accessibilityLabel };
}

// ----------------------------------------------------------------------------------------------------------- preparation

export interface PrepItemPresentation {
  taskId: string;
  title: string;
  standingLabel: string;
  standing: PrepItemView['standing'];
  lines: string[];
  accessibilityLabel: string;
}

export function presentPrepItem(item: PrepItemView, ctx: PresentationContext, handoffLabel: string | null): PrepItemPresentation {
  const lines: string[] = [];
  if (item.linkedTransitionRemoved) lines.push(COPY.review.handoff_removed);
  else if (handoffLabel !== null) lines.push(COPY.prep.forHandoff(handoffLabel));
  else lines.push(COPY.prep.unlinked);
  if (item.dueDate !== null) lines.push(COPY.prep.dueOn(dateLabel(item.dueDate, ctx.today)));
  const standingLabel = COPY.prep.standing[item.standing];
  return {
    taskId: item.taskId,
    title: item.title,
    standing: item.standing,
    standingLabel,
    lines,
    accessibilityLabel: spoken([childName(item.child), item.title, standingLabel, ...lines]),
  };
}

export function readinessLine(summary: TransitionView['preparation']): string {
  switch (summary.readiness) {
    case 'waiting_on_prep':
      return COPY.prep.readiness.waiting_on_prep(summary.open, summary.linked);
    case 'no_prep_recorded':
      return COPY.prep.readiness.no_prep_recorded;
    case 'all_marked_done':
      return COPY.prep.readiness.all_marked_done;
    case 'needs_review':
      return COPY.prep.readiness.needs_review;
  }
}

// ------------------------------------------------------------------------------------------------------------------ money

export interface FollowUpPresentation {
  taskId: string;
  title: string;
  childLine: string;
  amountLine: string;
  amountNote: string;
  dateLine: string;
  statusLine: string;
  lines: string[];
  accessibilityLabel: string;
}

export function presentFollowUp(view: MoneyFollowUpView, ctx: PresentationContext): FollowUpPresentation {
  const childLine = view.child.status === 'known' ? COPY.money.forChild(view.child.displayName) : view.child.status === 'not_recorded' ? COPY.money.noChild : COPY.child.unavailable;
  const amountLine = COPY.money.amount(view.amount.decimal, view.amount.currency);
  const dateLine = view.followUpDate === null ? COPY.money.noDate : COPY.money.dueOn(dateLabel(view.followUpDate, ctx.today));
  const statusLine = view.standing === 'open' ? COPY.money.open : view.standing === 'done' ? COPY.money.done : COPY.money.removed;
  const lines: string[] = [];
  if (view.review.length > 0) lines.push(...reviewLines(view));
  else if (view.responsibility.stage !== 'none_recorded') lines.push(...responsibilityLines(view.responsibility, ctx));
  if (view.paymentEvidence === 'service_reported_paid') lines.push(COPY.money.paymentReported);
  return {
    taskId: view.taskId,
    title: view.title,
    childLine,
    amountLine,
    amountNote: COPY.money.amountNote,
    dateLine,
    statusLine,
    lines,
    accessibilityLabel: spoken([view.title, childLine, amountLine, dateLine, statusLine, ...lines]),
  };
}

// ------------------------------------------------------------------------------------------------------------ completed

export interface CompletedPresentation {
  key: string;
  title: string;
  childLine: string;
  line: string;
  accessibilityLabel: string;
}

export function presentCompleted(entry: CompletedEntry, ctx: PresentationContext): CompletedPresentation {
  const when = dateOfInstant(entry.completedAt, ctx);
  const name = entry.counterpart?.label ?? null;
  const line =
    entry.kind === 'responsibility'
      ? `${name !== null ? COPY.responsibility.completed(name) : COPY.responsibility.completedSelf} (${when})`
      : entry.followUp
        ? `${COPY.money.done} (${when})`
        : `${COPY.prep.doneShort} (${when})`;
  const childLine = childName(entry.child);
  return { key: `${entry.kind}:${entry.id}`, title: entry.title, childLine, line, accessibilityLabel: spoken([childLine, entry.title, line]) };
}

// ------------------------------------------------------------------------------------------------------------------ detail

export interface TransitionDetailPresentation {
  title: string;
  childName: string;
  whenLine: string;
  zoneNote: string | null;
  statusLine: string | null;
  repeatLines: string[];
  responsibilityLines: string[];
  needsYouLines: string[];
  preparationLine: string;
  unknownLines: string[];
  reviewLines: string[];
  locationLabel: string;
  privacyLine: string | null;
  accessibilityLabel: string;
}

export function presentTransitionDetail(detail: TransitionDetailView, ctx: PresentationContext): TransitionDetailPresentation | null {
  const view = detail.transition;
  if (detail.status !== 'ok' || view === null) return null;
  const row = presentTransitionRow(view, ctx);
  const repeatLines: string[] = [];
  if (view.repeat !== null) {
    repeatLines.push(repeatLine(view.repeat));
    if (view.occurrence === 'repeat_pattern') repeatLines.push(COPY.repeat.forRecordedDate(dateLabel(view.recordedLocalDate, ctx.today)));
  }
  const needsYouLines = view.needsMeReasons.map((reason) => COPY.needsYouReason[reason]);
  const preparationLine = readinessLine(view.preparation);
  // An unknown that the detail already says in its own row (responsibility, preparation, location, child review) is not repeated.
  const alreadyStated: readonly UnknownFact[] = ['location_not_recorded', 'counterpart_not_recorded', 'preparation_not_recorded', 'child_not_recorded'];
  const unknown = unknownLines(view.unknowns.filter((u) => !alreadyStated.includes(u)));
  const locationLabel = view.hasLocation ? COPY.privacy.locationRecorded : COPY.privacy.noLocation;
  const responsibility = responsibilityLines(view.responsibility, ctx);
  return {
    title: view.title,
    childName: row.childName,
    whenLine: row.whenLine,
    zoneNote: detail.zone.differs ? COPY.time.zoneNote(detail.zone.household) : null,
    statusLine: row.statusLine,
    repeatLines,
    responsibilityLines: responsibility,
    needsYouLines,
    preparationLine,
    unknownLines: unknown,
    reviewLines: reviewLines(view),
    locationLabel,
    privacyLine: view.ownerOnly ? COPY.privacy.ownerOnly : null,
    accessibilityLabel: spoken([row.childName, view.title, row.whenLine, ...responsibility, preparationLine, ...unknown, locationLabel]),
  };
}

export function presentFollowUpDetail(detail: MoneyFollowUpDetailView, ctx: PresentationContext): FollowUpPresentation | null {
  return detail.status === 'ok' && detail.followUp !== null ? presentFollowUp(detail.followUp, ctx) : null;
}

// -------------------------------------------------------------------------------------------------------------------- hub

export interface HubPresentation {
  title: string;
  subtitle: string;
  footnote: string;
  hubHint: string;
  zoneNote: string | null;
  next: TransitionRowPresentation | null;
  needsYou: TransitionRowPresentation[];
  waiting: TransitionRowPresentation[];
  needsReview: TransitionRowPresentation[];
  needsReviewTasks: Array<{ taskId: string; title: string; childLine: string; lines: string[]; accessibilityLabel: string }>;
  upcoming: TransitionRowPresentation[];
  upcomingHidden: number;
  preparation: Array<{ heading: string; items: PrepItemPresentation[] }>;
  money: FollowUpPresentation[];
  recentlyCompleted: CompletedPresentation[];
  /** Set ONLY when nothing at all is represented. It says nothing about the world outside Her Keys. */
  empty: { title: string; body: string } | null;
  blocked: Array<{ code: string; title: string; body: string }>;
}

export function presentHub(view: CoParentLogisticsView, ctx: PresentationContext, options: { showAllUpcoming?: boolean } = {}): HubPresentation {
  const byId = new Map(view.transitions.map((transition) => [transition.id, transition]));
  const row = (id: string) => presentTransitionRow(byId.get(id) as TransitionView, ctx);
  const notNext = (id: string) => id !== view.nextTransitionId;

  const claimed = new Set<string>([...(view.nextTransitionId ? [view.nextTransitionId] : []), ...view.needsMeIds, ...view.waitingIds, ...view.needsReviewIds]);
  const restIds = view.transitions.map((transition) => transition.id).filter((id) => !claimed.has(id));
  const shown = options.showAllUpcoming ? restIds : restIds.slice(0, UPCOMING_COLLAPSED);

  const handoffLabelOf = (item: PrepItemView): string | null => {
    if (item.linkedTransitionId === null) return null;
    const linked = byId.get(item.linkedTransitionId);
    return linked ? `${linked.title} · ${dayLabelFor(linked.localDate, ctx.today)}` : null;
  };

  return {
    title: COPY.screen.title,
    subtitle: COPY.screen.subtitle,
    footnote: COPY.screen.footnote,
    hubHint: COPY.screen.hubHint,
    zoneNote: view.zone.differs ? COPY.time.zoneNote(view.zone.household) : null,
    next: view.nextTransitionId ? row(view.nextTransitionId) : null,
    needsYou: view.needsMeIds.filter(notNext).map(row),
    waiting: view.waitingIds.filter(notNext).map(row),
    needsReview: view.needsReviewIds.filter(notNext).map(row),
    needsReviewTasks: view.needsReviewTasks.map((task) => {
      const childLine = childName(task.child);
      const lines = task.reasons.map((reason) => (reason === 'counterpart_unavailable' ? COPY.review.counterpart_unavailable(COPY.responsibility.someone) : COPY.review[reason]));
      return { taskId: task.taskId, title: task.title, childLine, lines, accessibilityLabel: spoken([childLine, task.title, ...lines]) };
    }),
    upcoming: shown.map(row),
    upcomingHidden: restIds.length - shown.length,
    preparation: view.preparation.map((group) => ({
      heading: childName(group.child),
      items: group.items.map((item) => presentPrepItem(item, ctx, handoffLabelOf(item))),
    })),
    money: view.moneyFollowUps.map((followUp) => presentFollowUp(followUp, ctx)),
    recentlyCompleted: view.recentlyCompleted.map((entry) => presentCompleted(entry, ctx)),
    empty: view.isEmpty ? { title: COPY.states.emptyTitle, body: COPY.states.emptyBody } : null,
    blocked: view.capability.blocked.map((code) => ({ code, ...COPY.blocked[code] })),
  };
}

/** Every string a hub presentation would show — flattened, for the copy-truth audit. */
export function hubTextManifest(hub: HubPresentation): string[] {
  const out: string[] = [hub.title, hub.subtitle, hub.footnote, hub.hubHint];
  if (hub.zoneNote) out.push(hub.zoneNote);
  const rows = [...(hub.next ? [hub.next] : []), ...hub.needsYou, ...hub.waiting, ...hub.needsReview, ...hub.upcoming];
  for (const r of rows) out.push(r.childName, r.title, r.whenLine, ...(r.statusLine ? [r.statusLine] : []), ...r.tags.map((t) => t.label), ...r.lines, r.accessibilityLabel);
  for (const t of hub.needsReviewTasks) out.push(t.childLine, t.title, ...t.lines, t.accessibilityLabel);
  for (const g of hub.preparation) {
    out.push(g.heading);
    for (const i of g.items) out.push(i.title, i.standingLabel, ...i.lines, i.accessibilityLabel);
  }
  for (const m of hub.money) out.push(m.title, m.childLine, m.amountLine, m.amountNote, m.dateLine, m.statusLine, ...m.lines, m.accessibilityLabel);
  for (const c of hub.recentlyCompleted) out.push(c.title, c.childLine, c.line, c.accessibilityLabel);
  if (hub.empty) out.push(hub.empty.title, hub.empty.body);
  for (const b of hub.blocked) out.push(b.title, b.body);
  return out;
}
