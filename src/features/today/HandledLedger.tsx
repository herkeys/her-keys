import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { moveWasUndone } from '../../domain/dailyLoadDecisions';
import { epochMsOf, wallClockMinutesAt, type LocalDate } from '../../domain/logicalDay';
import type { ActionRecord, AppState } from '../../domain/state';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useSchedule } from '../../store/ScheduleContext';
import { formatTime } from '../daily-load/computeDailyLoad';
import { relativeDay } from './formatDay';
import { TodayDisclosure } from './TodayDisclosure';

interface HandledEntry {
  key: string;
  summary: string;
  when: string;
  undoActionId: string | null;
}

/** A clock time in the household's own timezone — the device's would be wrong for a household whose day is elsewhere. */
function timeOf(createdAt: string, timeZone: string): string {
  return formatTime(wallClockMinutesAt(epochMsOf(createdAt), timeZone));
}

function describe(action: ActionRecord, state: AppState, today: LocalDate): Omit<HandledEntry, 'undoActionId'> | null {
  const taskTitle = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'a task';
  const eventTitle = (id: string) => state.events.find((e) => e.id === id)?.title ?? 'an event';
  const day = relativeDay(action.logicalDate, today);
  const when = `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${timeOf(action.createdAt, state.user.timezone)}`;

  if (action.type === 'daily_load.move_task' || action.type === 'daily_load.move_event') {
    const title = action.type === 'daily_load.move_task' ? taskTitle(action.targetId) : eventTitle(action.targetId);
    const undone = moveWasUndone(state, action) ? ' — undone' : '';
    return { key: action.id, summary: `“${title}” moved to tomorrow${undone}`, when };
  }
  if (action.type === 'daily_load.drop_task') {
    return { key: action.id, summary: `“${taskTitle(action.targetId)}” dropped`, when };
  }
  if (action.type === 'daily_load.shorten_task') {
    return { key: action.id, summary: `“${taskTitle(action.targetId)}” shortened to ${action.after.durationMinutes} minutes`, when };
  }
  if (action.type === 'daily_load.protect_item') {
    const title = action.targetType === 'task' ? taskTitle(action.targetId) : eventTitle(action.targetId);
    return { key: action.id, summary: `“${title}” protected from future moves`, when };
  }
  return null;
}

/**
 * A collapsed record of every recommendation she approved, built from the same ActionRecords
 * Build 2 already persists — nothing new is stored for this.
 *
 * It is a record of HER DECISIONS, and it is labelled as one. An `ActionRecord` is a decision
 * (`semantics.ts` classifies it so); an approval is not an execution, so this is not "handled by
 * Her Keys" — that claim is reserved for an execution with a successful outcome (the Handled
 * section). It is history, not authority: Undo is offered only for today's move, and only while
 * the item is still exactly where that move put it.
 */
export function HandledLedger() {
  const { state, today } = useHouseholdState();
  const { undoableMoveId, undoMove } = useSchedule();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inFlight = useRef(false);

  const approved = state.actions.filter((a) => 'approval' in a && a.approval === 'approved' && a.type.startsWith('daily_load.'));
  if (approved.length === 0) return null;

  const entries: HandledEntry[] = approved
    .map((action) => {
      const entry = describe(action, state, today);
      return entry ? { ...entry, undoActionId: action.id === undoableMoveId ? action.id : null } : null;
    })
    .filter((entry): entry is HandledEntry => entry !== null)
    .reverse();

  const onUndo = async (actionId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    try {
      if (!(await undoMove(actionId))) setNote('Her Keys couldn’t undo that yet. Nothing changed — try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <TodayDisclosure title="Changes you approved" summary={String(entries.length)}>
      <Card tone="subtle" style={styles.card}>
        {note && (
          <AppText variant="supporting" color={color.status.attention} accessibilityRole="alert">
            {note}
          </AppText>
        )}
        {entries.map((entry, index) => (
          <View key={entry.key} style={[styles.row, index === entries.length - 1 ? null : styles.rowDivider]}>
            <View style={styles.summary}>
              <AppText variant="supporting" color={color.text.secondary}>
                {entry.summary}
              </AppText>
              <AppText variant="metadata" color={color.text.muted}>
                {entry.when} · approved by you
              </AppText>
            </View>
            {entry.undoActionId && (
              <Button
                label="Undo"
                variant="ghost"
                size="sm"
                disabled={busy}
                accessibilityHint={`Undoes: ${entry.summary}`}
                onPress={() => onUndo(entry.undoActionId as string)}
              />
            )}
          </View>
        ))}
      </Card>
    </TodayDisclosure>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  summary: { flex: 1 },
});
