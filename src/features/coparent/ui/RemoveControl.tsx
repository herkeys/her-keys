import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, InlineNotice } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { COPY } from '../copy';

export interface RemoveControlProps {
  /** The button's own label, shown both to start the removal and to confirm it. */
  label: string;
  confirmTitle: string;
  confirmBody: string;
  busy: boolean;
  onConfirm: () => void;
}

/**
 * A removal takes two deliberate steps, in place: the first tap only asks, the second (on the same label) removes. There is no
 * native alert, so a screen reader and a keyboard reach it the same way as every other control.
 */
export function RemoveControl({ label, confirmTitle, confirmBody, busy, onConfirm }: RemoveControlProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) return <Button label={label} variant="ghost" onPress={() => setConfirming(true)} disabled={busy} style={styles.first} />;

  return (
    <View style={styles.confirm}>
      <InlineNotice title={confirmTitle} body={confirmBody} />
      <View style={styles.actions}>
        <Button label={label} onPress={onConfirm} disabled={busy} />
        <Button label={COPY.actions.cancel} variant="ghost" onPress={() => setConfirming(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  first: { alignSelf: 'flex-start' },
  confirm: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
