import type {
  AppState,
  HouseholdCategory,
  NeedsMeItem,
  OnboardingStep,
  OneMoveRecord,
  Task,
  VisibilityScope,
} from '../state';
import { resolveOnboardingOptionId, type OnboardingGroup } from '../../data/catalog/onboardingOptions';
import type { AccountId } from './identity';
import type { ClaimKind, IdentityRecord, RejectedReason } from './binding';

/**
 * THE CLAIM DECISION BOUNDARY.
 *
 * One place answers "what should happen when this account signs in on this
 * device?" — and it answers it from the local household and the recorded
 * binding, never from whatever screen happens to be open.
 */

/** What the local device is holding, reduced to the facts the decision turns on. */
export interface LocalHousehold {
  origin: AppState['origin'];
  /** Anything she actually entered. A bare empty household is not worth claiming. */
  hasContent: boolean;
  onboardingComplete: boolean;
}

export function describeLocalHousehold(state: AppState): LocalHousehold {
  return {
    origin: state.origin,
    hasContent:
      state.events.length > 0 ||
      state.tasks.length > 0 ||
      state.needsMe.length > 0 ||
      state.oneMoves.length > 0 ||
      state.actions.length > 0 ||
      state.children.length > 0 ||
      state.discovery !== null ||
      state.onboarding.goalIds.length > 0 ||
      state.onboarding.strengthIds.length > 0 ||
      state.onboarding.struggleIds.length > 0,
    onboardingComplete: state.onboarding.completedAt !== null,
  };
}

export type BindingDecision =
  /** Nothing local worth keeping: create the account server-side and start clean. */
  | { mode: 'bootstrap' }
  /** A real local household comes with her. */
  | { mode: 'claim'; onboardingComplete: boolean }
  /** Already bound to this same account — nothing to do but carry on. */
  | { mode: 'resume'; householdId: string }
  /** Local data belongs to someone else. Preserve it, show nothing, upload nothing. */
  | { mode: 'quarantine'; otherAccountId: AccountId }
  /**
   * The demo household is a local rehearsal, never a person's real life. It is
   * refused as a whole rather than filtered — fail closed, never filter
   * (B4-P0-010) — and the server refuses it a second time independently.
   */
  | { mode: 'refuseDemo' };

export function decideBinding(
  local: LocalHousehold,
  identity: IdentityRecord,
  signedInAs: AccountId
): BindingDecision {
  const bound = identity.binding;

  if (bound !== null) {
    return bound.accountId === signedInAs
      ? { mode: 'resume', householdId: bound.householdId }
      : { mode: 'quarantine', otherAccountId: bound.accountId as AccountId };
  }

  // An unbound device can still be holding a household from a claim that was
  // interrupted mid-flight by a different account. The receipt outlives the
  // crash even though the binding never got written.
  if (identity.receipt !== null && identity.receipt.accountId !== signedInAs && local.hasContent) {
    return { mode: 'quarantine', otherAccountId: identity.receipt.accountId as AccountId };
  }

  if (local.origin === 'demo') return { mode: 'refuseDemo' };
  if (!local.hasContent) return { mode: 'bootstrap' };
  return { mode: 'claim', onboardingComplete: local.onboardingComplete };
}

export function claimKindOf(decision: BindingDecision): ClaimKind | null {
  if (decision.mode === 'bootstrap') return 'bootstrap';
  if (decision.mode === 'claim') return 'claim';
  return null;
}

/**
 * Where onboarding picks up after a claim.
 *
 * Completed onboarding stays completed — signing in is not a reason to ask her
 * the questions again. Incomplete onboarding resumes at exactly the step she
 * left, not at the beginning (B4-P0-033).
 */
export type OnboardingResume =
  | { kind: 'complete' }
  | { kind: 'resume'; step: OnboardingStep }
  | { kind: 'start' };

