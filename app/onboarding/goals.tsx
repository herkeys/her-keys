import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { onboardingOptions } from '../../src/data/catalog/onboardingOptions';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

export default function GoalsStep() {
  const { selected, toggleGoal, recordStep } = useOnboarding();

  return (
    <OnboardingScaffold
      step={1}
      total={4}
      title="What are you rebuilding toward?"
      description="Pick a few. This isn't permanent — priorities can change."
      onContinue={() => {
        recordStep('strengths');
        router.push('/onboarding/strengths');
      }}
      continueDisabled={selected.goalIds.length === 0}
    >
      <View style={styles.chips}>
        {onboardingOptions.goals.map((option) => (
          <ChipToggle
            key={option.id}
            label={option.label}
            selected={selected.goalIds.includes(option.id)}
            onPress={() => toggleGoal(option.id)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
