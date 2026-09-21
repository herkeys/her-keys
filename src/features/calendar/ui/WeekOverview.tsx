import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../../design/components';
import { colors, interaction, sizing, spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import { COPY, weekDayLabel, weekDayLines } from '../copy';
import { formatDayNumber, formatWeekdayShort } from '../format';
import type { CalendarWeekViewModel, WeekDaySummary } from '../model/types';

/**
 * The week, compared CATEGORICALLY. Each day shows the same capacity word the day view uses, the kinds of
 * conflict present, how much flexible work has no time yet, and whether facts were missing. Days appear in
 * calendar order with equal weight — nothing is scored, ranked, sorted by quality or colored as a heat map.
 * She compares words; pressing a day opens it.
 */
export function WeekOverview({ week, today, onSelectDay }: { week: CalendarWeekViewModel; today: LocalDate; onSelectDay: (date: LocalDate) => void }) {
  return (
    <View accessibilityRole="list" accessibilityLabel={COPY.weekView}>
      {week.days.map((day, index) => (
        <WeekDayRow key={day.date} day={day} isToday={day.date === today} last={index === week.days.length - 1} onPress={() => onSelectDay(day.date)} />
      ))}
    </View>
  );
}

export function WeekDayRow({ day, isToday, last, onPress }: { day: WeekDaySummary; isToday: boolean; last: boolean; onPress: () => void }) {
  const { word, lines } = weekDayLines(day);
  const label = `${weekDayLabel(day)}${isToday ? ', today' : ''}${day.isSelected ? ', currently open' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: day.isSelected }}
      accessibilityLabel={label}
      accessibilityHint={COPY.hintOpenDay}
      style={({ pressed }) => [styles.row, last ? null : styles.divider, pressed ? styles.pressed : null]}
    >
      <View style={styles.date}>
        <AppText variant="metadata" color={colors.textSecondary}>
          {formatWeekdayShort(day.date)}
        </AppText>
        <AppText variant="cardTitle">{formatDayNumber(day.date)}</AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" color={day.dayMode === 'past' ? colors.textSecondary : colors.textPrimary}>
          {word}
        </AppText>
        {lines.map((line) => (
          <AppText key={line} variant="metadata" color={colors.textSecondary} style={styles.line}>
            {line}
          </AppText>
        ))}
        {isToday || day.isSelected ? (
          <AppText variant="metadata" color={colors.textSecondary} style={styles.line}>
            {[isToday ? 'Today' : null, day.isSelected ? 'Viewing' : null].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, minHeight: sizing.minTouchTarget + spacing.md, paddingVertical: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  pressed: { opacity: interaction.pressedOpacity },
  date: { width: 44, alignItems: 'center' },
  body: { flex: 1 },
  line: { marginTop: spacing.xxs },
});
