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

const strip = (row) => {
  const { provenance: _provenance, ...rest } = row;
  return rest;
};

/** v4 -> v3: drop stored provenance, restore the event `source` flag, drop the v4 roots. */
export function toV3Shape(state) {
  const {
    migrationLineage: _lineage,
    sourceArtifacts: _artifacts,
    externalReferences: _references,
    ...rest
  } = state;
  return {
    ...rest,
    categories: state.categories.map(strip),
    events: state.events.map((event) => {
      const { provenance, ...others } = event;
      return { ...others, source: provenance.producer === 'demo-seed' ? 'demo' : 'user' };
    }),
    tasks: state.tasks.map(strip),
    systems: state.systems.map(strip),
    meals: state.meals.map(strip),
    needsMe: state.needsMe.map(strip),
    oneMoves: state.oneMoves.map(strip),
    discovery: state.discovery === null ? null : strip(state.discovery),
    onboarding: strip(state.onboarding),
  };
}

/** Removes only what v4 ADDED to a section, so a v1/v2 section can be compared to the v1 bytes it came from. */
export function withoutV4Additions(section) {
  if (Array.isArray(section)) return section.map(withoutV4Additions);
  if (section !== null && typeof section === 'object') return strip(section);
  return section;
}

