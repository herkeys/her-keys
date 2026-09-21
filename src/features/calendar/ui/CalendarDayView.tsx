import { View } from 'react-native';
import { Overline } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { COPY, copyContextFor } from '../copy';
import type { CalendarDayViewModel, ItemRef } from '../model/types';
import { AgendaList } from './AgendaList';
import { CalendarEmptyDay } from './CalendarStates';
import { ConflictList, DaySummary, UnknownNotice } from './DayInsights';
import { NotScheduledSection } from './NotScheduled';

/**
 * One day, in the order she needs it (contract section 17):
 *   1. what is fixed and where the day stands   (summary + the schedule)
 *   2. where the problem is                     (conflicts, only when a real constraint is violated)
 *   3. what still needs a place                 (work with a day but no time)
 *
 * Every section is conditional — a sparse day stays sparse, with no empty shells and no pressure to fill
 * free time — and the whole view is a pure function of the view model.
 */
export function CalendarDayView({ view, onOpenItem }: { view: CalendarDayViewModel; onOpenItem: (ref: ItemRef) => void }) {
  const ctx = copyContextFor(view);
  const timed = view.dayItems.filter((item) => item.timing.kind === 'timed');
  const known = view.dayItems.length === 0;

  if (known) return <CalendarEmptyDay />;

  return (
    <View>
      <DaySummary view={view} ctx={ctx} />
      <ConflictList conflicts={view.conflicts} ctx={ctx} />
      {timed.length > 0 ? (
        <View>
          <Overline style={{ marginBottom: spacing.xs }}>{COPY.agendaHeading}</Overline>
          <AgendaList items={timed} ctx={ctx} onOpenItem={onOpenItem} />
        </View>
      ) : null}
      <NotScheduledSection view={view} ctx={ctx} onOpenItem={onOpenItem} />
      <UnknownNotice missing={view.unknownStates} ctx={ctx} />
    </View>
  );
}
