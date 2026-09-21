import type { ConfidenceLevel } from '../../../domain/foundation/provenance';
import type { TypedRef } from '../../../domain/foundation/typedRef';
import type { DraftSchedule } from '../commands/draft';

/**
 * FUTURE SYSTEM-DESIGN CONTRACT — TYPES ONLY.
 *
 * Nothing implements this, on purpose. There is no model SDK, no provider, no prompt, no network
 * code and no function returning an empty list: an implementation that only pretends would be
 * architecture theater, and it would give a future builder something to mistake for the real
 * thing. This file exists so that when intelligence arrives, it arrives through a seam that
 * already says what it may and may not do.
 *
 * THE SHAPE OF THE FUTURE (nothing skips a step)
 *
 *   OBSERVATIONS / A REQUEST
 *     → a TYPED System proposal        (this file)
 *     → REVIEW                          (she reads it, changes it, or dismisses it)
 *     → EXPLICIT ACCEPTANCE             (an act of hers, never a timeout or a default)
 *     → a canonical System mutation     (the same producer the editor uses: `applySystemDraft`)
 *
 * WHAT A PROPOSAL MAY EXPRESS is exactly what a System can actually hold at the common fork — a
 * name, a purpose, an area, ordered steps with minutes that are either known or null, a calendar
 * schedule the foundation can derive dates for, and an existing person or child to hand it to. It
 * has no field for anything the foundation cannot store: no child subject (MP-02), no step-level
 * responsibility or dependency (MP-09), no consequence (MP-07), no run, no notification, no
 * arbitrary JSON, and no place to put a payload that a later stage might interpret.
 *
 * WHAT A PROPOSAL MAY NEVER DO
 *   - write canonical state. It is a proposal; only her acceptance writes, through the producer.
 *   - invent a person. `holder` names a record that already exists, or is null.
 *   - present a guess as fact. `confidence` is required, and an accepted proposal's provenance is
 *     `ai-inference` carrying that confidence — never `user-action` — until she states it herself.
 *   - claim it was carried out. A proposal describes a routine; it is not an action, and executing
 *     anything is a separate authority (the foundation's intent → decision → execution chain).
 *
 * NOT BUILT, NOTED FOR THE INTEGRATION WAVE: accepting a proposal needs the producer to accept a
 * provenance argument (today `applySystemDraft` stamps `user-action`, which would be wrong for an
 * inferred System). That is a deliberate omission here, not an oversight.
 */

/** Where a proposal starts. A reference to evidence, never the evidence's content. */
export type SystemDesignTrigger =
  /** She asked, in Talk It Out or anywhere else. `sourceArtifactId` names what she said, when it is stored. */
  | { kind: 'user_request'; sourceArtifactId: string | null }
  /** Repeated behavior a pattern already established (Pattern Intelligence). Proposing is not deciding. */
  | { kind: 'observed_pattern'; patternId: string };

export interface SystemDesignInput {
  trigger: SystemDesignTrigger;
  /** An existing System to improve, or null to design a new one. */
  improving: { systemId: string } | null;
  /** The typed rows a proposal is allowed to cite as its reasons. Nothing else may be cited. */
  evidence: TypedRef[];
}

export interface ProposedStep {
  title: string;
  /** null = not known. A proposal never fills in a plausible duration. */
  effortMinutes: number | null;
  /** The rows that make this step worth proposing. */
  evidence: TypedRef[];
}

export interface SystemProposal {
  proposalId: string;
  kind: 'new_system' | 'change_existing';
  /** The System a `change_existing` proposal is about. */
  systemId: string | null;
  name: string;
  purpose: string;
  /** null = she must choose an area; a proposal does not guess one. */
  categoryId: string | null;
  /** In the order they should happen. Order is not dependency. */
  steps: ProposedStep[];
  /** Only a calendar shape the foundation can derive dates for. null = no schedule. */
  schedule: DraftSchedule | null;
  /** An EXISTING person or child, or null. Never a free-text name. */
  holder: { kind: 'person' | 'child'; id: string } | null;
  evidence: TypedRef[];
  /** Required: an inference is a claim that may be wrong, and says how sure it is. */
  confidence: ConfidenceLevel;
}

/** What Her Keys needs to ask before it can propose anything sensible — a code, not a sentence. */
export type SystemClarificationCode = 'which_routine' | 'how_often' | 'who_does_it' | 'which_steps';

export type SystemProposalResult =
  | { kind: 'proposal'; proposal: SystemProposal }
  | { kind: 'needs_clarification'; question: SystemClarificationCode }
  | { kind: 'nothing_to_propose'; reason: 'insufficient_evidence' | 'already_covered' };
