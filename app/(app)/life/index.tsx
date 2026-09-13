import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen, StatusList } from '../../../src/design/components';
import { colors, spacing } from '../../../src/design/tokens';
import { deriveLifeStatus } from '../../../src/features/life/lifeStatus';
import { useSchedule } from '../../../src/store/ScheduleContext';

export default function LifeHub() {
  const { events, tasks } = useSchedule();
  const statuses = deriveLifeStatus(events, tasks);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Life</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          Five areas, one picture. Everything here is what Her Keys reads when it looks at your day.
        </AppText>
      </View>

      <Overline style={styles.sectionLabel}>Where things stand</Overline>
      <StatusList
        items={statuses.map((s) => ({
          key: s.key,
          label: s.label,
          value: s.value,
          needsAttention: s.needsAttention,
          onPress: () => router.push(s.route),
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.md },
});
