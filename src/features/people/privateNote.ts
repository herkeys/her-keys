import type { LocalDate } from '../../domain/logicalDay';
import { isCoParent } from '../../domain/people';
import type { AppState } from '../../domain/state';
import { formatFollowUpDate, peopleCopy } from './copy';
import { contextTargetActive, parsePersonKey, type PersonSource } from './projection';

/**
 * THE ONE READ PATH TO A PRIVATE NOTE (HK-FEATURE-13).
 *
 * `contextNote` is private memory. It is read here and nowhere else in People OS, and this is called only by the person's own
 * detail/edit screen. It never reaches the People list, the verdict, the Life tile, Today, a follow-up Task title, a search snippet,
 * a log line or an error: none of those code paths import this file (a static test holds every other People file to that).
 */

export interface PersonDetail {
  key: string;
  source: PersonSource;
  displayName: string;
  kindLabel: string | null;
  /** 'active' | 'archived' for a non-account person; a child is always 'active' (Kids has no archive). */
  identityStatus: 'active' | 'archived';
  /** Rename / archive / restore from People: a non-account person who is not the co-parent. */
  identityEditable: boolean;
  /** Why the identity is read-only here, when it is. */
  readOnlyReason: string | null;
  context: {
    id: string;
    status: 'active' | 'archived';
    relationshipLabel: string | null;
    organizationLabel: string | null;
    contextNote: string | null;
  } | null;
  /** Every follow-up created from this context: open ones first by the same work ordering, then done/archived ones. */
  followUps: Array<{ taskId: string; title: string; status: 'open' | 'completed' | 'archived'; whenText: string }>;
  /** Whether a follow-up can be added right now (an active context about a live person). */
  canAddFollowUp: boolean;
}

export function personDetail(state: AppState, key: string, today: LocalDate): PersonDetail | null {
  const source = parsePersonKey(key);
  if (!source) return null;

  let displayName: string;
  let kindLabel: string | null = null;
  let identityStatus: 'active' | 'archived' = 'active';
  let identityEditable = false;
  let readOnlyReason: string | null = null;
  if (source.kind === 'child') {
    const child = state.children.find((c) => c.id === source.id);
    if (!child || child.id === state.user.id) return null;
    displayName = child.displayName;
    kindLabel = peopleCopy.kind.child;
    readOnlyReason = peopleCopy.detail.readOnlyChild;
  } else {
    const person = state.people.find((p) => p.id === source.id);
    if (!person) return null;
    displayName = person.displayName;
    identityStatus = person.status;
    if (isCoParent(person)) {
      kindLabel = peopleCopy.kind.coParent;
      readOnlyReason = peopleCopy.detail.readOnlyCoParent;
    } else {
      identityEditable = true;
    }
  }

  const context = (state.personContexts ?? []).find((c) => (source.kind === 'child' ? c.childId === source.id : c.personId === source.id)) ?? null;
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const followUps: PersonDetail['followUps'] = [];
  if (context) {
    const linked = (state.personTaskLinks ?? []).filter((l) => l.contextId === context.id).map((l) => tasks.get(l.followUp.id)).filter((t) => t !== undefined);
    const rank = (status: string) => (status === 'open' ? 0 : 1);
    const dueKey = (date: string | null) => date ?? '9999-12-31';
    linked.sort((a, b) => rank(a.status) - rank(b.status) || (dueKey(a.dueDate) < dueKey(b.dueDate) ? -1 : dueKey(a.dueDate) > dueKey(b.dueDate) ? 1 : 0) || (a.id < b.id ? -1 : 1));
    for (const task of linked) {
      const when = task.status !== 'open' ? peopleCopy.followUp.completed : task.dueDate === null ? peopleCopy.followUp.undated
        : task.dueDate < today ? peopleCopy.followUp.overdue(formatFollowUpDate(task.dueDate, today)) : peopleCopy.followUp.due(formatFollowUpDate(task.dueDate, today));
      followUps.push({ taskId: task.id, title: task.title, status: task.status, whenText: when });
    }
  }

  return {
    key,
    source,
    displayName,
    kindLabel,
    identityStatus,
    identityEditable,
    readOnlyReason,
    context: context && {
      id: context.id,
      status: context.status,
      relationshipLabel: context.relationshipLabel,
      organizationLabel: context.organizationLabel,
      contextNote: context.contextNote,
    },
    followUps,
    canAddFollowUp: context !== null && context.status === 'active' && contextTargetActive(state, context),
  };
}
