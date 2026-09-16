import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, TextField } from '../../design/components';
import { spacing } from '../../design/tokens';
import { captureNeedsMeItem } from '../../domain/needsMe';
import { useAppStore } from '../../store/AppStateProvider';

/**
 * The lowest-friction capture point in the product: a title is enough.
 * Category and due date are never asked here — they're add-ons for later,
 * on the full Needs Me list.
 */
export function NeedsMeQuickAdd() {
  const store = useAppStore();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const onCapture = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    const saved = await store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: trimmed }));
    setBusy(false);
    if (saved) setTitle('');
  };

  return (
    <Card tone="subtle" style={styles.card}>
      <AppText variant="bodyStrong" style={styles.label}>
        Something on your mind?
      </AppText>
      <TextField label="Needs Me" value={title} onChangeText={setTitle} placeholder="Call insurance" />
      <View style={styles.row}>
        <Button label="Capture" size="sm" onPress={onCapture} disabled={busy || title.trim().length === 0} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  label: { marginBottom: spacing.md },
  row: { flexDirection: 'row' },
});
