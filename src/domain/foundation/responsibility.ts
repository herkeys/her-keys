import { z } from 'zod';
import { Id, InstantSchema, NonBlank } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';
import { ContentRefSchema } from './typedRef';

/**
 * PEOPLE AND RESPONSIBILITY — B4-FE01-013 / -014 (ADR-019).
 *
 * The standard for delegation is not "a task has an assignee". It is whether Her
 * Keys knows the load actually left her head. That needs somebody to hand it to, a
 * lifecycle for the handoff, and a truthful answer to "does this still need me?".
 *
 * A PERSON is somebody in her life who is not an account: a co-parent, a nanny, a
 * grandparent, a contractor. They are deliberately NOT household members.
 * `household_members` is the table every row-level-security rule keys off, and an
 * adult there is an account holder by constraint; admitting a person without an
 * account would change who can read what for every table in the product. So a
 * person is their own record, owner-private, and holds no contact details — only a
 * name, a relationship and a preferred channel.
 *
 * A RESPONSIBILITY is the current answer to "who is doing this?" for one thing, and
 * where the handoff has got to. What happened along the way is not edited in
 * place; each step is also appended as a behavior observation, which is what lets
 * "did delegating actually help?" be answered later.
 *
 * Nothing here delivers a message. It is the state model a delivery integration
 * would drive.
 */

export const PERSON_RELATIONSHIPS = ['co-parent', 'partner', 'grandparent', 'caregiver', 'neighbor', 'contractor', 'friend', 'other'] as const;
export const PERSON_CHANNELS = ['unspecified', 'sms', 'email', 'whatsapp', 'in-app'] as const;

export const HouseholdPersonSchema = z.strictObject({
  id: Id,
  displayName: NonBlank(80),
  relationship: z.enum(PERSON_RELATIONSHIPS),
  /** How they would be reached. A preference, never an address. */
  channel: z.enum(PERSON_CHANNELS),
  status: z.enum(['active', 'archived']),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  provenance: ProvenanceSchema,
  /** Owner-private in Build 4. Widening later is additive. */
  scope: z.literal('personal'),
});
export type HouseholdPerson = z.infer<typeof HouseholdPersonSchema>;

/** Who holds it: her, a person outside the household, or one of her children. */
export const RESPONSIBLE_KINDS = ['self', 'person', 'child'] as const;
export type ResponsibleKind = (typeof RESPONSIBLE_KINDS)[number];

export const RESPONSIBILITY_STATES = ['owned', 'requested', 'acknowledged', 'accepted', 'declined', 'completed', 'returned'] as const;
export type ResponsibilityState = (typeof RESPONSIBILITY_STATES)[number];

export const ResponsibilitySchema = z
  .strictObject({
    id: Id,
    /** The thing being handed over. */
    about: ContentRefSchema,
    responsibleKind: z.enum(RESPONSIBLE_KINDS),
    responsiblePersonId: Id.nullable(),
    responsibleChildId: Id.nullable(),
    state: z.enum(RESPONSIBILITY_STATES),
    requestedAt: InstantSchema.nullable(),
    acknowledgedAt: InstantSchema.nullable(),
    respondedAt: InstantSchema.nullable(),
    completedAt: InstantSchema.nullable(),
    returnedAt: InstantSchema.nullable(),
    /** When an acknowledgement is expected by. Past it, an unanswered request is "unacknowledged". */
    ackDueAt: InstantSchema.nullable(),
    /** Whether it still needs her personally — the honest answer to "did that take it off me?". */
    stillNeedsMe: z.boolean(),
    /** Reassignment: the handoff this one replaced. */
    previousResponsibilityId: Id.nullable(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((r, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    // exactly the holder the kind names
    const holder = { self: [false, false], person: [true, false], child: [false, true] }[r.responsibleKind];
    if ((r.responsiblePersonId !== null) !== holder[0]) issue('responsiblePersonId', `a ${r.responsibleKind} holder ${holder[0] ? 'names a person' : 'names no person'}`);
    if ((r.responsibleChildId !== null) !== holder[1]) issue('responsibleChildId', `a ${r.responsibleKind} holder ${holder[1] ? 'names a child' : 'names no child'}`);

    const needs = (field: 'requestedAt' | 'acknowledgedAt' | 'respondedAt' | 'completedAt' | 'returnedAt') => {
      if (r[field] === null) issue(field, `${r.state} requires ${field}`);
    };
    switch (r.state) {
      case 'owned':
        break;
      case 'requested':
        needs('requestedAt');
        if (r.responsibleKind === 'self') issue('responsibleKind', 'a request is made of somebody else');
        break;
      case 'acknowledged':
        needs('requestedAt');
        needs('acknowledgedAt');
        if (r.responsibleKind === 'self') issue('responsibleKind', 'somebody else acknowledges');
        break;
      case 'accepted':
        needs('requestedAt');
        needs('respondedAt');
        if (r.responsibleKind === 'self') issue('responsibleKind', 'somebody else accepts');
        break;
      case 'declined':
        needs('requestedAt');
        needs('respondedAt');
        break;
      case 'completed':
        needs('completedAt');
        break;
      case 'returned':
        needs('returnedAt');
        if (r.responsibleKind !== 'self') issue('responsibleKind', 'a returned responsibility is hers again');
        break;
    }
    if (r.state !== 'returned' && r.returnedAt !== null) issue('returnedAt', 'only a returned responsibility has a return time');
    if (r.state !== 'completed' && r.completedAt !== null) issue('completedAt', 'only a completed responsibility has a completion time');
  });
export type Responsibility = z.infer<typeof ResponsibilitySchema>;

/** A responsibility that is still live: it has an owner who has not finished, refused or handed it back. */
export const ACTIVE_RESPONSIBILITY_STATES: readonly ResponsibilityState[] = ['owned', 'requested', 'acknowledged', 'accepted'];

export function isActiveResponsibility(r: Pick<Responsibility, 'state'>): boolean {
  return ACTIVE_RESPONSIBILITY_STATES.includes(r.state);
}

/**
 * Requested, never answered, and past the time an answer was due. Derived from the
 * clock rather than stored, so it cannot go stale and cannot be forgotten.
 */
export function isUnacknowledged(r: Pick<Responsibility, 'state' | 'ackDueAt'>, atMs: number): boolean {
  return r.state === 'requested' && r.ackDueAt !== null && Date.parse(r.ackDueAt) <= atMs;
}
