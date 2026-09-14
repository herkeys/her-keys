import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { onboardingOptions } from '../../src/data/catalog/onboardingOptions';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

export default function StrugglesStep() {
  const { selected, toggleStruggle, recordStep } = useOnboarding();

  return (
    <OnboardingScaffold
      step={3}
      total={4}
      title="Where does it tend to break down?"
      description="These are starting hypotheses, not permanent labels."
      onContinue={() => {
        recordStep('talk-it-out');
        router.push('/onboarding/talk-it-out');
      }}
      continueDisabled={selected.struggleIds.length === 0}
    >
      <View style={styles.chips}>
        {onboardingOptions.struggles.map((option) => (
          <ChipToggle
            key={option.id}
            label={option.label}
            selected={selected.struggleIds.includes(option.id)}
            onPress={() => toggleStruggle(option.id)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
