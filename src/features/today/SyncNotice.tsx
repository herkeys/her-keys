import { StyleSheet, View } from 'react-native';
import { AppText } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { needsSyncAttention, needsSyncAttentionCount } from '../../domain/sync/syncTypes';
import { useAccount } from '../../store/AccountProvider';

/**
 * One quiet line when changes are waiting for her, and nothing at all
 * otherwise.
 *
 * This is the whole user-visible surface of sync in this wave. Preserved but
 * invisible conflict evidence would be no better than losing it, so the
 * EXISTENCE of unresolved intent is surfaced — and nothing else. No revisions,
 * no queue ids, no cursors, no database errors, no dashboard. Resolving them is
 * a later wave's job; noticing them is this one's.
 */
export function SyncNotice() {
  const { syncNamespace } = useAccount();
  if (!needsSyncAttention(syncNamespace)) return null;

  const count = needsSyncAttentionCount(syncNamespace);

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <AppText variant="caption" color={colors.textTertiary}>
        {count === 1 ? 'One change needs your attention.' : `${count} changes need your attention.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
});
