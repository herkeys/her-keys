import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, FadeIn, Overline, Screen } from '../src/design/components';
import { color, colors, sizing, spacing } from '../src/design/tokens';
import { useOnboarding } from '../src/store/OnboardingContext';

export default function Welcome() {
  const { resumeStep, recordStep } = useOnboarding();
  // Decided when Welcome first appears after launch: someone part-way through
  // onboarding picks up where she left off. Access itself is decided by the root guards.
  const [resumeAt] = useState(resumeStep);
  if (resumeAt) return <Redirect href={`/onboarding/${resumeAt}`} />;

  return (
    <Screen scroll={false}>
      <FadeIn speed="deliberate" style={styles.body}>
        {/* The brand bridge: the launch splash's gold mark resolves into this one
            quiet gold key, then the warm interior takes over. */}
        <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="key-outline" size={sizing.icon.lg} color={color.brand.gold} />
        </View>
        <Overline>Her Keys</Overline>
        <AppText variant="hero" style={styles.title}>
          Rebuild your life.{'\n'}Run it your way.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          Her Keys holds the parts of your life you shouldn’t have to keep in your head — and tells you what actually
          needs you today.
        </AppText>
      </FadeIn>

      <View style={styles.footer}>
        <AppText variant="bodySm" color={colors.textTertiary} style={styles.footnote}>
          First, a couple of minutes on how your life runs now — what already works, and where it tends to break down.
        </AppText>
        <Button
          label="Begin"
          onPress={() => {
            recordStep('goals');
            router.push('/onboarding/goals');
          }}
        />
      </View>
    </Screen>
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
