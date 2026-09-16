import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { moveWasUndone } from '../../domain/dailyLoadDecisions';
import type { LocalDate } from '../../domain/logicalDay';
import type { ActionRecord, AppState } from '../../domain/state';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useSchedule } from '../../store/ScheduleContext';
import { relativeDay } from './formatDay';

interface HandledEntry {
  key: string;
  summary: string;
  when: string;
  undoActionId: string | null;
}

function timeOf(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function describe(action: ActionRecord, state: AppState, today: LocalDate): Omit<HandledEntry, 'undoActionId'> | null {
  const taskTitle = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'a task';
  const eventTitle = (id: string) => state.events.find((e) => e.id === id)?.title ?? 'an event';
  const day = relativeDay(action.logicalDate, today);
  const when = `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${timeOf(action.createdAt)}`;

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
 * A collapsed record of every approved recommendation, built from the same
 * ActionRecords Build 2 already persists — nothing new is stored for this.
 * It is history, not authority: Undo is offered only for today's move, and
 * only while the item is still exactly where that move put it.
 */
export function HandledLedger() {
  const { state, today } = useHouseholdState();
  const { undoableMoveId, undoMove } = useSchedule();
  const [expanded, setExpanded] = useState(false);
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
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Handled by Her Keys"
        accessibilityState={{ expanded }}
      >
        <Overline>{`Handled by Her Keys (${entries.length}) ${expanded ? '▾' : '▸'}`}</Overline>
      </Pressable>
      {expanded && (
        <Card tone="subtle" style={styles.card}>
          {note && (
            <AppText variant="bodySm" color={colors.attention} accessibilityRole="alert">
              {note}
            </AppText>
          )}
          {entries.map((entry, index) => (
            <View key={entry.key} style={[styles.row, index === entries.length - 1 ? null : styles.rowDivider]}>
              <View style={styles.summary}>
                <AppText variant="bodySm" color={colors.textSecondary}>
                  {entry.summary}
                </AppText>
                <AppText variant="caption" color={colors.textTertiary}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  card: { marginTop: spacing.md, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  summary: { flex: 1 },
});