export function onboardingResume(state: AppState): OnboardingResume {
  if (state.onboarding.completedAt !== null) return { kind: 'complete' };
  return state.onboarding.lastStep === null
    ? { kind: 'start' }
    : { kind: 'resume', step: state.onboarding.lastStep };
}

/**
 * AMD-01: stable option ids are canonical and labels are presentation. A
 * household that still carries a label where an id belongs is normalized
 * BEFORE it is bound, so the cloud never stores a display string as identity.
 *
 * A value that resolves to neither is reported rather than dropped: losing a
 * selection silently during the one irreversible step of her account's life is
 * worse than refusing to proceed.
 */
export interface NormalizedOnboarding {
  goalIds: string[];
  strengthIds: string[];
  struggleIds: string[];
  /** Values that matched no id and no label, as `group:value`. */
  unresolved: string[];
  /** Values that arrived as a label and were rewritten to their id. */
  rewritten: string[];
}

export function normalizeOnboardingIds(state: AppState): NormalizedOnboarding {
  const unresolved: string[] = [];
  const rewritten: string[] = [];

  const normalizeGroup = (group: OnboardingGroup, values: readonly string[]): string[] => {
    const out: string[] = [];
    for (const value of values) {
      const id = resolveOnboardingOptionId(group, value);
      if (id === null) {
        unresolved.push(`${group}:${value}`);
        continue;
      }
      if (id !== value) rewritten.push(`${group}:${value}`);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  return {
    goalIds: normalizeGroup('goals', state.onboarding.goalIds),
    strengthIds: normalizeGroup('strengths', state.onboarding.strengthIds),
    struggleIds: normalizeGroup('struggles', state.onboarding.struggleIds),
    unresolved,
    rewritten,
  };
}

/**
 * THE CLAIM PAYLOAD — `claimPayloadVersion: 1`.
 *
 * The first shipping claim payload contract (B4-BE02-OR-001). It carries the
 * historical One Move records and the MINIMUM TRANSITIVE DEPENDENCY SET that
 * makes them valid in the cloud, and nothing else:
 *
 *   One Move (selected|completed)
 *     -> task     -> category (the cloud column is NOT NULL)
 *                 -> child member, when the task names a child subject
 *     -> needsMe  -> category, only when the item actually has one
 *
 * Unrelated tasks, Needs Me items, categories and children are not sent, and
 * the server rejects a payload that carries them rather than ignoring the
 * extras. Everything else she owns — events, systems, meals, Discovery — is
 * B4-BACKEND-03's job. Claim is not sync.
 */
export const CLAIM_PAYLOAD_VERSION = 1;

export interface ClaimOneMove {
  localId: string;
  logicalDay: string;
  targetType: 'task' | 'needsMe';
  targetLocalId: string | null;
  status: OneMoveRecord['status'];
  decidedAt: string;
  completedAt: string | null;
}

export interface ClaimTask {
  localId: string;
  title: string;
  categoryLocalId: string;
  subjectMemberLocalId: string | null;
  durationMinutes: number;
  commitment: Task['commitment'];
  dueDate: string | null;
  planKind: Task['plan']['kind'];
  plannedDate: string | null;
  plannedStartsAt: string | null;
  notes: string | null;
  status: Task['status'];
  completedAt: string | null;
  /** Her device's clock, kept distinct from the server's own `created_at`. */
  originCreatedAt: string | null;
  originUpdatedAt: string | null;
  scope: VisibilityScope;
}

export interface ClaimNeedsMeItem {
  localId: string;
  title: string;
  status: NeedsMeItem['status'];
  dueDate: string | null;
  categoryLocalId: string | null;
  originCreatedAt: string;
  scope: 'personal';
}

export interface ClaimCategory {
  localId: string;
  name: string;
  systemRole: string | null;
  status: HouseholdCategory['status'];
  sortOrder: number;
  scope: VisibilityScope;
}

export interface ClaimChildMember {
  localId: string;
  displayName: string;
  birthDate: string;
}

export interface ClaimPayload {
  claimPayloadVersion: typeof CLAIM_PAYLOAD_VERSION;
  origin: AppState['origin'];
  childMembers: ClaimChildMember[];
  categories: ClaimCategory[];
  tasks: ClaimTask[];
  needsMeItems: ClaimNeedsMeItem[];
  oneMoves: ClaimOneMove[];
}

/** Local state contradicts something the app already guarantees about itself. */
export class ClaimInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimInvariantError';
  }
}

