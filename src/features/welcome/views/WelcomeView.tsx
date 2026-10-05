import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, FadeIn, Overline } from '../../../design/components';
import { color, sizing, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';

export interface WelcomeViewProps {
  onBegin: () => void;
}

/**
 * The root of the welcome tree — no back affordance, and Android hardware
 * Back must not skip into onboarding (the integration owns the hardware
 * binding; this view simply offers nothing to go back to).
 *
 * The presentation mirrors the established Welcome: the gold brand mark
 * resolves the launch splash into the warm interior, then the pinned
 * headline and lede carry the screen.
 */
export function WelcomeView({ onBegin }: WelcomeViewProps) {
  return (
    <>
      <FadeIn speed="deliberate" style={styles.body}>
        <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="key-outline" size={sizing.icon.lg} color={color.brand.gold} />
        </View>
        <Overline>{COPY.welcome.overline}</Overline>
        <AppText variant="hero" style={styles.title}>
          {COPY.welcome.title}
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          {COPY.welcome.lede}
        </AppText>
      </FadeIn>

      <View style={styles.footer}>
        <AppText variant="bodySm" color={color.text.muted} style={styles.footnote}>
          {COPY.welcome.footnote}
        </AppText>
        <Button label={COPY.welcome.begin} onPress={onBegin} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand.goldSoft,
    marginBottom: spacing.lg,
  },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  footnote: { marginBottom: spacing.lg },
});
