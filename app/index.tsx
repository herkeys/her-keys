import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';
import { useOnboarding } from '../src/store/OnboardingContext';

export default function Welcome() {
  const { resumeStep, recordStep } = useOnboarding();
  // Decided when Welcome first appears after launch: someone part-way through
  // onboarding picks up where she left off. Access itself is decided by the root guards.
  const [resumeAt] = useState(resumeStep);
  if (resumeAt) return <Redirect href={`/onboarding/${resumeAt}`} />;

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Overline>Her Keys</Overline>
        <AppText variant="hero" style={styles.title}>
          Rebuild your life.{'\n'}Run it your way.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          Her Keys holds the parts of your life you shouldn’t have to keep in your head — and tells you what actually
          needs you today.
        </AppText>
      </View>

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
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  footnote: { marginBottom: spacing.lg },
});