/**
 * The frozen cloud target set: a real household's One Move targets a task or a
 * Needs Me item, and nothing else.
 *
 * `catalog` is deliberately absent. Real households CAN hold catalog One Moves
 * — the v1 → v2 migration stamped that value onto every v1 record regardless of
 * origin — and they are remediated into migration evidence during the v2 → v3
 * migration, before any of this runs (B4-BE02-OR-002). One arriving here means
 * that remediation did not happen, which is a local invariant failure. It is
 * refused, never silently filtered, restatused or dropped: quietly discarding
 * her history is the one outcome nobody asked for.
 */
const CLOUD_TARGET_TYPES: ReadonlySet<string> = new Set(['task', 'needsMe']);

/**
 * `origin` is carried through unchanged, including when it is `demo`. The
 * client already refuses a demo claim; sending the truth means the server
 * refuses it too, and neither side is trusting the other to have done it.
 *
 * Every failure here is a throw rather than a result, because `validateAppState`
 * already guarantees that One Move targets, task categories and child subjects
 * all resolve. Reaching one of these means state got in without being
 * validated, which is a bug to surface, not a situation to explain to her.
 */
export function buildClaimPayload(state: AppState): ClaimPayload {
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  const needsMeById = new Map(state.needsMe.map((item) => [item.id, item]));
  const categoryById = new Map(state.categories.map((category) => [category.id, category]));
  const childById = new Map(state.children.map((child) => [child.id, child]));

  const neededTasks = new Set<string>();
  const neededItems = new Set<string>();
  const neededCategories = new Set<string>();
  const neededChildren = new Set<string>();

  const oneMoves: ClaimOneMove[] = state.oneMoves.map((record) => {
    if (!CLOUD_TARGET_TYPES.has(record.targetType)) {
      throw new ClaimInvariantError(
        `One Move ${record.id} has targetType '${record.targetType}', which no real household may claim. ` +
          'A legacy catalog record should have been remediated into migration evidence by the v2 -> v3 migration (B4-BE02-OR-002).'
      );
    }

    const carries = record.status === 'selected' || record.status === 'completed';
    if (carries) {
      if (record.targetId === null) {
        throw new ClaimInvariantError(`One Move ${record.id} is ${record.status} but names no target.`);
      }
      if (record.targetType === 'task') neededTasks.add(record.targetId);
      else neededItems.add(record.targetId);
    }

    return {
      localId: record.id,
      logicalDay: record.forDate,
      targetType: record.targetType as 'task' | 'needsMe',
      targetLocalId: carries ? record.targetId : null,
      status: record.status,
      decidedAt: record.decidedAt,
      completedAt: record.completedAt,
    };
  });

  const tasks: ClaimTask[] = [];
  for (const localId of neededTasks) {
    const task = taskById.get(localId);
    if (!task) throw new ClaimInvariantError(`One Move target task ${localId} is not in local state.`);
    neededCategories.add(task.categoryId);
    if (task.subjectMemberId !== null) neededChildren.add(task.subjectMemberId);
    tasks.push({
      localId: task.id,
      title: task.title,
      categoryLocalId: task.categoryId,
      subjectMemberLocalId: task.subjectMemberId,
      durationMinutes: task.durationMinutes,
      commitment: task.commitment,
      dueDate: task.dueDate,
      planKind: task.plan.kind,
      plannedDate: task.plan.kind === 'day' ? task.plan.date : null,
      plannedStartsAt: task.plan.kind === 'timed' ? task.plan.startsAt : null,
      notes: task.notes,
      status: task.status,
      completedAt: task.completedAt,
      originCreatedAt: task.createdAt,
      originUpdatedAt: task.updatedAt,
      scope: task.scope,
    });
  }

  const needsMeItems: ClaimNeedsMeItem[] = [];
  for (const localId of neededItems) {
    const item = needsMeById.get(localId);
    if (!item) throw new ClaimInvariantError(`One Move target Needs Me item ${localId} is not in local state.`);
    // Optional here, unlike on a task: no category is invented to fill the closure.
    if (item.categoryId !== null) neededCategories.add(item.categoryId);
    needsMeItems.push({
      localId: item.id,
      title: item.title,
      status: item.status,
      dueDate: item.dueDate,
      categoryLocalId: item.categoryId,
      originCreatedAt: item.createdAt,
      scope: item.scope,
    });
  }

  const categories: ClaimCategory[] = [];
  for (const localId of neededCategories) {
    const category = categoryById.get(localId);
    if (!category) throw new ClaimInvariantError(`Required category ${localId} is not in local state.`);
    categories.push({
      localId: category.id,
      name: category.name,
      systemRole: category.systemRole,
      status: category.status,
      sortOrder: category.sortOrder,
      scope: category.scope,
    });
  }

  const childMembers: ClaimChildMember[] = [];
  for (const localId of neededChildren) {
    const child = childById.get(localId);
    if (!child) throw new ClaimInvariantError(`Required child member ${localId} is not in local state.`);
    childMembers.push({ localId: child.id, displayName: child.displayName, birthDate: child.birthDate });
  }

  return {
    claimPayloadVersion: CLAIM_PAYLOAD_VERSION,
    origin: state.origin,
    childMembers,
    categories,
    tasks,
    needsMeItems,
    oneMoves,
  };
}

