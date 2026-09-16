import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { updateEvent } from '../../domain/events';
import { updateTask } from '../../domain/tasks';
import type { ActionRecord } from '../../domain/state';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';

interface HandledEntry {
  key: string;
  summary: string;
  when: string;
  onUndo?: () => void;
}

function timeOf(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function describe(action: ActionRecord, taskTitle: (id: string) => string, eventTitle: (id: string) => string): HandledEntry | null {
  const when = timeOf(action.createdAt);
  if (action.type === 'daily_load.move_task') {
    return { key: action.id, summary: `“${taskTitle(action.targetId)}” moved to tomorrow`, when };
  }
  if (action.type === 'daily_load.move_event') {
    return { key: action.id, summary: `“${eventTitle(action.targetId)}” moved to tomorrow`, when };
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
 * MOVE approvals can be undone from the action's own stored before-state;
 * reversibility is a framework principle, not a special case.
 */
export function HandledLedger() {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const [expanded, setExpanded] = useState(false);

  const taskTitle = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'a task';
  const eventTitle = (id: string) => state.events.find((e) => e.id === id)?.title ?? 'an event';

  const approved = state.actions.filter((a) => 'approval' in a && a.approval === 'approved' && a.type.startsWith('daily_load.'));
  if (approved.length === 0) return null;

  const entries = approved
    .map((action) => {
      const entry = describe(action, taskTitle, eventTitle);
      if (!entry) return null;
      if (action.type === 'daily_load.move_task') {
        const task = state.tasks.find((t) => t.id === action.targetId);
        entry.onUndo = task
          ? () => store.commit((current, ctx) => updateTask(current, ctx, action.targetId, { plan: action.before.plan }))
          : undefined;
      }
      if (action.type === 'daily_load.move_event') {
        const event = state.events.find((e) => e.id === action.targetId);
        entry.onUndo = event
          ? () => store.commit((current, ctx) => updateEvent(current, ctx, action.targetId, { startsAt: action.before.startsAt, endsAt: action.before.endsAt }))
          : undefined;
      }
      return entry;
    })
    .filter((entry): entry is HandledEntry => entry !== null)
    .reverse();

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" accessibilityLabel="Handled by Her Keys">
        <Overline>{`Handled by Her Keys (${entries.length}) ${expanded ? '▾' : '▸'}`}</Overline>
      </Pressable>
      {expanded && (
        <Card tone="subtle" style={styles.card}>
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
              {entry.onUndo && <Button label="Undo" variant="ghost" size="sm" onPress={entry.onUndo} />}
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
