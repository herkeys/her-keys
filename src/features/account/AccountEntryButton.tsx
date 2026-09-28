import { StyleSheet, View } from 'react-native';
import { Button } from '../../design/components';
import { spacing } from '../../design/tokens';

/** One quiet, small action. Renders nothing when there is nothing an entry could usefully open. */
export function AccountEntryButton({ label, onOpen }: { label: string | null; onOpen: () => void }) {
  if (label === null) return null;
  return (
    <View style={styles.wrap}>
      <Button label={label} variant="ghost" size="sm" onPress={onOpen} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, flexDirection: 'row' },
  button: { alignSelf: 'flex-start' },
});
