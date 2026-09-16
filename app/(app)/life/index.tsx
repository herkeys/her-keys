import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen, StatusList } from '../../../src/design/components';
import { colors, spacing } from '../../../src/design/tokens';
import { NeedsMeQuickAdd } from '../../../src/features/life/NeedsMeQuickAdd';
import { useLifeStatus } from '../../../src/features/life/useLifeStatus';
import { useHouseholdState } from '../../../src/store/AppStateProvider';

export default function LifeHub() {
  const statuses = useLifeStatus();
  const { state } = useHouseholdState();
  const openNeedsMe = state.needsMe.filter((item) => item.status === 'open');

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Life</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          Five areas, one picture. Everything here is what Her Keys reads when it looks at your day.
        </AppText>
      </View>

      <NeedsMeQuickAdd />

      <Overline style={styles.sectionLabel}>Where things stand</Overline>
      <StatusList
        items={[
          ...statuses.map((s) => ({
            key: s.key,
            label: s.label,
            value: s.value,
            needsAttention: s.needsAttention,
            onPress: () => router.push(s.route),
          })),
          {
            key: 'needs-me',
            label: 'Needs Me',
            value: openNeedsMe.length === 0 ? 'Nothing captured' : `${openNeedsMe.length} captured`,
            onPress: () => router.push('/life/needs-me'),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.md },
});
