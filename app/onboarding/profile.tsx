import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Screen, Tag } from '../../src/design/components';
import { colors, radius, spacing } from '../../src/design/tokens';
import { buildOperatingProfile } from '../../src/features/onboarding/buildOperatingProfile';
import { useOnboarding } from '../../src/store/OnboardingContext';

export default function ProfileResult() {
  const { answers } = useOnboarding();
  const profile = buildOperatingProfile(answers);

  return (
    <Screen>
      <Overline>Life operating profile</Overline>
      <AppText variant="hero" style={styles.title}>
        Here’s what I understand so far.
      </AppText>
      <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
        These are starting hypotheses, not conclusions. Her Keys will adjust every one of them as it sees how your days
        actually go.
      </AppText>

      {profile.insights.length > 0 ? (
        <View style={styles.surface}>
          {profile.insights.map((insight, index) => (
            <View
              key={insight.label}
              style={[styles.insight, index === profile.insights.length - 1 ? null : styles.insightDivider]}
            >
              <View style={styles.insightHeader}>
                <AppText variant="bodyStrong">{insight.label}</AppText>
                <Tag label={insight.confidence} />
              </View>
              <AppText variant="bodySm" color={colors.textSecondary} style={styles.insightDetail}>
                {insight.detail}
              </AppText>
            </View>
          ))}
        </View>
      ) : (
        <Card tone="subtle">
          <AppText variant="body" color={colors.textSecondary}>
            Nothing selected — Her Keys will learn from what you do next instead.
          </AppText>
        </Card>
      )}

      <Card tone="subtle" style={styles.learning}>
        <Overline>Still learning</Overline>
        <AppText variant="body" style={styles.learningText}>
          {profile.stillLearning}
        </AppText>
      </Card>

      <Button label="Show me my day" onPress={() => router.replace('/(app)/today')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.md, marginBottom: spacing.xxl },
  surface: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.xl,
  },
  insight: { paddingVertical: spacing.xl },
  insightDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  insightDetail: { marginTop: spacing.sm },
  learning: { marginTop: spacing.lg, marginBottom: spacing.xxl },
  learningText: { marginTop: spacing.sm },
});
