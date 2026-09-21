import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { categoriesInOrder } from '../../../domain/categories';
import { weekdayOf, parseLocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { useAppStore, useHouseholdState, useStoreSnapshot } from '../../../store/AppStateProvider';
import {
  DEFAULT_SCHEDULE,
  draftFromState,
  hasUnauthorableRule,
  newDraft,
  validateDraft,
  type DraftBase,
  type DraftIssue,
  type DraftSchedule,
  type DraftStep,
  type ScheduleMode,
  type SystemDraft,
} from '../commands/draft';
import { resolveAnchor } from '../commands/schedule';
import { MAX_STEPS_PER_SYSTEM } from '../commands/stepOrder';
import { parseClock, formatClock } from '../format';
import { systemFingerprint } from '../model/fingerprint';
import { liveRuleFor, previewOccurrences } from '../model/schedule';
import type { ScheduleFrequency } from '../model/types';
import { saveSystemDraft } from '../useCases/commit';

/**
 * The System editor's state.
 *
 * EVERYTHING here is presentation state until `save()` runs. Typing, adding a step and reordering
 * change only this hook's memory; the store is not touched and nothing reaches storage (Scenario W).
 * A restart drops an unsaved draft and leaves the saved System exactly as it was (Scenario Z) — the
 * application has no draft persistence and this does not invent any.
 *
 * Numbers she types are held as TEXT (so half-typed input is never fought), and turned into numbers
 * — or into `NaN`, which validation refuses — as she types.
 */

export type EditorStatus = 'editing' | 'saving' | 'missing';

interface Texts {
  minutes: Record<string, string>;
  interval: string;
  monthDay: string;
  time: string;
}

const WHOLE = /^\d+$/;
const toWhole = (text: string): number | null => (text.trim() === '' ? null : WHOLE.test(text.trim()) ? Number(text.trim()) : Number.NaN);

function textsOf(draft: SystemDraft): Texts {
  const s = draft.schedule;
  return {
    minutes: Object.fromEntries(draft.steps.map((step) => [step.key, step.effortMinutes === null ? '' : String(step.effortMinutes)])),
    interval: s === null ? '1' : String(s.interval),
    monthDay: s?.byMonthDay == null ? '' : String(s.byMonthDay),
    time: s?.timeOfDayMinutes == null ? '' : formatClock(s.timeOfDayMinutes),
  };
}

/** Distinct, alphanumeric, short: it becomes part of a new step's canonical id. */
const makeKeyFactory = () => {
  let n = 0;
  return () => `k${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

export function useSystemEditor(systemId: string | undefined) {
  const store = useAppStore();
  const { state, today } = useHouseholdState();
  const { persistence } = useStoreSnapshot();
  const nextKey = useRef(makeKeyFactory()).current;

  const open = useCallback((): { draft: SystemDraft; base: DraftBase } | null => {
    if (systemId !== undefined) return draftFromState(state, systemId, nextKey);
    const home = categoriesInOrder(state).find((category) => category.systemRole === 'home')?.id ?? null;
    // a fresh System id, chosen once when the editor opens: it is what makes a double submit a single System
    const id = `sys-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return newDraft(state, id, home);
  }, [state, systemId, nextKey]);

  const [session, setSession] = useState(open);
  const [texts, setTexts] = useState<Texts>(() => (session === null ? { minutes: {}, interval: '1', monthDay: '', time: '' } : textsOf(session.draft)));
  const [status, setStatus] = useState<EditorStatus>(session === null ? 'missing' : 'editing');
  const [showIssues, setShowIssues] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const draft = session?.draft ?? null;
  const base = session?.base ?? null;

  const update = useCallback((change: (current: SystemDraft) => SystemDraft) => {
    setSession((current) => (current === null ? current : { ...current, draft: change(current.draft) }));
    setSaveError(null);
  }, []);

  // ---- has canonical state moved underneath this editor?
  const stale = useMemo(
    () => session !== null && !session.draft.isNew && session.base.fingerprint !== systemFingerprint(state, session.draft.systemId),
    [session, state]
  );

  const issues: DraftIssue[] = useMemo(() => (draft === null ? [] : validateDraft(state, draft)), [state, draft]);

  // ---- steps
  const setTitle = (key: string, title: string) => update((d) => ({ ...d, steps: d.steps.map((s) => (s.key === key ? { ...s, title } : s)) }));
  const setMinutes = (key: string, text: string) => {
    setTexts((t) => ({ ...t, minutes: { ...t.minutes, [key]: text } }));
    update((d) => ({ ...d, steps: d.steps.map((s) => (s.key === key ? { ...s, effortMinutes: toWhole(text) } : s)) }));
  };
  const addStep = () => {
    const key = nextKey();
    setTexts((t) => ({ ...t, minutes: { ...t.minutes, [key]: '' } }));
    update((d) => (d.steps.length >= MAX_STEPS_PER_SYSTEM ? d : { ...d, steps: [...d.steps, { key, id: null, title: '', effortMinutes: null } as DraftStep] }));
  };
  /** Only a step added in THIS draft can be dropped. An existing step cannot be removed: there is no retire semantic. */
  const removeNewStep = (key: string) => update((d) => ({ ...d, steps: d.steps.filter((s) => !(s.key === key && s.id === null)) }));
  const moveStep = (key: string, by: -1 | 1) =>
    update((d) => {
      const from = d.steps.findIndex((s) => s.key === key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[from], steps[to]] = [steps[to], steps[from]];
      return { ...d, steps };
    });

  // ---- schedule
  const setMode = (mode: ScheduleMode) =>
    update((d) => {
      if (mode === 'calendar' && d.schedule === null) {
        // an explicit, visible default: weekly, on today's weekday
        return { ...d, scheduleMode: mode, schedule: { ...DEFAULT_SCHEDULE, byWeekday: [weekdayOf(today)] } };
      }
      return { ...d, scheduleMode: mode, schedule: mode === 'calendar' ? d.schedule : null };
    });
  const patchSchedule = (patch: Partial<DraftSchedule>) => update((d) => (d.schedule === null ? d : { ...d, schedule: { ...d.schedule, ...patch } }));
  const setFrequency = (frequency: ScheduleFrequency) =>
    patchSchedule({
      frequency,
      byWeekday: frequency === 'weekly' ? [weekdayOf(today)] : null,
      byMonthDay: frequency === 'monthly' ? parseLocalDate(today).day : null,
    });
  const setIntervalText = (text: string) => {
    setTexts((t) => ({ ...t, interval: text }));
    patchSchedule({ interval: toWhole(text) ?? Number.NaN });
  };
  const toggleWeekday = (day: number) =>
    update((d) => {
      if (d.schedule === null) return d;
      const current = d.schedule.byWeekday ?? [];
      const next = current.includes(day) ? current.filter((x) => x !== day) : [...current, day];
      return { ...d, schedule: { ...d.schedule, byWeekday: next.sort((a, b) => a - b) } };
    });
  const setMonthDayText = (text: string) => {
    setTexts((t) => ({ ...t, monthDay: text }));
    patchSchedule({ byMonthDay: toWhole(text) });
  };
  const setTimeText = (text: string) => {
    setTexts((t) => ({ ...t, time: text }));
    patchSchedule({ timeOfDayMinutes: text.trim() === '' ? null : (parseClock(text) ?? Number.NaN) });
  };
  const switchToCalendar = () => setMode('calendar');

  // ---- the preview: the SAME anchor rule the save uses, so what she sees is what will be derived
  const preview = useMemo(() => {
    if (draft === null || draft.scheduleMode !== 'calendar' || draft.schedule === null) return null;
    if (issues.some((issue) => issue.field === 'schedule')) return null;
    const live = liveRuleFor(state as AppState, draft.systemId);
    const anchorDate = resolveAnchor(live, draft.schedule, today);
    return previewOccurrences(
      state,
      {
        trigger: 'schedule',
        frequency: draft.schedule.frequency,
        interval: draft.schedule.interval,
        byWeekday: draft.schedule.byWeekday,
        byMonthDay: draft.schedule.byMonthDay,
        anchorDate,
        endsOn: live?.endsOn ?? null,
        occurrenceCount: live?.occurrenceCount ?? null,
      },
      draft.systemId,
      today
    );
  }, [draft, issues, state, today]);

  const hasOtherRule = draft !== null && !draft.isNew && hasUnauthorableRule(state, draft.systemId);

  // ---- save / reload
  const save = async () => {
    if (draft === null || base === null || inFlight.current || persistence === 'disabled') return;
    setShowIssues(true);
    if (issues.length > 0) return;
    inFlight.current = true;
    setStatus('saving');
    setSaveError(null);
    const result = await saveSystemDraft(store, draft, base);
    inFlight.current = false;
    setStatus('editing');
    switch (result.kind) {
      case 'saved':
      case 'already_saved':
        router.back();
        return;
      case 'stale':
        // the banner is driven by `stale`, recomputed from state; nothing more to say
        return;
      case 'missing':
        setStatus('missing');
        return;
      case 'invalid':
        setShowIssues(true);
        return;
      case 'not_saved':
        setSaveError('not_saved');
    }
  };

  const reload = () => {
    const fresh = open();
    setSession(fresh);
    setTexts(fresh === null ? { minutes: {}, interval: '1', monthDay: '', time: '' } : textsOf(fresh.draft));
    setStatus(fresh === null ? 'missing' : 'editing');
    setShowIssues(false);
    setSaveError(null);
  };

  return {
    draft,
    texts,
    status,
    issues,
    showIssues,
    saveError,
    stale,
    preview,
    today,
    saveDisabled: persistence === 'disabled',
    hasOtherRule,
    categories: categoriesInOrder(state),
    stepNumber: (key: string): number | null => {
      const index = draft?.steps.findIndex((s) => s.key === key) ?? -1;
      return index < 0 ? null : index + 1;
    },
    actions: {
      setName: (name: string) => update((d) => ({ ...d, name })),
      setPurpose: (purpose: string) => update((d) => ({ ...d, purpose })),
      setCategory: (categoryId: string) => update((d) => ({ ...d, categoryId })),
      setTitle,
      setMinutes,
      addStep,
      removeNewStep,
      moveStep,
      setMode,
      setFrequency,
      setIntervalText,
      toggleWeekday,
      setMonthDayText,
      setTimeText,
      switchToCalendar,
      save,
      reload,
    },
  };
}
