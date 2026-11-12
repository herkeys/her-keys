import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { spacing } from '../../design/tokens';
import { useTheme } from '../../design/theme';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useOnboarding } from '../../store/OnboardingContext';
import { useLifeInbox } from '../talk-it-out/capture/CaptureContext';
import { chooseFirstStep, type FirstStep, type FirstStepRoute } from './firstStep';

/**
 * The one clear next step for a household with nothing in it yet. Presentation only: which step, what it says and where it goes
 * were all decided by `chooseFirstStep`, and choosing it only navigates to an existing screen — nothing is saved by tapping.
 */
export function FirstStepCardView({ step, onOpen }: { step: FirstStep; onOpen: (route: FirstStepRoute) => void }) {
  const { colors } = useTheme();
  return (
    <Card tone="subtle">
      <Overline>A good first step</Overline>
      <AppText variant="screenTitle" style={styles.title}>
        {step.title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.body}>
        {step.body}
      </AppText>
      {step.reason ? (
        <AppText variant="bodySm" color={colors.textTertiary} style={styles.reason}>
          {step.reason}
        </AppText>
      ) : null}
      <View style={styles.primary}>
        <Button label={step.label} onPress={() => onOpen(step.route)} />
      </View>
      <View style={styles.alternatives}>
        {step.alternatives.map((option) => (
          <Button key={option.kind} label={option.label} variant="ghost" size="sm" onPress={() => onOpen(option.route)} />
        ))}
      </View>
    </Card>
  );
}

/**
 * Reads what the household holds and what she chose in the audit, and shows the step. If there is no step to show (the household
 * already has entries), the caller's own notice is shown instead, so Today never loses its empty-state message.
 */
export function FirstStepCard({ children }: { children?: ReactNode }) {
  const { state } = useHouseholdState();
  const { selected } = useOnboarding();
  const inbox = useLifeInbox();

  const step = chooseFirstStep({
    household: {
      origin: state.origin,
      eventCount: state.events.length,
      taskCount: state.tasks.length,
      needsMeCount: state.needsMe.length,
      inboxOpenCount: inbox.phase === 'items' ? inbox.count : inbox.phase === 'recovery' ? inbox.items.length : inbox.phase === 'empty' ? 0 : null,
    },
    struggleIds: selected.struggleIds,
  });

  if (step === null) return <>{children}</>;
  return <FirstStepCardView step={step} onOpen={(route) => router.push(route)} />;
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.sm },
  body: { marginTop: spacing.sm },
  reason: { marginTop: spacing.sm },
  primary: { marginTop: spacing.lg },
  alternatives: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
