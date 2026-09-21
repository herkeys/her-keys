import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { resolveNeedsMeItem } from '../../domain/needsMe';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';

/** The full inbox: everything captured and not yet resolved, in capture order. Classification is optional and always later. */
export function NeedsMeList() {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const open = [...state.needsMe].filter((item) => item.status === 'open').sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (open.length === 0) {
    return (
      <AppText variant="body" color={colors.textSecondary}>
        Nothing captured right now.
      </AppText>
    );
  }

  const onResolve = (id: string) => store.dispatch((current, ctx) => resolveNeedsMeItem(current, id, ctx));

  // The item stays open until the task is actually saved; the editor resolves it in the same change.
  const onPromote = (id: string) => router.push({ pathname: '/task-editor', params: { needsMeId: id } });

  return (
    <View style={styles.list}>
      {open.map((item) => (
        <Card key={item.id} tone="surface" style={styles.card}>
          <AppText variant="cardTitle">{item.title}</AppText>
          <View style={styles.row}>
            <Button
              label="Promote to task"
              size="sm"
              onPress={() => onPromote(item.id)}
              accessibilityHint={`Opens a new task for “${item.title}”`}
              style={styles.button}
            />
            <Button
              label="Resolved"
              variant="ghost"
              size="sm"
              onPress={() => onResolve(item.id)}
              accessibilityHint={`Marks “${item.title}” as resolved`}
              style={styles.button}
            />
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1 },
});
