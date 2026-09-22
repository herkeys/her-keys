import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Divider, InlineNotice, LoadingState, Overline, StatusList } from '../../design/components';
import { colors, sizing, spacing } from '../../design/tokens';
import { MEAL_COPY, SLOT_LABEL, moreLater, moreTasks } from './mealCopy';
import { shortDate } from './mealDates';
import type { MealsGate } from './mealsGate';
import type { MealDayView, MealEntryView, MealsView } from './mealsView';

export interface MealsBodyProps {
  gate: MealsGate;
  view: MealsView;
  /** One quiet line after something was saved or removed. */
  flash: string | null;
  onAddMeal: () => void;
  onOpenEntry: (entryId: string) => void;
  onPlanAgain: (sourceId: string) => void;
  onAddTask: () => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * The Meals hub, drawn from the projection and nothing else. Sections that have nothing to show are not drawn (adaptive density),
 * and a blank day is never drawn as a gap: there is no count, colour or wording that treats an empty day as a problem.
 */
export function MealsBody({ gate, view, flash, onAddMeal, onOpenEntry, onPlanAgain, onAddTask, onOpenTask }: MealsBodyProps) {
  if (gate.state === 'loading') return <LoadingState label={MEAL_COPY.loading} />;
  if (gate.state === 'recovery') return <InlineNotice tone="attention" title={MEAL_COPY.recoveryTitle} body={MEAL_COPY.recoveryBody} />;

  const canAdd = gate.canWrite && view.context === 'ok';
  return (
    <View style={styles.root}>
      {view.context === 'no-meals-context' ? <InlineNotice tone="info" title={MEAL_COPY.unavailableTitle} body={MEAL_COPY.unavailableBody} /> : null}
      {!gate.canWrite ? <InlineNotice tone="waiting" title={MEAL_COPY.readOnlyNotice} /> : null}
      {flash ? (
        <View accessibilityLiveRegion="polite">
          <AppText variant="supporting" color={colors.textSecondary}>
            {flash}
          </AppText>
        </View>
      ) : null}

      <Button label={MEAL_COPY.addMeal} onPress={onAddMeal} disabled={!canAdd} />

      {view.hasPlannedMeals ? (
        <Section title={MEAL_COPY.sectionUpNext}>
          {view.upNext.map((day) => (
            <DayGroup key={day.date} day={day} onOpenEntry={onOpenEntry} showBlank />
          ))}
        </Section>
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          {MEAL_COPY.noMealsYet}
        </AppText>
      )}

      {view.nextDays.length > 0 ? (
        <Section title={MEAL_COPY.sectionNextDays}>
          {view.nextDays.map((day) => (
            <DayGroup key={day.date} day={day} onOpenEntry={onOpenEntry} />
          ))}
        </Section>
      ) : null}

      {view.later.entries.length > 0 ? (
        <Section title={MEAL_COPY.sectionLater}>
          <Card>
            {view.later.entries.map((entry, index) => (
              <View key={entry.mealPlanEntryId}>
                {index > 0 ? <Divider tight /> : null}
                <EntryRow entry={entry} onPress={() => onOpenEntry(entry.mealPlanEntryId)} caption={shortDate(entry.logicalDate)} />
              </View>
            ))}
          </Card>
          {view.later.moreCount > 0 ? (
            <AppText variant="supporting" color={colors.textSecondary}>
              {moreLater(view.later.moreCount)}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      {view.planAgain.length > 0 ? (
        <Section title={MEAL_COPY.sectionPlanAgain}>
          <StatusList
            items={view.planAgain.map((item) => ({
              key: item.sourceId,
              label: item.title,
              value: item.slot === 'unspecified' ? `Planned ${shortDate(item.lastPlannedOn)}` : `${SLOT_LABEL[item.slot]} · planned ${shortDate(item.lastPlannedOn)}`,
              onPress: () => onPlanAgain(item.sourceId),
            }))}
          />
        </Section>
      ) : null}

      <Section title={MEAL_COPY.sectionTasks}>
        {view.mealTasks.length > 0 ? (
          <StatusList
            items={view.mealTasks.map((task) => ({
              key: task.taskId,
              label: task.title,
              value: task.responsibility ? `${task.standingText} · ${task.responsibility.text}` : task.standingText,
              needsAttention: task.needsAttention,
              onPress: () => onOpenTask(task.taskId),
            }))}
          />
        ) : (
          <AppText variant="body" color={colors.textSecondary}>
            {MEAL_COPY.noMealTasks}
          </AppText>
        )}
        {view.mealTasksMoreCount > 0 ? (
          <AppText variant="supporting" color={colors.textSecondary}>
            {moreTasks(view.mealTasksMoreCount)}
          </AppText>
        ) : null}
        <Button label={MEAL_COPY.addTask} variant="ghost" size="sm" onPress={onAddTask} disabled={!canAdd} style={styles.addTask} />
      </Section>

      {view.recurringWork.length > 0 ? (
        <Section title={MEAL_COPY.sectionRecurring}>
          <StatusList
            items={view.recurringWork.map((item) => ({
              key: `${item.kind}:${item.id}`,
              label: item.title,
              value: [item.cadence, item.next === null ? null : `next ${shortDate(item.next)}`].filter((part): part is string => part !== null).join(' · ') || 'Routine',
            }))}
          />
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Overline>{title}</Overline>
      {children}
    </View>
  );
}

function DayGroup({ day, onOpenEntry, showBlank = false }: { day: MealDayView; onOpenEntry: (id: string) => void; showBlank?: boolean }) {
  return (
    <View style={styles.dayGroup}>
      <AppText variant="bodyStrong" accessibilityRole="header" accessibilityLabel={day.longLabel}>
        {day.label}
      </AppText>
      {day.entries.length === 0 ? (
        showBlank ? (
          <AppText variant="supporting" color={colors.textTertiary}>
            {MEAL_COPY.noMealsDay}
          </AppText>
        ) : null
      ) : (
        <Card>
          {day.entries.map((entry, index) => (
            <View key={entry.mealPlanEntryId}>
              {index > 0 ? <Divider tight /> : null}
              <EntryRow entry={entry} onPress={() => onOpenEntry(entry.mealPlanEntryId)} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function EntryRow({ entry, onPress, caption }: { entry: MealEntryView; onPress: () => void; caption?: string }) {
  const second = [caption, entry.subtitle].filter((part): part is string => Boolean(part)).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={entry.a11yLabel} accessibilityHint={MEAL_COPY.openHint} style={styles.row}>
      <AppText variant="bodyStrong">{entry.title}</AppText>
      {second ? (
        <AppText variant="supporting" color={colors.textSecondary}>
          {second}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  section: { gap: spacing.md },
  dayGroup: { gap: spacing.sm },
  row: { minHeight: sizing.minTouchTarget, justifyContent: 'center', paddingVertical: spacing.sm },
  addTask: { alignSelf: 'flex-start' },
});
