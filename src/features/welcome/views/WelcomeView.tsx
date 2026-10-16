import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, FadeIn, KeyBadge, Overline } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';

export interface WelcomeViewProps {
  onBegin: () => void;
  onExistingAccount: () => void;
}

/**
 * The root of the welcome tree — no back affordance, and Android hardware
 * Back must not skip into onboarding (the integration owns the hardware
 * binding; this view simply offers nothing to go back to).
 *
 * HK-FE-UI-02: the rounded Her Keys key badge sits on the warm off-white ground (the shell adds the faint curve and botanical
 * sprig behind the empty top region), then the pinned headline and lede in Deep Plum Gray carry the screen. The two decisions
 * and every word of copy are unchanged.
 */
export function WelcomeView({ onBegin, onExistingAccount }: WelcomeViewProps) {
  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <FadeIn speed="deliberate">
        <KeyBadge style={styles.mark} />
        <Overline>{COPY.welcome.overline}</Overline>
        <AppText variant="hero" style={styles.title}>
          {COPY.welcome.title}
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          {COPY.welcome.lede}
        </AppText>
      </FadeIn>
      </ScrollView>

      <View style={styles.footer}>
        <AppText variant="bodySm" color={color.text.muted} style={styles.footnote}>
          {COPY.welcome.footnote}
        </AppText>
        <Button label={COPY.welcome.begin} onPress={onBegin} />
        <Button label={COPY.welcome.existingAccount} variant="secondary" onPress={onExistingAccount} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: { marginBottom: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  footnote: { marginBottom: spacing.lg },
});
