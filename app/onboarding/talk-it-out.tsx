import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { AppText, Card, Overline } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';

export default function TalkItOutInviteStep() {
  return (
    <OnboardingScaffold
      step={4}
      total={4}
      title="You don’t need to know what’s wrong."
      description="When something feels off but you can’t name it, you can just talk it out."
      onContinue={() => router.push('/onboarding/profile')}
      continueLabel="See my profile"
    >
      <Card tone="accent">
        <Overline color={colors.accent}>How it works</Overline>
        <AppText variant="title" style={styles.line}>
          Her Keys listens, offers a theory, then asks one question to check it.
        </AppText>
        <AppText variant="bodySm" color={colors.textSecondary} style={styles.note}>
          No diagnosing yourself first. It’s available from anywhere in the app, any time.
        </AppText>
      </Card>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.md },
  note: { marginTop: spacing.sm },
});
