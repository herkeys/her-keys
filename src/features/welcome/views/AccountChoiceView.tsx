import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText, FadeIn, Overline } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';
import { methodsForPlatform, type WelcomeAuthCallbacks, type WelcomeAuthMethod, type WelcomeAuthViewState } from '../model';
import { ProviderButton } from '../ProviderButton';

export interface AccountChoiceViewProps {
  platform: WelcomeAuthViewState['platform'];
  pending: WelcomeAuthMethod | null;
  /** The degraded presentation supplies its own reconnect header instead. */
  headerless?: boolean;
  onApple: WelcomeAuthCallbacks['onApple'];
  onGoogle: WelcomeAuthCallbacks['onGoogle'];
  onChooseEmail: WelcomeAuthCallbacks['onChooseEmail'];
}

/**
 * The account choice. She is never asked to decide whether she is "creating
 * an account" or "signing in" first — every option reads "Continue with…",
 * in the platform's fixed order (Apple, Google, email on iOS; Google, email
 * on Android).
 *
 * While any provider flow is in flight every other control is disabled and a
 * restrained progress note appears — no full-screen skeleton for provider
 * auth. A cancelled flow returns here with no error presentation at all.
 *
 * Terms/Privacy: no legal routes exist in the app yet, so no links render
 * (see copy.ts). Reported for release follow-up rather than faked.
 */
export function AccountChoiceView({ platform, pending, headerless, onApple, onGoogle, onChooseEmail }: AccountChoiceViewProps) {
  const handlers = { apple: onApple, google: onGoogle, email: onChooseEmail } as const;
  const methods = methodsForPlatform(platform);

  return (
    <>
      {headerless ? (
        <View style={styles.body} />
      ) : (
        <FadeIn speed="deliberate" style={styles.body}>
          <Overline>{COPY.accountChoice.overline}</Overline>
          <AppText variant="hero" style={styles.title}>
            {COPY.accountChoice.title}
          </AppText>
          <AppText variant="title" color={color.text.secondary} style={styles.lede}>
            {COPY.accountChoice.lede}
          </AppText>
        </FadeIn>
      )}

      <View style={styles.footer}>
        {pending !== null && (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.action.primary} />
            <AppText variant="bodySm" color={color.text.muted}>
              {COPY.accountChoice.pending}
            </AppText>
          </View>
        )}
        {methods.map((method) => (
          <ProviderButton key={method} method={method} disabled={pending !== null} onPress={handlers[method]} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
});
