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
  /** Present on every step after the first: a visible Back that also works when the audit was resumed after a relaunch. */
  onBack?: () => void;
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
  onBack,
}: OnboardingScaffoldProps) {
  const { colors } = useTheme();
  return (
    <Screen bottomClearance={spacing.xxl}>
      {onBack ? <Button label="Back" variant="ghost" size="sm" onPress={onBack} style={styles.back} /> : null}
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
  back: { alignSelf: 'flex-start', marginBottom: spacing.md },
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
