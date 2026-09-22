import { addDays, logicalDateAt, type LocalDate } from '../../domain/logicalDay';
import { linkedTasksOf, openLinkedTaskCount } from '../../domain/lifeRecords';
import type { AppState, LifeRecord, LifeRecordLinkRelation } from '../../domain/state';
import { KIND_LABEL, LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';
import { recordDate } from './lifeAdminDates';
import { maskReference } from './sensitive';

/**
 * THE LIFE ADMIN PROJECTION: pure, from canonical state and logical today, and nothing else.
 *
 * Whether a date has passed is worked out here, every time, and never stored. A date-only expiration date has passed from the
 * NEXT calendar day in her timezone (logical today comes from the store, which derives it from her profile timezone), so a record
 * whose recorded expiration date IS today is "expires today", not passed. Nothing here infers a consequence: a passed date is a
 * passed date, not an invalid document, and a record is never "renewed" because a Task was completed.
 *
 * Privacy is structural: the home, the Life hub summary and every list row are built from title, kind/type, a child's current
 * name and DATES only. The reference number, the location hint and the note are read by `buildRecordDetail` alone.
 */

/** The home shows at most this many Needs Review items, then "See all" (addendum I). */
export const NEEDS_REVIEW_CAP = 3;
/** "Coming up" means within the next 14 calendar days (addendum K). A projection constant: stored nowhere, creating nothing. */
export const UPCOMING_WINDOW_DAYS = 14;
/** The Coming Up section lists at most this many records. */
export const COMING_UP_CAP = 5;

export type ReviewReason = 'renew-by' | 'review-on' | 'expired';
export type UpcomingReason = 'renew-by' | 'review-on' | 'expires';

export interface ReviewItem {
  recordId: string;
  title: string;
  /** 1 = an explicit renew-by or review date is today or past; 2 = the recorded expiration date has passed (addendum I/J). */
  category: 1 | 2;
  reason: ReviewReason;
  /** The applicable date: the OLDEST one of its category. */
  date: LocalDate;
  text: string;
}

export interface UpcomingItem {
  recordId: string;
  title: string;
  reason: UpcomingReason;
  date: LocalDate;
  text: string;
}

export interface RecordRow {
  recordId: string;
  title: string;
  /** Her own type name when she gave one, otherwise the broad kind. */
  kindText: string;
  /** The child it is about, by current name; null when it is about no child. */
  subjectText: string | null;
  /** One factual date line, or null when there is nothing dated to say. */
  dateText: string | null;
  openTaskText: string | null;
  needsReview: boolean;
}

export interface ArchivedRow {
  recordId: string;
  title: string;
  archivedText: string;
}

export interface LifeAdminView {
  /** `empty` only when she has never kept a record here: no active and no archived records. */
  phase: 'empty' | 'records';
  verdict: string;
  needsReview: ReviewItem[];
  needsReviewShown: ReviewItem[];
  needsReviewMore: number;
  comingUp: UpcomingItem[];
  records: RecordRow[];
  archived: ArchivedRow[];
}

const byDateThenId = <T extends { date: LocalDate; recordId: string }>(a: T, b: T): number =>
  a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;

const oldest = (dates: Array<LocalDate | null>): LocalDate | null =>
  dates.reduce<LocalDate | null>((min, date) => (date === null ? min : min === null || date < min ? date : min), null);

/** The one Needs Review item a record contributes, or null. A record appears once, under its highest-priority category. */
export function reviewItemOf(record: LifeRecord, today: LocalDate): ReviewItem | null {
  if (record.status !== 'active') return null;
  const renewDue = record.renewBy !== null && record.renewBy <= today ? record.renewBy : null;
  const reviewDue = record.reviewOn !== null && record.reviewOn <= today ? record.reviewOn : null;
  const first = oldest([renewDue, reviewDue]);
  if (first !== null) {
    const reason: ReviewReason = first === renewDue ? 'renew-by' : 'review-on';
    const text =
      reason === 'renew-by'
        ? first === today ? COPY.renewByToday : COPY.renewByWas(recordDate(first))
        : first === today ? COPY.reviewToday : COPY.reviewWas(recordDate(first));
    return { recordId: record.id, title: record.title, category: 1, reason, date: first, text };
  }
  // A date-only expiration has passed from the NEXT day: equal to today is "expires today", which is upcoming, not passed.
  if (record.expiresOn !== null && record.expiresOn < today) {
    return { recordId: record.id, title: record.title, category: 2, reason: 'expired', date: record.expiresOn, text: COPY.expiredOn(recordDate(record.expiresOn)) };
  }
  return null;
}

/** The earliest explicit date a record has inside the upcoming window, or null. */
export function upcomingItemOf(record: LifeRecord, today: LocalDate): UpcomingItem | null {
  if (record.status !== 'active') return null;
  const end = addDays(today, UPCOMING_WINDOW_DAYS);
  const candidates: UpcomingItem[] = [];
  if (record.renewBy !== null && record.renewBy > today && record.renewBy <= end) {
    candidates.push({ recordId: record.id, title: record.title, reason: 'renew-by', date: record.renewBy, text: COPY.renewByOn(recordDate(record.renewBy)) });
  }
  if (record.reviewOn !== null && record.reviewOn > today && record.reviewOn <= end) {
    candidates.push({ recordId: record.id, title: record.title, reason: 'review-on', date: record.reviewOn, text: COPY.reviewOn(recordDate(record.reviewOn)) });
  }
  if (record.expiresOn !== null && record.expiresOn >= today && record.expiresOn <= end) {
    candidates.push({
      recordId: record.id,
      title: record.title,
      reason: 'expires',
      date: record.expiresOn,
      text: record.expiresOn === today ? COPY.expiresToday : COPY.expiresOn(recordDate(record.expiresOn)),
    });
  }
  return candidates.sort(byDateThenId)[0] ?? null;
}

/** Addendum I: category 1 (oldest date first), then category 2 (oldest first), then id. */
export function needsReviewOf(state: Pick<AppState, 'lifeRecords'>, today: LocalDate): ReviewItem[] {
  return state.lifeRecords
    .map((record) => reviewItemOf(record, today))
    .filter((item): item is ReviewItem => item !== null)
    .sort((a, b) => (a.category !== b.category ? a.category - b.category : byDateThenId(a, b)));
}

/** Addendum J: ONE category, count-aware, in priority order. Never combines categories and never infers a consequence. */
export function verdictOf(review: ReviewItem[], upcoming: UpcomingItem[]): string {
  const first = review.filter((item) => item.category === 1).length;
  if (first > 0) return COPY.verdictNeedsReview(first);
  const second = review.filter((item) => item.category === 2).length;
  if (second > 0) return COPY.verdictExpired(second);
  const next = [...upcoming].sort(byDateThenId)[0];
  if (next !== undefined) return COPY.verdictNext(next.title, recordDate(next.date));
  return COPY.verdictNothing;
}

function subjectTextOf(state: Pick<AppState, 'children'>, record: LifeRecord): string | null {
  if (record.subjectMemberId === null) return null;
  // Resolved by canonical id, every time, to the child's CURRENT name. A missing child is said as missing, never guessed.
  return state.children.find((child) => child.id === record.subjectMemberId)?.displayName ?? COPY.subjectMissing;
}

function quietDateText(record: LifeRecord): string | null {
  if (record.expiresOn !== null) return COPY.expiresOn(recordDate(record.expiresOn));
  if (record.renewBy !== null) return COPY.renewByOn(recordDate(record.renewBy));
  if (record.reviewOn !== null) return COPY.reviewOn(recordDate(record.reviewOn));
  if (record.issuedOn !== null) return COPY.issuedOnLine(recordDate(record.issuedOn));
  return null;
}

/**
 * The home. Active records only, in the brief's order: Needs Review first (in review order), then records with an upcoming
 * explicit date (soonest first), then the rest by most recently updated, id as the final tie-break. No importance score.
 */
export function buildLifeAdminView(state: Pick<AppState, 'lifeRecords' | 'lifeRecordLinks' | 'tasks' | 'children' | 'user'>, today: LocalDate): LifeAdminView {
  const active = state.lifeRecords.filter((record) => record.status === 'active');
  const archivedRecords = state.lifeRecords.filter((record) => record.status === 'archived');

  const review = needsReviewOf(state, today);
  const reviewIds = new Set(review.map((item) => item.recordId));
  const upcomingAll = active
    .map((record) => upcomingItemOf(record, today))
    .filter((item): item is UpcomingItem => item !== null)
    .sort(byDateThenId);
  const comingUp = upcomingAll.filter((item) => !reviewIds.has(item.recordId)).slice(0, COMING_UP_CAP);

  const rank = new Map<string, number>();
  review.forEach((item, index) => rank.set(item.recordId, index));
  upcomingAll.forEach((item, index) => {
    if (!rank.has(item.recordId)) rank.set(item.recordId, review.length + index);
  });
  const ordered = [...active].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    }
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const reviewById = new Map(review.map((item) => [item.recordId, item]));
  const upcomingById = new Map(upcomingAll.map((item) => [item.recordId, item]));
  const records: RecordRow[] = ordered.map((record) => {
    const open = openLinkedTaskCount(state, record.id);
    return {
      recordId: record.id,
      title: record.title,
      kindText: record.typeName ?? KIND_LABEL[record.kind],
      subjectText: subjectTextOf(state, record),
      dateText: reviewById.get(record.id)?.text ?? upcomingById.get(record.id)?.text ?? quietDateText(record),
      openTaskText: open > 0 ? COPY.openTasks(open) : null,
      needsReview: reviewById.has(record.id),
    };
  });

  const archived: ArchivedRow[] = [...archivedRecords]
    .sort((a, b) => ((a.archivedAt ?? '') !== (b.archivedAt ?? '') ? ((a.archivedAt ?? '') > (b.archivedAt ?? '') ? -1 : 1) : a.id < b.id ? -1 : 1))
    .map((record) => ({ recordId: record.id, title: record.title, archivedText: COPY.archivedOn(recordDate(logicalDateAt(Date.parse(record.archivedAt ?? record.updatedAt), state.user.timezone))) }));

  return {
    phase: active.length === 0 && archivedRecords.length === 0 ? 'empty' : 'records',
    verdict: verdictOf(review, upcomingAll),
    needsReview: review,
    needsReviewShown: review.slice(0, NEEDS_REVIEW_CAP),
    needsReviewMore: Math.max(0, review.length - NEEDS_REVIEW_CAP),
    comingUp,
    records,
    archived,
  };
}

