import { categoriesInOrder } from '../../../domain/categories';
import type { AppState } from '../../../domain/state';
import { systemFingerprint } from '../model/fingerprint';
import { currentRuleFor, liveRuleFor } from '../model/schedule';
import { stepViewsFor } from '../model/steps';
import type { ScheduleFrequency } from '../model/types';
import { MAX_STEPS_PER_SYSTEM } from './stepOrder';

/**
 * The System editor's draft, and the rules a draft must satisfy before it may become canonical.
 *
 * A draft is PRESENTATION state. Typing a name or adding a step writes nothing anywhere: only an
 * explicit save turns a draft into canonical rows (Scenario W). The draft carries the stable
 * identifiers that make a save idempotent — a double-tap or a retry re-applies to the same rows
 * instead of creating a second System or a second copy of a step (Scenario X).
 */

/** Stored bounds, mirrored from the schemas and pinned to them by `draft.test.mjs`. */
export const SYSTEM_LIMITS = {
  name: 120,
  purpose: 500,
  stepTitle: 200,
  stepMinutes: 1440,
  /** `AppStateSchema.systems.max(500)` */
  systems: 500,
  /** `AppStateSchema.systemSteps.max(5000)` */
  steps: 5000,
  interval: 366,
} as const;

export interface DraftStep {
  /** Stable for the life of the draft. A step added in this draft derives its canonical id from it. */
  key: string;
  /** The canonical id when the step already exists; null for a step added in this draft. */
  id: string | null;
  title: string;
  /** null = not known. Never defaulted to 0. */
  effortMinutes: number | null;
}

export interface DraftSchedule {
  frequency: ScheduleFrequency;
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Weekly only. null = the day the schedule starts on. */
  byWeekday: number[] | null;
  /** 1–31. Monthly only. null = the day the schedule starts on. */
  byMonthDay: number | null;
  timeOfDayMinutes: number | null;
}

/**
 *  - `none`     no schedule (an existing live schedule is STOPPED on save; nothing is deleted)
 *  - `calendar` a calendar schedule the foundation can derive dates for
 *  - `keep`     an existing live rule this editor cannot author (after-completion / manual):
 *               left exactly as it is unless she replaces or stops it
 */
export type ScheduleMode = 'none' | 'calendar' | 'keep';

export interface SystemDraft {
  systemId: string;
  isNew: boolean;
  name: string;
  purpose: string;
  categoryId: string;
  steps: DraftStep[];
  scheduleMode: ScheduleMode;
  schedule: DraftSchedule | null;
}

/** What the editor knew when it opened. `null` fingerprint = a System that did not exist yet. */
export interface DraftBase {
  fingerprint: string | null;
}

export type DraftIssueCode =
  | 'name_blank'
  | 'name_too_long'
  | 'purpose_too_long'
  | 'area_missing'
  | 'area_unavailable'
  | 'too_many_steps'
  | 'step_title_blank'
  | 'step_title_too_long'
  | 'step_minutes_invalid'
  | 'system_limit_reached'
  | 'interval_invalid'
  | 'weekday_invalid'
  | 'month_day_invalid'
  | 'time_invalid'
  | 'schedule_missing'
  | 'schedule_ends_before_start'
  | 'identifier_invalid'
  /** The draft leaves out a step that already exists. There is no retire semantic, so a step can only be edited, never dropped. */
  | 'step_removal_unsupported';

export interface DraftIssue {
  code: DraftIssueCode;
  /** `name`, `purpose`, `area`, `steps`, `step:<key>`, `schedule`. */
  field: string;
}

const isWholeNumber = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

