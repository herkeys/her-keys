/**
 * Scenario support for Feature 04 (Systems).
 *
 * Fixtures are built HERE, from schema-valid canonical rows, and never by the Feature 04 code under
 * test — so a scenario cannot pass merely because the producer and the assertion share a mistake.
 * Foundation transitions (`addPerson`, `delegate`, `addRecurrence`, …) are used where a scenario is
 * about how the foundation's own rows behave.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptySystemFacets } from '../../../src/domain/foundation/commitment.ts';
import { validateAppState } from '../../../src/domain/state.ts';
import { evidenceText } from '../../../src/features/systems/model/canonical.ts';
import { createEmptyState } from '../../../src/state/initialState.ts';
import { DAY, MORNING, TZ, demoState } from '../../support/fixtures.mjs';

export { DAY, MORNING, TZ };

/** A fixed clock instant, in the household zone. */
export const T0 = new Date(MORNING).toISOString();
export const USER = { producer: 'user-action', artifactId: null, confidence: null };
export const AUTOMATION = { producer: 'automation', artifactId: null, confidence: null };

/** A transition context with ids that are the same on every run. */
export function ctxAt(nowMs = MORNING, today = DAY) {
  let counter = 0;
  return { nowMs, today, createId: (prefix) => `${prefix}-${++counter}` };
}

export const CHILDREN = [
  { id: 'child-1', displayName: 'Josie', birthDate: '2018-03-04', scope: 'child' },
  { id: 'child-2', displayName: 'Theo', birthDate: '2021-06-12', scope: 'child' },
];

/** A REAL (non-demo) household with nothing in it but its starter areas. */
export function realHousehold({ children = [], timeZone = TZ } = {}) {
  return { ...createEmptyState(timeZone), children };
}

export const demoHousehold = () => demoState();

export function systemRow(over = {}) {
  return {
    id: 'sys-1',
    name: 'A System',
    description: '',
    categoryId: 'cat-home',
    ...emptySystemFacets(),
    provenance: USER,
    scope: 'household',
    ...over,
  };
}

export function stepRow(over = {}) {
  return {
    id: 'step-x',
    systemId: 'sys-1',
    position: 0,
    title: 'A step',
    effortMinutes: null,
    createdAt: T0,
    updatedAt: T0,
    provenance: USER,
    scope: 'personal',
    ...over,
  };
}

export function ruleRow(over = {}) {
  return {
    id: 'rule-x',
    about: { kind: 'system', id: 'sys-1' },
    trigger: 'schedule',
    frequency: 'weekly',
    interval: 1,
    byWeekday: null,
    byMonthDay: null,
    anchorDate: DAY,
    timeOfDayMinutes: null,
    timezone: TZ,
    endsOn: null,
    occurrenceCount: null,
    status: 'active',
    createdAt: T0,
    updatedAt: T0,
    provenance: USER,
    scope: 'personal',
    ...over,
  };
}

/** Adds canonical rows and proves the result is state the application would accept. */
export function withRows(state, { systems = [], systemSteps = [], recurrences = [], observations = [] } = {}) {
  const next = {
    ...state,
    systems: [...state.systems, ...systems],
    systemSteps: [...state.systemSteps, ...systemSteps],
    recurrences: [...state.recurrences, ...recurrences],
    observations: [...state.observations, ...observations],
  };
  assertValid(next, 'fixture');
  return next;
}

export function assertValid(state, label = 'state') {
  const verdict = validateAppState(state);
  assert.equal(verdict.ok, true, `${label} is invalid: ${verdict.ok ? '' : verdict.issues.slice(0, 4).join('; ')}`);
  return state;
}

/** A store-snapshot slice for the hub, defaulting to a normal ready session. */
export function snapshot(state, over = {}) {
  return { status: 'ready', state, today: DAY, recovery: null, persistence: 'enabled', nowMs: MORNING, ...over };
}

// ------------------------------------------------------------------ evidence ---

const EVIDENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'systems', 'scenarios');
const normalise = (text) => text.replace(/\r\n/g, '\n');

/**
 * Compare a scenario's structural evidence with its committed artifact.
 *
 * A mismatch is a TEST FAILURE: either the code regressed (repair it) or the semantics changed on
 * purpose (regenerate with `UPDATE_SYSTEMS_EVIDENCE=1`, review the diff, and explain it in the commit).
 * There is no silent auto-update.
 */
export function assertEvidence(name, value) {
  const actual = evidenceText(value);
  const file = join(EVIDENCE_DIR, `${name}.evidence.json`);
  if (process.env.UPDATE_SYSTEMS_EVIDENCE === '1') {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  assert.ok(existsSync(file), `no committed evidence for ${name}: run with UPDATE_SYSTEMS_EVIDENCE=1, review the file, and commit it`);
  assert.equal(actual, normalise(readFileSync(file, 'utf8')), `structural evidence for ${name} no longer matches the committed artifact`);
}

export const evidenceFiles = () =>
  existsSync(EVIDENCE_DIR) ? readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith('.evidence.json')).map((f) => f.replace('.evidence.json', '')).sort() : [];
