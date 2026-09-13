import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

const STRENGTH_OPTIONS = [
  "Kids' schedules",
  'Cooking',
  'Work deadlines',
  'Home maintenance',
  'Planning ahead',
  'Communication',
];

export default function StrengthsStep() {
  const { answers, toggleStrength } = useOnboarding();

  return (
    <OnboardingScaffold
      step={2}
      total={4}
      title="What's already working?"
      description="Her Keys won't try to fix what isn't broken."
      onContinue={() => router.push('/onboarding/struggles')}
      continueDisabled={answers.strengths.length === 0}
    >
      <View style={styles.chips}>
        {STRENGTH_OPTIONS.map((strength) => (
          <ChipToggle
            key={strength}
            label={strength}
            selected={answers.strengths.includes(strength)}
            onPress={() => toggleStrength(strength)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
