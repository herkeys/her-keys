import { categoryWithRole } from '../../domain/categories';
import type { RecurrenceRule } from '../../domain/foundation/structure';
import type { LocalDate } from '../../domain/logicalDay';
import type { AppState } from '../../domain/state';
import { nextOccurrence } from '../../domain/structure';
import { weekdayNameOfIndex } from './mealDates';

/**
 * RECURRING MEAL WORK: canonical recurring TASKS and Systems that sit in the Meals category, shown read-only.
 *
 * It is NOT a claim that any meal repeats. A meal decision has no recurrence: "Tacos" on three Tuesdays is three separate
 * entries and nothing here says otherwise. A recurrence rule about a `meal` is ignored on purpose (its only exception path
 * records a skipped meal). Feature 08 creates no recurrence and no System; that belongs to Systems. At the baseline nothing
 * writes either, so this is normally empty, and the screen hides the section when it is.
 */

export interface RecurringWorkView {
  kind: 'task' | 'system';
  id: string;
  title: string;
  /** Said from the rule alone ("Every Tuesday"); null when the item has no active rule. */
  cadence: string | null;
  /** DERIVED from the rule, never stored. */
  next: LocalDate | null;
}

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function ordinal(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`;
}

/** The cadence in words, only as far as the rule states it. */
export function cadenceText(rule: Pick<RecurrenceRule, 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay'>): string | null {
  if (rule.trigger === 'manual') return 'Repeats when you ask for it';
  if (rule.trigger === 'after_completion') return 'Repeats after each time it’s done';
  const every = (unit: string) => (rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`);
  switch (rule.frequency) {
    case 'daily':
      return every('day');
    case 'weekly': {
      const days = [...(rule.byWeekday ?? [])].sort((a, b) => a - b).map(weekdayNameOfIndex);
      if (days.length === 0) return every('week');
      return rule.interval === 1 ? `Every ${joinNames(days)}` : `${every('week')} on ${joinNames(days)}`;
    }
    case 'monthly':
      return rule.byMonthDay === null ? every('month') : `${every('month')} on the ${ordinal(rule.byMonthDay)}`;
    case 'yearly':
      return every('year');
    default:
      return null;
  }
}

export function recurringMealWork(state: AppState, today: LocalDate): RecurringWorkView[] {
  const context = categoryWithRole(state, 'meals');
  if (context === null) return [];

  const activeRuleFor = (kind: 'task' | 'system', id: string) =>
    state.recurrences.find((rule) => rule.status === 'active' && rule.about.kind === kind && rule.about.id === id) ?? null;

  const items: RecurringWorkView[] = [];
  for (const task of state.tasks) {
    if (task.status !== 'open' || task.categoryId !== context.id) continue;
    const rule = activeRuleFor('task', task.id);
    if (rule === null) continue;
    items.push({ kind: 'task', id: task.id, title: task.title, cadence: cadenceText(rule), next: nextOccurrence(state, rule, today) });
  }
  for (const system of state.systems) {
    if (system.categoryId !== context.id) continue;
    const rule = activeRuleFor('system', system.id);
    items.push({ kind: 'system', id: system.id, title: system.name, cadence: rule === null ? null : cadenceText(rule), next: rule === null ? null : nextOccurrence(state, rule, today) });
  }
  return items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
