import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useRestorePurchases } from '../../monetization/useRestorePurchases';

/**
 * Restore Purchases for the permanent Settings / Account surface.
 *
 * Self-contained so the surface that owns the account (the deletion-lifecycle workstream's Settings shell) can mount it with
 * one line and no change to `AccountPanel`:
 *
 *   <RestorePurchasesControl accountId={boundAccountId} onRestoringChange={setHoldAccountActions} />
 *
 * - `accountId` is the BOUND account's id, or `null`. With `null` (signed out, reconnecting, quarantined) nothing renders:
 *   a restore is only ever started for an account whose RevenueCat identity the SDK boundary has verified.
 * - `blocked` disables the control while the host is busy (e.g. signing in or out).
 * - `onRestoringChange` tells the host when a restore is pending so it can hold Sign out, Delete account and Done; those
 *   actions would otherwise race a store transaction.
 *
 * Mount exactly one restore control per surface. The interim "Your Account" screen already shows one through `AccountPanel`'s
 * `onRestore` props (same hook); Settings should replace that entry rather than add a second.
 */
export function RestorePurchasesControl({
  accountId,
  blocked = false,
  onRestoringChange,
}: {
  accountId: string | null;
  blocked?: boolean;
  onRestoringChange?: (restoring: boolean) => void;
}) {
  const { restoring, notice, restore } = useRestorePurchases(accountId, blocked);

  useEffect(() => {
    onRestoringChange?.(restoring);
  }, [restoring, onRestoringChange]);

  if (accountId === null) return null;

  return (
    <View style={styles.root}>
      <Button
        label={restoring ? 'Restoring purchases…' : 'Restore purchases'}
        variant="secondary"
        disabled={blocked || restoring}
        onPress={() => void restore()}
      />
      {notice ? (
        <AppText variant="bodySm" color={colors.textSecondary} style={styles.note} accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  note: { marginTop: spacing.xs },
});
