/**
 * Historical shapes, derived from the live shape by REMOVING what a later
 * version added — never by adding to an old one.
 *
 * A test that needs "what v3 looked like" used to reuse the live state factory,
 * which was harmless while the live shape WAS v3. Once v4 adds fields, such a
 * fixture silently stops being historical and fails the frozen validators for
 * the wrong reason. These converters restore the rule the frozen schemas exist
 * for: a legacy fixture is what that version actually stored.
 *
 * They are fixture plumbing, not migration logic. The migration itself is
 * exercised against them (and against the byte-exact v3 envelopes under
 * `tests/fixtures/v3`), so a bug in `migrateV3ToV4` cannot hide here.
 */

const TASK_FACETS = [
  'dueAt', 'earliestStartAt', 'latestFinishAt', 'splittable', 'minChunkMinutes', 'preferredTimeOfDay',
  'energyDemand', 'consequence', 'needsMePersonally', 'travelMinutesBefore', 'travelMinutesAfter',
  'preparationMinutes', 'value',
];

/**
 * Exactly the keys v4 ADDED to each row kind. Kind-aware on purpose: an event already had
 * `travelMinutesBefore`, a task did not, so stripping by name alone would eat real v3 data.
 */
export const V4_ROW_ADDITIONS = {
  categories: ['provenance'],
  events: ['provenance', 'energyDemand', 'consequence', 'needsMePersonally', 'value'],
  tasks: ['provenance', 'durationSource', ...TASK_FACETS],
  systems: ['provenance', 'subjectMemberId', 'automationMode', 'effortMinutes', 'energyDemand'],
  meals: ['provenance', 'prepMinutes', 'energyDemand'],
  needsMe: ['provenance'],
  oneMoves: ['provenance'],
  discovery: ['provenance'],
  onboarding: ['provenance'],
};

/** What a facet reads as when it was never known: null everywhere except a system's automation mode. */
export const UNKNOWN_FACET = (key) => (key === 'automationMode' ? 'manual' : null);

/** Roots v4 introduced. */
export const V4_ROOTS = [
  'migrationLineage', 'sourceArtifacts', 'externalReferences', 'interpretations', 'observations', 'authorities',
  'intents', 'decisions', 'executions', 'outcomes', 'people', 'responsibilities', 'dependencies', 'recurrences',
  'goals', 'systemSteps', 'capacity', 'patterns', 'evidenceLinks',
];

const without = (row, keys) => {
  const rest = { ...row };
  for (const key of keys) delete rest[key];
  return rest;
};

/** Removes only what v4 ADDED to one row of a given collection. */
export function withoutV4Additions(section, collection) {
  const keys = V4_ROW_ADDITIONS[collection];
  // Sections v4 did not touch (household, user, children, actions, origin, ...) have nothing to remove.
  if (keys === undefined) return section;
  if (Array.isArray(section)) return section.map((row) => without(row, keys));
  if (section !== null && typeof section === 'object') return without(section, keys);
  return section;
}

/** v4 -> v3: drop what v4 added, restore the event `source` flag, drop the v4 roots. */
export function toV3Shape(state) {
  const rest = without(state, V4_ROOTS);
  const strip = (collection) => state[collection].map((row) => without(row, V4_ROW_ADDITIONS[collection]));
  return {
    ...rest,
    categories: strip('categories'),
    events: state.events.map((event) => ({
      ...without(event, V4_ROW_ADDITIONS.events),
      source: event.provenance.producer === 'demo-seed' ? 'demo' : 'user',
    })),
    tasks: strip('tasks'),
    systems: strip('systems'),
    meals: strip('meals'),
    needsMe: strip('needsMe'),
    oneMoves: strip('oneMoves'),
    discovery: state.discovery === null ? null : without(state.discovery, V4_ROW_ADDITIONS.discovery),
    onboarding: without(state.onboarding, V4_ROW_ADDITIONS.onboarding),
  };
}
