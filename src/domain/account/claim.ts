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
import type { DurationSource } from '../foundation/duration';
import type { Provenance } from '../foundation/provenance';
import type { SourceArtifact } from '../foundation/sourceArtifact';
import type { AccountId } from './identity';
import type { ClaimKind, IdentityRecord, RejectedReason } from './binding';
import { starterCategories } from '../categories';

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
  const starters = starterCategories(state.household.id);
  const categoriesChanged =
    state.categories.length !== starters.length ||
    state.categories.some((category, index) => JSON.stringify(category) !== JSON.stringify(starters[index]));

  return {
    origin: state.origin,
    hasContent:
      state.household.displayName !== null ||
      state.user.displayName !== null ||
      categoriesChanged ||
      state.events.length > 0 ||
      state.tasks.length > 0 ||
      state.systems.length > 0 ||
      state.meals.length > 0 ||
      state.needsMe.length > 0 ||
      state.oneMoves.length > 0 ||
      state.actions.length > 0 ||
      state.children.length > 0 ||
      state.discovery !== null ||
      state.migrationEvidence.length > 0 ||
      state.sourceArtifacts.length > 0 ||
      state.externalReferences.length > 0 ||
      state.interpretations.length > 0 ||
      state.observations.length > 0 ||
      state.authorities.length > 0 ||
      state.intents.length > 0 ||
      state.decisions.length > 0 ||
      state.executions.length > 0 ||
      state.outcomes.length > 0 ||
      state.people.length > 0 ||
      state.responsibilities.length > 0 ||
      state.dependencies.length > 0 ||
      state.recurrences.length > 0 ||
      state.goals.length > 0 ||
      state.systemSteps.length > 0 ||
      state.capacity !== null ||
      state.patterns.length > 0 ||
      state.evidenceLinks.length > 0 ||
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
 * THE CLAIM PAYLOAD — `claimPayloadVersion: 2`.
 *
 * The first shipping claim payload contract (B4-BE02-OR-001), revised by
 * B4-FOUNDATION-BUILDOUT-01. It carries the historical One Move records and the
 * MINIMUM TRANSITIVE DEPENDENCY SET that makes them valid in the cloud, and nothing
 * else:
 *
 *   One Move (selected|completed)
 *     -> task     -> category (the cloud column is NOT NULL)
 *                 -> child member, when the task names a child subject
 *                 -> source artifact, when its provenance names one
 *     -> needsMe  -> category, only when the item actually has one
 *                 -> source artifact, when its provenance names one
 *
 * Unrelated tasks, Needs Me items, categories, children and artifacts are not
 * sent, and the server rejects a payload that carries them rather than ignoring
 * the extras. Everything else she owns — events, systems, meals, Discovery — is
 * B4-BACKEND-03's job. Claim is not sync.
 *
 * VERSION 3 (HK-INTEGRATION-READINESS-01) changes two things and nothing else:
 *
 *   a. EVERY child the household holds is claimed, not only those the closure names. A child's cloud identity can be
 *      created by claim and by nothing else (membership has no client write grant), so a child left out here could never
 *      be referenced by anything ordinary sync sends later. Everything except children remains closure-only.
 *   b. a claimed task states where its duration came from (`durationSource`), so a default is never carried as a fact.
 *
 * VERSION 2 differs from 1 in exactly three ways, and version 1 is REFUSED by the
 * server (it names none of them, so it cannot be completed without inventing where
 * each row came from):
 *
 *   1. every carried row states its PROVENANCE — producer, source artifact, confidence;
 *   2. a task carries its commitment FACETS and exact value, so claiming a task
 *      never silently drops what she recorded about it;
 *   3. the SOURCE ARTIFACTS the carried rows were derived from travel with them, as
 *      part of the closure rather than as a general upload.
 */
export const CLAIM_PAYLOAD_VERSION = 3;

/** A row's provenance, as the claim states it. The artifact is named by local id, like every other reference. */
export interface ClaimProvenance {
  producer: Provenance['producer'];
  sourceArtifactLocalId: string | null;
  confidence: Provenance['confidence'];
}

const claimProvenance = (provenance: Provenance): ClaimProvenance => ({
  producer: provenance.producer,
  sourceArtifactLocalId: provenance.artifactId,
  confidence: provenance.confidence,
});

/** A source artifact in the closure. An artifact from an external system is sent truthfully and REFUSED by the server. */
export interface ClaimSourceArtifact {
  localId: string;
  kind: SourceArtifact['kind'];
  origin: SourceArtifact['origin'];
  provider: string | null;
  receivedAt: string;
  contentDigest: string | null;
  contentRef: string | null;
  externalReferenceLocalId: string | null;
  retractedAt: string | null;
  originCreatedAt: string;
}

export interface ClaimOneMove extends ClaimProvenance {
  localId: string;
  logicalDay: string;
  targetType: 'task' | 'needsMe';
  targetLocalId: string | null;
  status: OneMoveRecord['status'];
  decidedAt: string;
  completedAt: string | null;
}

export interface ClaimTaskFacets {
  dueAt: string | null;
  earliestStartAt: string | null;
  latestFinishAt: string | null;
  splittable: boolean | null;
  minChunkMinutes: number | null;
  preferredTimeOfDay: Task['preferredTimeOfDay'];
  energyDemand: Task['energyDemand'];
  consequence: Task['consequence'];
  needsMePersonally: boolean | null;
  travelMinutesBefore: number | null;
  travelMinutesAfter: number | null;
  preparationMinutes: number | null;
  /** Exact: minor units and currency, never a float. */
  value: Task['value'];
}

export interface ClaimTask extends ClaimProvenance, ClaimTaskFacets {
  localId: string;
  title: string;
  categoryLocalId: string;
  subjectMemberLocalId: string | null;
  durationMinutes: number;
  /** How far `durationMinutes` may be trusted. null = never recorded; it is carried as null, never as 'user'. */
  durationSource: DurationSource | null;
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

export interface ClaimNeedsMeItem extends ClaimProvenance {
  localId: string;
  title: string;
  status: NeedsMeItem['status'];
  dueDate: string | null;
  categoryLocalId: string | null;
  originCreatedAt: string;
  scope: 'personal';
}

export interface ClaimCategory extends ClaimProvenance {
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
  sourceArtifacts: ClaimSourceArtifact[];
}

/**
 * A name as the cloud will accept it: NFC, no control characters, single spaces, trimmed. The database refuses anything else
 * (`household_members_display_name_check`), and a refused child would fail the whole claim. Blank stays blank so the server
 * refuses it visibly rather than the client inventing a name.
 */
export function cloudDisplayName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[ --]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? name : cleaned;
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
  const artifactById = new Map(state.sourceArtifacts.map((artifact) => [artifact.id, artifact]));

  const neededArtifacts = new Set<string>();
  const needArtifact = (provenance: Provenance) => {
    if (provenance.artifactId !== null) neededArtifacts.add(provenance.artifactId);
  };

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
      ...claimProvenance(record.provenance),
    };
  });
  for (const record of state.oneMoves) needArtifact(record.provenance);

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
      durationSource: task.durationSource ?? null,
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
      ...claimProvenance(task.provenance),
      dueAt: task.dueAt,
      earliestStartAt: task.earliestStartAt,
      latestFinishAt: task.latestFinishAt,
      splittable: task.splittable,
      minChunkMinutes: task.minChunkMinutes,
      preferredTimeOfDay: task.preferredTimeOfDay,
      energyDemand: task.energyDemand,
      consequence: task.consequence,
      needsMePersonally: task.needsMePersonally,
      travelMinutesBefore: task.travelMinutesBefore,
      travelMinutesAfter: task.travelMinutesAfter,
      preparationMinutes: task.preparationMinutes,
      value: task.value,
    });
    needArtifact(task.provenance);
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
      ...claimProvenance(item.provenance),
    });
    needArtifact(item.provenance);
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
      ...claimProvenance(category.provenance),
    });
    needArtifact(category.provenance);
  }

  // Every child, closure or not (version 3): the mapping only claim can create. A child a carried task names must exist.
  for (const localId of neededChildren) {
    if (!childById.has(localId)) throw new ClaimInvariantError(`Required child member ${localId} is not in local state.`);
  }
  const childMembers: ClaimChildMember[] = state.children.map((child) => ({
    localId: child.id,
    displayName: cloudDisplayName(child.displayName),
    birthDate: child.birthDate,
  }));

  const sourceArtifacts: ClaimSourceArtifact[] = [];
  for (const localId of neededArtifacts) {
    const artifact = artifactById.get(localId);
    if (!artifact) throw new ClaimInvariantError(`Required source artifact ${localId} is not in local state.`);
    sourceArtifacts.push({
      localId: artifact.id,
      kind: artifact.kind,
      origin: artifact.origin,
      provider: artifact.provider,
      receivedAt: artifact.receivedAt,
      contentDigest: artifact.contentDigest,
      contentRef: artifact.contentRef,
      // Derived, truthfully: an artifact is external-linked when an external reference names it as its source.
      externalReferenceLocalId: state.externalReferences.find((ref) => ref.provenance.artifactId === artifact.id)?.id ?? null,
      retractedAt: artifact.retractedAt,
      originCreatedAt: artifact.createdAt,
    });
  }

  return {
    claimPayloadVersion: CLAIM_PAYLOAD_VERSION,
    origin: state.origin,
    childMembers,
    categories,
    tasks,
    needsMeItems,
    oneMoves,
    sourceArtifacts,
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