/**
 * The server's answer, narrowed from untrusted JSON.
 *
 * `rejected` carrying a household id is deliberate and load-bearing:
 * `superseded_by_cloud` names the household the account already owns. Reading
 * the id alone and calling it success is the exact fault the backend wave had
 * to fix, so the status is checked first here too.
 */
export type ClaimOutcome =
  | { kind: 'complete'; householdId: string; claimId: string | null; idMap: Record<string, string>; conflicts: unknown[] }
  | { kind: 'rejected'; reason: RejectedReason; householdId: string | null }
  | { kind: 'unreadable'; detail: string };

export function parseClaimOutcome(raw: unknown): ClaimOutcome {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'unreadable', detail: 'claim result was not an object' };
  }
  const row = raw as Record<string, unknown>;
  const status = row.status;

  if (status === 'rejected') {
    const reason = row.rejected_reason;
    if (reason !== 'superseded_by_cloud' && reason !== 'refused_demo') {
      return { kind: 'unreadable', detail: `unknown rejected_reason ${String(reason)}` };
    }
    return {
      kind: 'rejected',
      reason,
      householdId: typeof row.household_id === 'string' ? row.household_id : null,
    };
  }

  if (status !== 'complete') return { kind: 'unreadable', detail: `unknown status ${String(status)}` };
  if (typeof row.household_id !== 'string') {
    return { kind: 'unreadable', detail: 'complete claim carried no household_id' };
  }

  const idMap: Record<string, string> = {};
  const rawMap = row.id_map;
  if (rawMap !== null && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [localId, cloudId] of Object.entries(rawMap as Record<string, unknown>)) {
      if (typeof cloudId === 'string') idMap[localId] = cloudId;
    }
  }

  return {
    kind: 'complete',
    householdId: row.household_id,
    claimId: typeof row.claim_id === 'string' ? row.claim_id : null,
    idMap,
    conflicts: Array.isArray(row.conflict_evidence) ? row.conflict_evidence : [],
  };
}
