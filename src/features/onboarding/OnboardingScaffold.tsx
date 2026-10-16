import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen, SegmentBar } from '../../design/components';
import { spacing } from '../../design/tokens';
import { useTheme } from '../../design/theme';

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
  const { colors } = useTheme();
  return (
    <Screen bottomClearance={spacing.xxl}>
      <View style={styles.progress}>
        <View style={styles.progressHeader}>
          <Overline>Life systems audit</Overline>
          <AppText variant="statusLabel" color={colors.textTertiary}>
            {step} of {total}
          </AppText>
        </View>
        <SegmentBar filled={step} total={total} tone="accent" />
      </View>

      <AppText variant="display">{title}</AppText>
      {description && (
        <AppText variant="supporting" color={colors.textSecondary} style={styles.description}>
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
  // No flexGrow: spare height belongs below Continue, not between the answers and the action it belongs to.
  content: { marginTop: spacing.xxl, marginBottom: spacing.xxl },
});
