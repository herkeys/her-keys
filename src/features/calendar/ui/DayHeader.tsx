import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, Overline } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import { COPY } from '../copy';
import { formatDayTitle, formatWeekRange, relativeDayLabel } from '../format';
import type { CalendarView } from '../model/presentation';
import { weekOf } from '../model/timeFrame';

/**
 * Where she is looking, and how to move. Navigation is deliberate: press to step a day (or a week), a
 * way back to today, and a Day/Week switch. There is no drag interaction anywhere in Calendar.
 */
export function DayNavigator({
  date,
  today,
  view,
  onStep,
  onToday,
}: {
  date: LocalDate;
  today: LocalDate;
  view: CalendarView;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
}) {
  const week = view === 'week';
  const inThisPeriod = week ? weekOf(date).includes(today) : date === today;
  return (
    <View style={styles.wrap}>
      <Overline>{week ? (inThisPeriod ? 'This week' : 'Week') : relativeDayLabel(date, today)}</Overline>
      <AppText variant="screenTitle" accessibilityRole="header" style={styles.title}>
        {week ? formatWeekRange(weekOf(date)) : formatDayTitle(date)}
      </AppText>
      <View style={styles.row}>
        <Button label={week ? COPY.previousWeek : COPY.previousDay} variant="secondary" size="sm" onPress={() => onStep(-1)} />
        <Button label={week ? COPY.nextWeek : COPY.nextDay} variant="secondary" size="sm" onPress={() => onStep(1)} />
        {inThisPeriod ? null : <Button label={COPY.today} variant="ghost" size="sm" onPress={onToday} />}
      </View>
    </View>
  );
}

export function ViewSwitch({ view, onChange }: { view: CalendarView; onChange: (view: CalendarView) => void }) {
  return (
    <View style={styles.switch} accessibilityRole="tablist">
      <ChipToggle label={COPY.dayView} selected={view === 'day'} onPress={() => onChange('day')} />
      <ChipToggle label={COPY.weekView} selected={view === 'week'} onPress={() => onChange('week')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  title: { marginTop: spacing.xs, marginBottom: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switch: { flexDirection: 'row', marginBottom: spacing.lg },
});