/**
 * The Life hub row (addendum T). A count and nothing else: no title, reference, note, location, issuer or child name ever reaches
 * the hub.
 */
export function lifeAdminHubSummary(state: Pick<AppState, 'lifeRecords'>, today: LocalDate): { value: string; needsAttention: boolean } {
  const review = needsReviewOf(state, today).length;
  if (review > 0) return { value: COPY.hubReview(review), needsAttention: true };
  const active = state.lifeRecords.filter((record) => record.status === 'active').length;
  return { value: active > 0 ? COPY.hubCount(active) : COPY.hubNothing, needsAttention: false };
}

// ---------------------------------------------------------------------------------------------------------- detail ---

export interface DetailDate {
  key: 'issuedOn' | 'expiresOn' | 'renewBy' | 'reviewOn';
  label: string;
  value: string;
  /** A factual status for the date, or null. Never a consequence. */
  status: string | null;
}

export interface DetailTask {
  taskId: string;
  relation: LifeRecordLinkRelation;
  title: string | null;
  standing: string;
  open: boolean;
}

export interface RecordDetail {
  recordId: string;
  title: string;
  kindText: string;
  typeName: string | null;
  issuerName: string | null;
  /** The masked form, shown by default. */
  maskedReference: string | null;
  /** The full value, for the detail's explicit Reveal only. */
  referenceNumber: string | null;
  locationHint: string | null;
  note: string | null;
  subjectText: string | null;
  dates: DetailDate[];
  archived: boolean;
  tasks: DetailTask[];
  openTaskCount: number;
}