export function validateDraft(state: AppState, draft: SystemDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (code: DraftIssueCode, field: string) => issues.push({ code, field });

  const name = draft.name.trim();
  if (name.length === 0) add('name_blank', 'name');
  else if (name.length > SYSTEM_LIMITS.name) add('name_too_long', 'name');
  if (draft.purpose.trim().length > SYSTEM_LIMITS.purpose) add('purpose_too_long', 'purpose');

  const existing = draft.isNew ? null : (state.systems.find((system) => system.id === draft.systemId) ?? null);
  if (draft.categoryId === '') add('area_missing', 'area');
  else if (existing?.categoryId !== draft.categoryId && !categoriesInOrder(state).some((category) => category.id === draft.categoryId)) {
    // an unchanged area is kept even if it has since been archived; a NEW choice must be a live one
    add('area_unavailable', 'area');
  }
  if (draft.isNew && state.systems.length >= SYSTEM_LIMITS.systems) add('system_limit_reached', 'name');

  if (!draft.isNew) {
    const present = new Set(draft.steps.flatMap((step) => (step.id === null ? [] : [step.id])));
    if (state.systemSteps.some((row) => row.systemId === draft.systemId && !present.has(row.id))) add('step_removal_unsupported', 'steps');
  }
  if (draft.steps.length > MAX_STEPS_PER_SYSTEM) add('too_many_steps', 'steps');
  // `AppStateSchema.systemSteps.max(5000)` is household-wide, so the whole household's steps count.
  const otherSteps = state.systemSteps.filter((row) => row.systemId !== draft.systemId).length;
  if (otherSteps + draft.steps.length > SYSTEM_LIMITS.steps) add('too_many_steps', 'steps');
  for (const step of draft.steps) {
    const title = step.title.trim();
    if (title.length === 0) add('step_title_blank', `step:${step.key}`);
    else if (title.length > SYSTEM_LIMITS.stepTitle) add('step_title_too_long', `step:${step.key}`);
    if (step.effortMinutes !== null && !isWholeNumber(step.effortMinutes, 0, SYSTEM_LIMITS.stepMinutes)) add('step_minutes_invalid', `step:${step.key}`);
  }

  if (draft.scheduleMode === 'calendar') {
    const schedule = draft.schedule;
    if (schedule === null) add('schedule_missing', 'schedule');
    else {
      if (!isWholeNumber(schedule.interval, 1, SYSTEM_LIMITS.interval)) add('interval_invalid', 'schedule');
      const weekdaysOk =
        schedule.byWeekday === null ||
        (schedule.frequency === 'weekly' &&
          schedule.byWeekday.length > 0 &&
          new Set(schedule.byWeekday).size === schedule.byWeekday.length &&
          schedule.byWeekday.every((day) => isWholeNumber(day, 0, 6)));
      if (!weekdaysOk) add('weekday_invalid', 'schedule');
      if (schedule.byMonthDay !== null && !(schedule.frequency === 'monthly' && isWholeNumber(schedule.byMonthDay, 1, 31))) add('month_day_invalid', 'schedule');
      if (schedule.timeOfDayMinutes !== null && !isWholeNumber(schedule.timeOfDayMinutes, 0, 1439)) add('time_invalid', 'schedule');
    }
  }
  return issues;
}

/**
 * The draft for editing an EXISTING System, read straight from canonical rows, together with the
 * base version the editor will be checked against at save time.
 */
export function draftFromState(state: AppState, systemId: string, keyFor: (index: number) => string): { draft: SystemDraft; base: DraftBase } | null {
  const system = state.systems.find((row) => row.id === systemId);
  if (!system) return null;

  const live = liveRuleFor(state, systemId);
  const scheduleMode: ScheduleMode = live === null ? 'none' : live.trigger === 'schedule' && live.frequency !== null ? 'calendar' : 'keep';
  const schedule: DraftSchedule | null =
    live !== null && scheduleMode === 'calendar'
      ? {
          frequency: live.frequency as ScheduleFrequency,
          interval: live.interval,
          byWeekday: live.byWeekday === null ? null : [...live.byWeekday].sort((a, b) => a - b),
          byMonthDay: live.byMonthDay,
          timeOfDayMinutes: live.timeOfDayMinutes,
        }
      : null;

  return {
    draft: {
      systemId,
      isNew: false,
      name: system.name,
      purpose: system.description,
      categoryId: system.categoryId,
      steps: stepViewsFor(state, systemId).map((step, index) => ({ key: keyFor(index), id: step.id, title: step.title, effortMinutes: step.effortMinutes })),
      scheduleMode,
      schedule,
    },
    base: { fingerprint: systemFingerprint(state, systemId) },
  };
}

/** A blank draft for a NEW System. The area is a visible default (the household's Home area), never hidden. */
export function newDraft(state: AppState, systemId: string, defaultCategoryId: string | null): { draft: SystemDraft; base: DraftBase } {
  return {
    draft: { systemId, isNew: true, name: '', purpose: '', categoryId: defaultCategoryId ?? categoriesInOrder(state)[0]?.id ?? '', steps: [], scheduleMode: 'none', schedule: null },
    base: { fingerprint: null },
  };
}

/** A schedule the user has not customized: weekly, on the day it starts. */
export const DEFAULT_SCHEDULE: DraftSchedule = { frequency: 'weekly', interval: 1, byWeekday: null, byMonthDay: null, timeOfDayMinutes: null };

/** Does this System currently have a rule the editor cannot author (so leaving it alone is the safe default)? */
export const hasUnauthorableRule = (state: Pick<AppState, 'recurrences'>, systemId: string): boolean => {
  const rule = currentRuleFor(state, systemId);
  return rule !== null && rule.status !== 'ended' && !(rule.trigger === 'schedule' && rule.frequency !== null);
};
