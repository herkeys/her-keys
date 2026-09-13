import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen, SegmentBar } from '../../design/components';
import { colors, spacing } from '../../design/tokens';

interface OnboardingScaffoldProps {
  step: number;
  total: number;
  title: string;
  description?: string;
  children: ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

export function OnboardingScaffold({
  step,
  total,
  title,
  description,
  children,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled,
}: OnboardingScaffoldProps) {
  return (
    <Screen>
      <View style={styles.progress}>
        <View style={styles.progressHeader}>
          <Overline>Life systems audit</Overline>
          <AppText variant="micro" color={colors.textTertiary}>
            {step} of {total}
          </AppText>
        </View>
        <SegmentBar filled={step} total={total} tone="accent" />
      </View>

      <AppText variant="hero">{title}</AppText>
      {description && (
        <AppText variant="title" color={colors.textSecondary} style={styles.description}>
          {description}
        </AppText>
      )}

      <View style={styles.content}>{children}</View>

      <Button label={continueLabel} onPress={onContinue} disabled={continueDisabled} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { marginBottom: spacing.xxl },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  description: { marginTop: spacing.md },
  content: { marginTop: spacing.xxl, marginBottom: spacing.xxl, flexGrow: 1 },
});
