import { ScrollView, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText, Button, Overline } from '../../design/components';
import { spacing } from '../../design/tokens';
import { useTheme } from '../../design/theme';
import type { AuthProvider } from '../../domain/account/identity';
import { CROSS_PLATFORM_NOTE, PROVIDER_LABELS, showsCrossPlatformNote, type AccountModalMode } from './accountModel';
import { AppearanceSection } from './AppearanceSection';

export interface AccountPanelProps {
  onPrivacy?: () => void;
  mode: AccountModalMode;
  /** Providers this device reports available — asked of the adapters, never assumed from the platform. */
  providers: readonly AuthProvider[];
  busy: boolean;
  /** The last sign-in did not go through. */
  failed: boolean;
  onSignIn: (provider: AuthProvider) => void;
  onSignOut: () => void;
  onClose: () => void;
  onRestore?: () => void;
  restoring?: boolean;
  restoreNotice?: string | null;
  restoreControl?: ReactNode;
  /**
   * Her Keys Premium (status, the three tools, purchase and manage). When present, the ONE Restore Purchases control is placed directly
   * beneath it instead of in the footer — it is moved, never duplicated.
   */
  premiumSection?: ReactNode;
}

/**
 * Your Account. Signing in is offered, never demanded: her household already works on this device, and an account is what
 * connects it to account-backed sync. A new phone with nothing set up adopts the household the account already has and pulls its synced records; a phone that already
 * holds its own household is never merged into one (the server refuses it). Signing out keeps everything on this phone; the next sign-in
 * of the same account resumes it. Presentational only — the route supplies the actions, and they all go through AccountRuntime.
 */
export function AccountPanel({ mode, providers, busy, failed, onSignIn, onSignOut, onClose, onRestore, restoring = false, restoreNotice, restoreControl, onPrivacy, premiumSection }: AccountPanelProps) {
  const { colors } = useTheme();
  const copy = COPY[mode];
  const offersProviders = mode === 'signIn' || mode === 'reconnect';
  const premiumShown = mode === 'connected' && premiumSection != null;
  const restoreBlock =
    mode === 'connected' && restoreControl ? restoreControl : mode === 'connected' && onRestore ? (
      <>
        <Button label={restoring ? 'Restoring purchases…' : 'Restore purchases'} variant="secondary" disabled={busy || restoring} onPress={onRestore} />
        {restoreNotice ? <AppText variant="bodySm" style={styles.note} accessibilityLiveRegion="polite">{restoreNotice}</AppText> : null}
      </>
    ) : null;

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.body}>
        <Overline>{copy.overline}</Overline>
        <AppText variant="hero" accessibilityRole="header" style={styles.title}>
          {copy.title}
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          {copy.lede}
        </AppText>
      </View>

      {premiumShown ? (
        <View style={styles.premium}>
          {premiumSection}
          {restoreBlock}
        </View>
      ) : null}

      {/* Appearance is device-local and needs no account, so every account-panel state offers it. */}
      <View style={styles.appearance}>
        <AppearanceSection />
      </View>

      <View style={styles.footer}>
        {mode === 'connected' && onPrivacy ? <Button label="Privacy & Data" variant="secondary" disabled={busy || restoring} onPress={onPrivacy} /> : null}
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

        {premiumShown ? null : restoreBlock}
        {mode === 'connected' && <Button label="Sign out" variant="secondary" disabled={busy || restoring} onPress={onSignOut} />}

        <Button label={mode === 'connected' ? 'Done' : 'Not now'} variant="ghost" onPress={onClose} disabled={restoring || (busy && mode !== 'resolving')} />
      </View>
    </ScrollView>
  );
}

const COPY: Record<AccountModalMode, { overline: string; title: string; lede: string }> = {
  signIn: {
    overline: 'Your account',
    title: 'Connect your\naccount.',
    lede: 'Your information stays on this phone. Signing in connects eligible records to your account. On a new phone with nothing set up yet, signing in to an existing account brings its synced records here.',
  },
  reconnect: {
    overline: 'Reconnect',
    title: 'Your life is here.\nReconnect the cloud.',
    lede: 'Nothing on this device was removed. Sign in again to reconnect this same account and resume syncing.',
  },
  connected: {
    overline: 'Your account',
    title: 'Your account\nis connected.',
    lede: 'Your household is connected to this account on this phone, and eligible records sync to it. On a new phone with nothing set up yet, signing in to this account brings those synced records here. Signing out keeps this phone’s information.',
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
  root: { flexGrow: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  premium: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: spacing.md },
  appearance: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  note: { textAlign: 'center' },
});
