import { View } from 'react-native';
import { Overline } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { COPY, copyContextFor } from '../copy';
import type { PreviewableIntent } from '../model/preview';
import type { CalendarDayViewModel, ItemRef } from '../model/types';
import { RecommendationSection, UndoNotice } from './ActionPanels';
import { AgendaList } from './AgendaList';
import { CalendarEmptyDay } from './CalendarStates';
import { ConflictList, DaySummary, NarrowTransitionList, UnknownNotice } from './DayInsights';
import { NotScheduledSection } from './NotScheduled';

/**
 * What she can DO on this day. All optional: without them the day is a pure, read-only view (a past day, a
 * gallery scene, a foundation that offers nothing). With them, only actions the action map lists as available
 * are ever rendered.
 */
export interface DayActions {
  onPreview: (intent: PreviewableIntent) => void;
  onKeep: (keep: 'timing' | 'capacity') => void;
  onProtect: (ref: ItemRef) => void;
  /** Set when a move made today can still be undone. */
  undo: { title: string; busy: boolean; onUndo: () => void } | null;
}

/**
 * One day, in the order she needs it (contract section 17):
 *   1. what is fixed and where the day stands   (summary + the schedule)
 *   2. where the problem is                     (conflicts, only when a real constraint is violated)
 *   3. what still needs a place                 (work with a day but no time)
 *
 * Every section is conditional — a sparse day stays sparse, with no empty shells and no pressure to fill
 * free time — and the whole view is a pure function of the view model.
 */
export function CalendarDayView({ view, onOpenItem, actions }: { view: CalendarDayViewModel; onOpenItem: (ref: ItemRef) => void; actions?: DayActions }) {
  const ctx = copyContextFor(view);
  const timed = view.dayItems.filter((item) => item.timing.kind === 'timed');
  const known = view.dayItems.length === 0;

  const protectable = new Set(view.availableActions.filter((a) => a.action === 'PROTECT' && a.available && a.itemRef !== null).map((a) => `${a.itemRef!.kind}:${a.itemRef!.id}`));

  if (known && (actions?.undo ?? null) === null) return <CalendarEmptyDay />;

  return (
    <View>
      {known ? null : <DaySummary view={view} ctx={ctx} />}
      {actions?.undo ? <UndoNotice title={actions.undo.title} busy={actions.undo.busy} onUndo={actions.undo.onUndo} /> : null}
      {known ? <CalendarEmptyDay /> : null}
      <ConflictList conflicts={view.conflicts} ctx={ctx} />
      <NarrowTransitionList narrow={view.narrowTransitions} ctx={ctx} />
      {actions ? <RecommendationSection view={view} ctx={ctx} onPreview={actions.onPreview} onKeep={actions.onKeep} /> : null}
      {timed.length > 0 ? (
        <View>
          <Overline style={{ marginBottom: spacing.xs }}>{COPY.agendaHeading}</Overline>
          <AgendaList items={timed} ctx={ctx} onOpenItem={onOpenItem} protectable={actions ? protectable : undefined} onProtect={actions?.onProtect} />
        </View>
      ) : null}
      <NotScheduledSection view={view} ctx={ctx} onOpenItem={onOpenItem} />
      <UnknownNotice missing={view.unknownStates} ctx={ctx} />
    </View>
  );
}
