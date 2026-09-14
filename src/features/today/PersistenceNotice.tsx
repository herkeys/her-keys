import { StyleSheet, View } from 'react-native';
import { AppText } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useStoreSnapshot } from '../../store/AppStateProvider';

/**
 * A quiet line when saving isn't keeping up, or when stored data couldn't be
 * used and Her Keys started over. Nothing at all when everything is fine.
 */
export function PersistenceNotice() {
  const { recovery, persistenceDegraded } = useStoreSnapshot();

  const lines: string[] = [];
  const startedOver = recovery !== null && !['future_version', 'read_failed', 'mode_mismatch'].includes(recovery.reason);
  if (startedOver) lines.push('Her Keys couldn’t read what was saved on this device, so it started fresh.');
  if (persistenceDegraded) lines.push('Some recent changes may not be saved yet.');
  if (lines.length === 0) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      {lines.map((line) => (
        <AppText key={line} variant="caption" color={colors.textTertiary}>
          {line}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: spacing.xxs },
});
