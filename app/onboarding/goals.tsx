import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

const GOAL_OPTIONS = [
  'Financial stability',
  'A calmer household',
  'More time with the kids',
  'Better routines',
  'Reduced stress',
  'Building savings',
];

export default function GoalsStep() {
  const { answers, toggleGoal } = useOnboarding();

  return (
    <OnboardingScaffold
      step={1}
      total={4}
      title="What are you rebuilding toward?"
      description="Pick a few. This isn't permanent — priorities can change."
      onContinue={() => router.push('/onboarding/strengths')}
      continueDisabled={answers.goals.length === 0}
    >
      <View style={styles.chips}>
        {GOAL_OPTIONS.map((goal) => (
          <ChipToggle key={goal} label={goal} selected={answers.goals.includes(goal)} onPress={() => toggleGoal(goal)} />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
