import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ChipToggle } from '../../src/design/components';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold';
import { useOnboarding } from '../../src/store/OnboardingContext';

const STRUGGLE_OPTIONS = [
  'Overcommitting',
  'Paperwork piling up',
  'Financial avoidance',
  'Last-minute meals',
  'Unrealistic calendars',
  'Becoming frozen when overloaded',
];

export default function StrugglesStep() {
  const { answers, toggleStruggle } = useOnboarding();

  return (
    <OnboardingScaffold
      step={3}
      total={4}
      title="Where does it tend to break down?"
      description="These are starting hypotheses, not permanent labels."
      onContinue={() => router.push('/onboarding/talk-it-out')}
      continueDisabled={answers.struggles.length === 0}
    >
      <View style={styles.chips}>
        {STRUGGLE_OPTIONS.map((struggle) => (
          <ChipToggle
            key={struggle}
            label={struggle}
            selected={answers.struggles.includes(struggle)}
            onPress={() => toggleStruggle(struggle)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
