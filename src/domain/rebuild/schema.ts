import { z } from 'zod';
import { ProvenanceSchema } from '../foundation/provenance';
import { refOf } from '../foundation/typedRef';
import { Id, InstantSchema } from '../schemaPrimitives';

/**
 * REBUILDFOCUS — HK-FEATURE-11 (Me / Rebuild OS).
 *
 * A RebuildFocus is an area of her own life she has CHOSEN to keep visible while she rebuilds: "Make space for myself again",
 * "Reconnect with creativity". It is deliberately not a Goal (nothing is measured), not a Task (nothing is to be done by it), not a
 * System (nothing repeats), and never a verdict about her. It has no progress, score, streak, priority or completion: some areas stay
 * meaningful indefinitely.
 *
 * Its identity is its id. The title is display only — duplicates are allowed, and a rename changes nothing else.
 *
 * Owner-private by construction: `scope` is pinned to 'personal', the foundation's owner-only scope, exactly like a Goal.
 */

export const REBUILD_FOCUS_STATES = ['active', 'paused', 'archived'] as const;
export type RebuildFocusState = (typeof REBUILD_FOCUS_STATES)[number];

export const REBUILD_FOCUS_TITLE_MAX = 200;
/** Brief context only. This is intentionally not a journal. */
export const REBUILD_FOCUS_NOTE_MAX = 500;

/** Stored exactly as she meant it: no leading or trailing blanks, never empty. */
const Trimmed = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0, { message: 'Must not be blank' })
    .refine((value) => value === value.trim(), { message: 'Must be trimmed' });

export const RebuildFocusSchema = z.strictObject({
  id: Id,
  title: Trimmed(REBUILD_FOCUS_TITLE_MAX),
  note: Trimmed(REBUILD_FOCUS_NOTE_MAX).nullable(),
  /** active: keep it visible. paused: she is not asking Her Keys to surface it now. archived: off the Rebuild surface. None is a judgment. */
  state: z.enum(REBUILD_FOCUS_STATES),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type RebuildFocus = z.infer<typeof RebuildFocusSchema>;

/**
 * What a Focus may be connected to: canonical operational truth, by typed reference (ADR-005). The link never copies the target and
 * never changes it; the target keeps its own lifecycle and its own visibility.
 */
export const FOCUS_TARGET_KINDS = ['task', 'goal', 'system', 'event'] as const;
export type FocusTargetKind = (typeof FOCUS_TARGET_KINDS)[number];
export const FocusTargetSchema = refOf(FOCUS_TARGET_KINDS);
export type FocusTarget = z.infer<typeof FocusTargetSchema>;

/**
 * next_action: a canonical Task she chose as a concrete next step for this Focus.
 * supports:    anything else she connected — a Goal, a routine (System), a scheduled commitment (Event), or a Task.
 */
export const FOCUS_RELATIONS = ['next_action', 'supports'] as const;
export type FocusRelation = (typeof FOCUS_RELATIONS)[number];

export const REBUILD_FOCUS_LINK_STATUSES = ['active', 'removed'] as const;

/**
 * The one F11-owned association. It inherits the privacy of its Focus: owner-only, `scope` 'personal'. Unlinking is a status change;
 * nothing is ever deleted.
 */
export const RebuildFocusLinkSchema = z
  .strictObject({
    id: Id,
    focusId: Id,
    target: FocusTargetSchema,
    relation: z.enum(FOCUS_RELATIONS),
    status: z.enum(REBUILD_FOCUS_LINK_STATUSES),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((link, ctx) => {
    if (link.relation === 'next_action' && link.target.kind !== 'task') {
      ctx.addIssue({ code: 'custom', path: ['relation'], message: 'a next action is a canonical Task' });
    }
  });
export type RebuildFocusLink = z.infer<typeof RebuildFocusLinkSchema>;
