import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { captureNeedsMeItem } from '../../domain/needsMe';
import { FIELD_LIMITS } from '../../domain/state';
import { useAppStore } from '../../store/AppStateProvider';

/**
 * The lowest-friction capture point in the product: a title is enough.
 * Category and due date are never asked for here.
 */
export function NeedsMeQuickAdd() {
  const store = useAppStore();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // A second tap in the same frame would otherwise capture twice before `busy` renders.
  const inFlight = useRef(false);

  const onCapture = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    const saved = await store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: trimmed }));
    inFlight.current = false;
    setBusy(false);
    if (saved) setTitle('');
    else setNote('Her Keys couldn’t save that yet. It’s still here — try again.');
  };

  return (
    <Card tone="subtle" style={styles.card}>
      <AppText variant="bodyStrong" style={styles.label}>
        Something on your mind?
      </AppText>
      <TextField label="Needs Me" value={title} onChangeText={setTitle} placeholder="Call insurance" maxLength={FIELD_LIMITS.titleLength} />
      {note && (
        <AppText variant="bodySm" color={colors.attention} style={styles.note} accessibilityRole="alert">
          {note}
        </AppText>
      )}
      <View style={styles.row}>
        <Button label="Capture" size="sm" onPress={onCapture} disabled={busy || title.trim().length === 0} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  label: { marginBottom: spacing.md },
  note: { marginBottom: spacing.md },
  row: { flexDirection: 'row' },
});
