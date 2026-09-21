import type { AppState } from '../../../domain/state';
import { stepsInOrder } from '../../../domain/structure';
import { canonicalJson } from './canonical';
import { rulesForSystem } from './schedule';

/**
 * A content fingerprint of everything the System editor reads or writes for ONE System: the
 * definition row (INCLUDING the child it is about, `subjectMemberId`, and its scope), its steps in
 * order, every recurrence rule about it, and every responsibility about it.
 *
 * The subject is named explicitly and normalised (`?? null`) rather than left to whatever the row
 * happens to spell: an editor opened before the routine's child was set, changed or cleared (by
 * another edit, or by a sync pull from another device) can therefore never save over that change,
 * and a row written before the field existed does not read as changed merely because it now says
 * `null` (HA-011).
 *
 * The editor records this when it opens. At save time the same function runs on the state the
 * commit is about to write; if the two differ, canonical state moved underneath the editor (a
 * background sync, another edit) and the save is refused rather than silently overwriting the
 * newer truth. It is content-based rather than reference-based on purpose: a sync pull rebuilds
 * row objects even when nothing changed, and that must not read as a conflict.
 *
 * No merge is attempted. The application has no per-row revision on a System, so this is the
 * strongest honest signal available.
 */
export function systemFingerprint(state: AppState, systemId: string): string {
  const row = state.systems.find((system) => system.id === systemId);
  return canonicalJson({
    system: row === undefined ? null : { ...row, subjectMemberId: row.subjectMemberId ?? null },
    steps: stepsInOrder(state, systemId),
    rules: rulesForSystem(state, systemId),
    responsibilities: state.responsibilities
      .filter((row) => row.about.kind === 'system' && row.about.id === systemId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  });
}
