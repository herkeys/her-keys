import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { AuthProvider } from '../../domain/account/identity';
import { CROSS_PLATFORM_NOTE, PROVIDER_LABELS, showsCrossPlatformNote, type AccountModalMode } from './accountModel';

export interface AccountPanelProps {
  mode: AccountModalMode;
  /** Providers this device reports available — asked of the adapters, never assumed from the platform. */
  providers: readonly AuthProvider[];
  busy: boolean;
  /** The last sign-in did not go through. */
  failed: boolean;
  onSignIn: (provider: AuthProvider) => void;
  onSignOut: () => void;
  onClose: () => void;
}

/**
 * Your Account. Signing in is offered, never demanded: her household already works on this device, and an account is what
 * connects it to account-backed sync. Fresh-device household adoption is not implemented yet. Signing out keeps everything on this phone; the next sign-in of the same account
 * resumes it. Presentational only — the route supplies the actions, and they all go through AccountRuntime.
 */
export function AccountPanel({ mode, providers, busy, failed, onSignIn, onSignOut, onClose }: AccountPanelProps) {
  const copy = COPY[mode];
  const offersProviders = mode === 'signIn' || mode === 'reconnect';

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Overline>{copy.overline}</Overline>
        <AppText variant="hero" accessibilityRole="header" style={styles.title}>
          {copy.title}
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          {copy.lede}
        </AppText>
      </View>

      <View style={styles.footer}>
        {failed && offersProviders && (
          <AppText variant="bodySm" color={colors.textTertiary} style={styles.note} accessibilityLiveRegion="polite">
            That did not go through. Nothing on this device changed — you can try again.
          </AppText>
        )}

        {showsCrossPlatformNote(mode, providers) && (
          <AppText variant="bodySm" color={colors.textTertiary} style={styles.note}>
            {CROSS_PLATFORM_NOTE}
          </AppText>
        )}

        {offersProviders &&
          providers.map((provider) => (
            <Button key={provider} label={PROVIDER_LABELS[provider]} disabled={busy} onPress={() => onSignIn(provider)} />
          ))}

        {mode === 'connected' && <Button label="Sign out" variant="secondary" disabled={busy} onPress={onSignOut} />}

        <Button label={mode === 'connected' ? 'Done' : 'Not now'} variant="ghost" onPress={onClose} disabled={busy && mode !== 'resolving'} />
      </View>
    </View>
  );
}

const COPY: Record<AccountModalMode, { overline: string; title: string; lede: string }> = {
  signIn: {
    overline: 'Your account',
    title: 'Connect your\naccount.',
    lede: 'Your information stays on this phone. Signing in connects eligible records to your account, but restoring this household on a new phone is not available yet.',
  },
  reconnect: {
    overline: 'Reconnect',
    title: 'Your life is here.\nReconnect the cloud.',
    lede: 'Nothing on this device was removed. Sign in again to reconnect this same account and resume syncing.',
  },
  connected: {
    overline: 'Your account',
    title: 'Your account\nis connected.',
    lede: 'Your household is connected to this account on this phone. Eligible records can sync. New-phone household restoration is not available yet; signing out keeps this phone’s information.',
  },
  resolving: {
    overline: 'Your account',
    title: 'Connecting\nyour account.',
    lede: 'This only takes a moment. Everything on this device stays exactly as it is.',
  },
  unavailable: {
    overline: 'Your account',
    title: 'Account setup\nis unavailable.',
    lede: 'Accounts are not set up in this build yet. Her Keys keeps working on this device.',
  },
  quarantined: {
    overline: 'Your account',
    title: 'Your account',
    lede: 'Another account is signed in on this phone.',
  },
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  note: { textAlign: 'center' },
});
