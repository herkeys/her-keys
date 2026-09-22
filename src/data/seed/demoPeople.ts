import type { PersonContext } from '../../domain/foundation/personContext';
import { demoProvenance } from '../../domain/foundation/provenance';
import type { HouseholdPerson } from '../../domain/foundation/responsibility';

/**
 * People OS demo cast (HK-FEATURE-13). Entirely fictional, loaded only in demo mode, and — like every demo row — `demo-seed`, so it
 * can never sync, be claimed or reach an account (B4-P0-010; the F13 tables also refuse any producer but `user-action`).
 *
 * Four people, at most five by rule. Two of them are both called "Jordan Lee" on purpose: they are two identities with two ids, and
 * the demo shows them as two rows told apart only by her own labels. No phone number, email address, street address or credential
 * appears anywhere — the canonical person has no column for one.
 */
const AT = '2026-01-05T15:00:00.000Z';

export const DEMO_PEOPLE: HouseholdPerson[] = [
  { id: 'person-demo-1', displayName: 'Jordan Lee', relationship: 'other', channel: 'unspecified', status: 'active', createdAt: AT, updatedAt: AT, provenance: demoProvenance(), scope: 'personal' },
  { id: 'person-demo-2', displayName: 'Jordan Lee', relationship: 'other', channel: 'unspecified', status: 'active', createdAt: AT, updatedAt: AT, provenance: demoProvenance(), scope: 'personal' },
  { id: 'person-demo-3', displayName: 'Sample Teacher', relationship: 'other', channel: 'unspecified', status: 'active', createdAt: AT, updatedAt: AT, provenance: demoProvenance(), scope: 'personal' },
  { id: 'person-demo-4', displayName: 'Demo Neighbor', relationship: 'neighbor', channel: 'unspecified', status: 'active', createdAt: AT, updatedAt: AT, provenance: demoProvenance(), scope: 'personal' },
];

const context = (id: string, personId: string, relationshipName: string | null, organizationName: string | null): PersonContext => ({
  id,
  childId: null,
  personId,
  relationshipName,
  organizationName,
  contextNote: null,
  status: 'active',
  createdAt: AT,
  updatedAt: AT,
  provenance: demoProvenance(),
  scope: 'personal',
});

export const DEMO_PERSON_CONTEXTS: PersonContext[] = [
  context('pctx-demo-1', 'person-demo-1', 'Friend', null),
  context('pctx-demo-2', 'person-demo-2', 'Soccer coach', 'Sample Soccer Club'),
  context('pctx-demo-3', 'person-demo-3', 'Teacher', 'Sample Elementary'),
];
