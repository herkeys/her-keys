import type { LocalReminderPlan } from './localReminderPlan';

export const HER_KEYS_REMINDER_OWNER = 'herkeys-local-reminders';

export interface ReminderData {
  owner?: unknown;
  kind?: unknown;
  url?: unknown;
  planKey?: unknown;
  triggerAtMs?: unknown;
  targetDate?: unknown;
}

export function isHerKeysReminderData(data: ReminderData | null | undefined): boolean {
  return data?.owner === HER_KEYS_REMINDER_OWNER;
}

export function reminderDataMatchesPlan(data: ReminderData | null | undefined, plan: LocalReminderPlan): boolean {
  return (
    isHerKeysReminderData(data) &&
    data?.kind === plan.kind &&
    data?.url === plan.url &&
    data?.planKey === plan.planKey &&
    data?.triggerAtMs === plan.triggerAtMs &&
    data?.targetDate === plan.targetDate
  );
}

export function routeFromHerKeysReminderData(data: ReminderData | null | undefined): '/today' | null {
  return isHerKeysReminderData(data) && data?.url === '/today' ? '/today' : null;
}