/** The record's own detail: the ONE place its sensitive fields are read. Null when the record is not on this device. */
export function buildRecordDetail(state: Pick<AppState, 'lifeRecords' | 'lifeRecordLinks' | 'tasks' | 'children'>, today: LocalDate, recordId: string): RecordDetail | null {
  const record = state.lifeRecords.find((row) => row.id === recordId);
  if (record === undefined) return null;

  const dates: DetailDate[] = [];
  if (record.issuedOn !== null) dates.push({ key: 'issuedOn', label: COPY.fieldIssued, value: recordDate(record.issuedOn), status: null });
  if (record.expiresOn !== null) {
    const status = record.expiresOn < today ? COPY.expiredOn(recordDate(record.expiresOn)) : record.expiresOn === today ? COPY.expiresToday : null;
    dates.push({ key: 'expiresOn', label: COPY.fieldExpires, value: recordDate(record.expiresOn), status });
  }
  if (record.renewBy !== null) {
    const status = record.renewBy < today ? COPY.renewByWas(recordDate(record.renewBy)) : record.renewBy === today ? COPY.renewByToday : null;
    dates.push({ key: 'renewBy', label: COPY.fieldRenewBy, value: recordDate(record.renewBy), status });
  }
  if (record.reviewOn !== null) {
    const status = record.reviewOn < today ? COPY.reviewWas(recordDate(record.reviewOn)) : record.reviewOn === today ? COPY.reviewToday : null;
    dates.push({ key: 'reviewOn', label: COPY.fieldReviewOn, value: recordDate(record.reviewOn), status });
  }

  const tasks: DetailTask[] = linkedTasksOf(state, record.id).map((linked) => {
    const task = linked.task;
    if (task === null) return { taskId: linked.taskId, relation: linked.relation, title: null, standing: COPY.taskUnavailable, open: false };
    const standing =
      task.status === 'open' ? (task.dueDate === null ? COPY.taskOpen : COPY.taskOpenDue(recordDate(task.dueDate))) : task.status === 'completed' ? COPY.taskDone : COPY.taskArchived;
    return { taskId: task.id, relation: linked.relation, title: task.title, standing, open: task.status === 'open' };
  });

  return {
    recordId: record.id,
    title: record.title,
    kindText: KIND_LABEL[record.kind],
    typeName: record.typeName,
    issuerName: record.issuerName,
    maskedReference: maskReference(record.referenceNumber),
    referenceNumber: record.referenceNumber,
    locationHint: record.locationHint,
    note: record.note,
    subjectText: subjectTextOf(state, record),
    dates,
    archived: record.status === 'archived',
    tasks,
    openTaskCount: openLinkedTaskCount(state, record.id),
  };
}
