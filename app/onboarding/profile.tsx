import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AiMark, AppText, Button, Card, Overline, Screen, Tag } from '../../src/design/components';
import { radius, spacing } from '../../src/design/tokens';
import { createThemedStyles, useTheme } from '../../src/design/theme';
import { buildOperatingProfile } from '../../src/features/onboarding/buildOperatingProfile';
import { useOnboarding } from '../../src/store/OnboardingContext';

export default function ProfileResult() {
  const { color, colors } = useTheme();
  const styles = useStyles();
  const { answers, selected, recordStep } = useOnboarding();
  const profile = buildOperatingProfile(answers, selected.struggleIds);

  return (
    <Screen bottomClearance={spacing.xxl}>
      <View style={styles.headerRow}>
        <AiMark kind="understood" />
        <Overline>Life operating profile</Overline>
      </View>
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

      {/* One step left: Her Keys+. Onboarding itself isn't marked complete until that step resolves. */}
      <Button
        label="Continue"
        onPress={() => {
          recordStep('plus');
          router.push('/onboarding/plus');
        }}
      />
    </Screen>
  );
}

const useStyles = createThemedStyles(({ color, colors }) => StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.md, marginBottom: spacing.xxl },
  surface: {
    backgroundColor: colors.surface,
    // An unconfirmed reading of her answers: outlined, not filled — the same dashed language as every other Her Keys reading.
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ai.insightBorder,
    paddingHorizontal: spacing.xl,
  },
  insight: { paddingVertical: spacing.xl },
  insightDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  insightDetail: { marginTop: spacing.sm },
  learning: { marginTop: spacing.lg, marginBottom: spacing.xxl },
  learningText: { marginTop: spacing.sm },
}));
