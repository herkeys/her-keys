import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';
import { useAccount } from '../src/store/AccountProvider';

/**
 * This device is holding one account's household while a different account is
 * signed in.
 *
 * Nothing is merged, nothing is uploaded, and nothing is deleted. The other
 * household stays exactly where it is and is not rendered here — not a title,
 * not a count, not a date. Showing any of it would be the leak this screen
 * exists to prevent (B4-P0-035).
 *
 * The only move offered is to sign back out, which returns the device to the
 * household it already has.
 */
export default function AccountConflict() {
  const { state, busy, signOut } = useAccount();
  const quarantined = state.kind === 'boundOther';

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Overline>Different account</Overline>
        <AppText variant="hero" style={styles.title}>
          This phone already{'\n'}belongs to someone.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          The household saved on this device was set up under a different account. It has not been changed, moved or
          shared — it is simply not this account&rsquo;s to open.
        </AppText>
        <AppText variant="bodySm" color={colors.textTertiary} style={styles.note}>
          Sign out to go back to it.
        </AppText>
      </View>

      <View style={styles.footer}>
        <Button label="Sign out" onPress={() => void signOut()} disabled={busy || !quarantined} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  note: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
});
