import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText, FadeIn, Overline } from '../../../design/components';
import { HER_KEYS_LEGAL_URLS } from '../../../config/legal';
import { color, sizing, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';
import { methodsForPlatform, type WelcomeAuthCallbacks, type WelcomeAuthMethod, type WelcomeAuthViewState } from '../model';
import { ProviderButton } from '../ProviderButton';

export interface AccountChoiceViewProps {
  platform: WelcomeAuthViewState['platform'];
  pending: WelcomeAuthMethod | null;
  /** The degraded presentation supplies its own reconnect header instead. */
  headerless?: boolean;
  /** The last attempt from here ended without an account. Never set for a cancellation. */
  notice?: WelcomeAuthViewState['notice'];
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
 * Terms/Privacy open the owner-published PDFs through the OS URL handler.
 * These are public documents, not authentication or app-route callbacks.
 */
export function AccountChoiceView({ platform, pending, headerless, notice, onApple, onGoogle, onChooseEmail }: AccountChoiceViewProps) {
  const handlers = { apple: onApple, google: onGoogle, email: onChooseEmail } as const;
  const methods = methodsForPlatform(platform);
  const [legalLinkError, setLegalLinkError] = useState(false);
  const openLegalDocument = (url: string) => {
    setLegalLinkError(false);
    void Linking.openURL(url).catch(() => setLegalLinkError(true));
  };

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
        {/* Only where she is choosing an account and Apple is among the choices: a reconnect must return to the same
            account, so suggesting another method there would mislead (same rule as the account surface). */}
        {!headerless && methods.includes('apple') && (
          <AppText variant="bodySm" color={color.text.muted} style={styles.notice}>
            {COPY.accountChoice.crossPlatformNote}
          </AppText>
        )}
        {pending === null && notice === 'attempt-failed' && (
          <AppText variant="bodySm" color={color.text.muted} style={styles.notice} accessibilityLiveRegion="polite">
            {COPY.accountChoice.attemptFailed}
          </AppText>
        )}
        {methods.map((method) => (
          <ProviderButton key={method} method={method} disabled={pending !== null} onPress={handlers[method]} />
        ))}
        <AppText variant="bodySm" color={color.text.muted} style={styles.legalNotice}>
          {COPY.accountChoice.legalNotice}
        </AppText>
        <View style={styles.legalLinks}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={COPY.accountChoice.legalTerms}
            disabled={pending !== null}
            onPress={() => openLegalDocument(HER_KEYS_LEGAL_URLS.terms)}
            style={styles.legalLink}
          >
            <AppText variant="bodySm" color={color.action.primary}>{COPY.accountChoice.legalTerms}</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={COPY.accountChoice.legalPrivacy}
            disabled={pending !== null}
            onPress={() => openLegalDocument(HER_KEYS_LEGAL_URLS.privacy)}
            style={styles.legalLink}
          >
            <AppText variant="bodySm" color={color.action.primary}>{COPY.accountChoice.legalPrivacy}</AppText>
          </Pressable>
        </View>
        {legalLinkError && (
          <AppText variant="bodySm" color={color.status.risk} accessibilityLiveRegion="polite" style={styles.legalNotice}>
            Unable to open that document. Please try again later.
          </AppText>
        )}
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
  notice: { textAlign: 'center', marginBottom: spacing.xs },
  legalNotice: { textAlign: 'center', marginTop: spacing.xs },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  legalLink: { minHeight: sizing.minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.md },
});
