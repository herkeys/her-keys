import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { TodayReady } from './model';

/**
 * Orientation: which day this is — the household's logical day, never the device's — who it is for,
 * and one sentence on what the day is.
 *
 * `children` is where the shell's own runtime notices sit (the persistence and sync lines). Today builds no
 * sync surface of its own; it only leaves the existing affordance where it always was.
 */
export function TodayHeader({ view, children }: { view: TodayReady; children?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Overline>{`Today · ${view.day.label}`}</Overline>
      <AppText variant="display" accessibilityRole="header" style={styles.greeting}>
        {view.greeting ? `Hi, ${view.greeting}` : 'Hi there'}
      </AppText>
      <AppText variant="sectionTitle" color={color.text.secondary} style={styles.headline}>
        {view.headline}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  greeting: { marginTop: spacing.sm },
  headline: { marginTop: spacing.sm },
});
