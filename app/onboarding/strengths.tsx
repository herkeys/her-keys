import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { onboardingOptions } from '../../src/data/catalog/onboardingOptions';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

export default function StrengthsStep() {
  const { selected, toggleStrength, recordStep } = useOnboarding();

  return (
    <OnboardingScaffold
      step={2}
      total={4}
      title="What's already working?"
      description="Her Keys won't try to fix what isn't broken."
      onContinue={() => {
        recordStep('struggles');
        router.push('/onboarding/struggles');
      }}
      continueDisabled={selected.strengthIds.length === 0}
    >
      <View style={styles.chips}>
        {onboardingOptions.strengths.map((option) => (
          <ChipToggle
            key={option.id}
            label={option.label}
            selected={selected.strengthIds.includes(option.id)}
            onPress={() => toggleStrength(option.id)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
