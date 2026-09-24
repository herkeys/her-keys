import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';
import type { AuthProvider } from '../src/domain/account/identity';
import { accountProviders } from '../src/store/accountRuntimeInstance';
import { useAccount } from '../src/store/AccountProvider';

const LABELS: Record<AuthProvider, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
};

/**
 * Signing in is offered, never demanded. Her household already works on this
 * device, and an account is what lets it follow her to the next one — so this
 * screen explains that and gets out of the way.
 */
export default function SignIn() {
  const { state, available, busy, signIn } = useAccount();
  const [providers, setProviders] = useState<AuthProvider[] | null>(null);

  useEffect(() => {
    let live = true;
    // Availability is asked of the adapters, not assumed from the platform: a
    // build with no Google client id should not show a button that cannot work.
    accountProviders
      .available()
      .then((offered) => {
        if (live) setProviders(offered);
      })
      .catch(() => {
        if (live) setProviders([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const failed = state.kind === 'authError' ? state.detail : null;
  const reconnecting = state.kind === 'authDegraded';

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Overline>{reconnecting ? 'Reconnect' : 'Your account'}</Overline>
        <AppText variant="hero" style={styles.title}>
          {reconnecting ? <>Your life is here.{'\n'}Reconnect the cloud.</> : <>Keep your life{'\n'}on every device.</>}
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          {reconnecting
            ? 'Nothing on this device was removed. Sign in again to reconnect this same account and resume syncing.'
            : 'Everything you have built here stays exactly as it is. Signing in gives it somewhere safe to live, so a new phone is not a fresh start.'}
        </AppText>
      </View>

      <View style={styles.footer}>
        {failed !== null && (
          <AppText variant="bodySm" color={colors.textTertiary} style={styles.note}>
            That did not go through. Nothing on this device changed — you can try again.
          </AppText>
        )}

        {!available && (
          <AppText variant="bodySm" color={colors.textTertiary} style={styles.note}>
            Accounts are not set up in this build yet. Her Keys keeps working on this device.
          </AppText>
        )}

        {(providers ?? []).map((provider) => (
          <Button
            key={provider}
            label={LABELS[provider]}
            disabled={busy}
            onPress={() => {
              void signIn(provider).then(() => router.back());
            }}
          />
        ))}

        <Button label="Not now" variant="ghost" onPress={() => router.back()} disabled={busy} />
      </View>
    </Screen>
  );
}


const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  note: { textAlign: 'center' },
});
