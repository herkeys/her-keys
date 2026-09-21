import type { LocalDate } from '../../../domain/logicalDay';
import { childName } from '../present';
import { clockLabel, dayLabelFor } from '../time';
import type { TransitionView } from '../types';

/**
 * LABELS THAT NAME A HANDOFF WITHOUT ANY WORDS OF OUR OWN.
 *
 * A label is "title · day". Two handoffs can share a title and a day (one per child, or two on the same afternoon), and a preparation
 * item must never be linked to the wrong one because two chips read the same — so a label that is not unique is made unique, first by
 * the child, then by the clock time, then by its order. The extra parts are facts she recorded, never a guess.
 */

type Labelled = Pick<TransitionView, 'id' | 'title' | 'localDate' | 'minutesOfDay' | 'child'>;

export const handoffLabelFor = (transition: Pick<TransitionView, 'title' | 'localDate'>, today: LocalDate): string =>
  `${transition.title} · ${dayLabelFor(transition.localDate, today)}`;

const counts = (labels: readonly string[]): Map<string, number> => {
  const tally = new Map<string, number>();
  for (const label of labels) tally.set(label, (tally.get(label) ?? 0) + 1);
  return tally;
};

export function handoffChoices(transitions: readonly Labelled[], today: LocalDate): Array<{ id: string; label: string }> {
  let rows = transitions.map((transition) => ({ transition, label: handoffLabelFor(transition, today) }));

  const widen = (extra: (transition: Labelled) => string) => {
    const tally = counts(rows.map((row) => row.label));
    rows = rows.map((row) => ((tally.get(row.label) ?? 0) > 1 ? { ...row, label: `${row.label} · ${extra(row.transition)}` } : row));
  };
  widen((transition) => childName(transition.child));
  widen((transition) => clockLabel(transition.minutesOfDay));

  const tally = counts(rows.map((row) => row.label));
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if ((tally.get(row.label) ?? 0) <= 1) return { id: row.transition.id, label: row.label };
    const order = (seen.get(row.label) ?? 0) + 1;
    seen.set(row.label, order);
    return { id: row.transition.id, label: `${row.label} #${order}` };
  });
}
