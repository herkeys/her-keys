import { StyleSheet, View } from 'react-native';
import { AppText, Overline } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { TodayReady } from './model';
import { PersistenceNotice } from './PersistenceNotice';
import { SyncNotice } from './SyncNotice';

/**
 * Orientation: which day this is — the household's logical day, never the device's —
 * who it is for, and one sentence on what the day is. The two notices are the shell's own
 * runtime affordance, kept where they were; Today builds no sync surface of its own.
 */
export function TodayHeader({ view }: { view: TodayReady }) {
  return (
    <View style={styles.header}>
      <Overline>{`Today · ${view.day.label}`}</Overline>
      <AppText variant="display" accessibilityRole="header" style={styles.greeting}>
        {view.greeting ? `Hi, ${view.greeting}` : 'Hi there'}
      </AppText>
      <AppText variant="sectionTitle" color={color.text.secondary} style={styles.headline}>
        {view.headline}
      </AppText>
      <PersistenceNotice />
      <SyncNotice />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  greeting: { marginTop: spacing.sm },
  headline: { marginTop: spacing.sm },
});
