import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { LocalDate } from '../../domain/logicalDay';
import {
  addMeal, addMealTask, archiveMeal, checkMealTitle, mealDraftFrom, snapshotOfMeal, updateMeal, type MealRefusal, type MealSnapshot,
} from '../../domain/meals';
import type { MealPlanEntry } from '../../domain/state';
import { useAccount } from '../../store/AccountProvider';
import { useAppStore, useHouseholdState, useStoreSnapshot } from '../../store/AppStateProvider';
import { PersistenceNotice } from '../today/PersistenceNotice';
import { SyncNotice } from '../today/SyncNotice';
import { newDraftId } from './draftId';
import { MEAL_COPY } from './mealCopy';
import { MealSheet, type MealSheetValues } from './MealSheet';
import { MealTaskSheet, type MealTaskSheetValues } from './MealTaskSheet';
import { MealsBody } from './MealsBody';
import { mealsGate } from './mealsGate';
import { buildMealsView } from './mealsView';

/**
 * The Meals screen: her meal decisions and the work she chose to track for them. It reads the projection and writes through the
 * canonical store and the meal domain actions, and nothing else: no direct network call, no queue of its own. Navigation is passed
 * in, so this component holds no router.
 */

type SheetState =
  | { kind: 'meal'; mode: 'create' | 'again'; initial: MealSheetValues; draftId: string }
  | { kind: 'edit'; entryId: string; expected: MealSnapshot }
  | { kind: 'task'; proposedDate: LocalDate | null; draftId: string };

const valuesOf = (meal: Pick<MealPlanEntry, 'title' | 'date' | 'slot'>): MealSheetValues => ({ title: meal.title, date: meal.date, slot: meal.slot });

function refusalCopy(refusal: MealRefusal, title: string): string {
  switch (refusal) {
    case 'invalid-title': {
      const checked = checkMealTitle(title);
      return !checked.ok && checked.problem === 'too-long' ? MEAL_COPY.errTooLong : MEAL_COPY.errBlank;
    }
    case 'invalid-date':
      return MEAL_COPY.errDate;
    case 'plan-full':
      return MEAL_COPY.errFull;
    case 'no-meals-context':
      return MEAL_COPY.errUnavailable;
    case 'stale':
      return MEAL_COPY.errStale;
    default:
      return MEAL_COPY.errSave;
  }
}

export function MealsOverview({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { state, today } = useHouseholdState();
  const snapshot = useStoreSnapshot();
  const { syncNamespace } = useAccount();
  const store = useAppStore();

  const gate = mealsGate({ storeStatus: snapshot.status, persistence: snapshot.persistence, syncHydration: syncNamespace?.hydration ?? null });
  const view = useMemo(() => buildMealsView(state, today, Date.now()), [state, today]);

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closeSheet = () => {
    setSheet(null);
    setNotice(null);
  };
  const openMeal = (mode: 'create' | 'again', initial: MealSheetValues) => {
    setNotice(null);
    setFlash(null);
    setSheet({ kind: 'meal', mode, initial, draftId: newDraftId('meal') });
  };
  const openTaskSheet = (proposedDate: LocalDate | null) => {
    setNotice(null);
    setFlash(null);
    setSheet({ kind: 'task', proposedDate, draftId: newDraftId('task') });
  };
  const entryById = (id: string) => state.meals.find((meal) => meal.id === id) ?? null;

  /** A refusal that left the sheet open: say why, and if the meal changed underneath the editor, show its latest version. */
  const explain = (refusal: MealRefusal, title: string) => {
    if (refusal === 'archived' || refusal === 'not-found') {
      closeSheet();
      setFlash(MEAL_COPY.errGone);
      return;
    }
    setNotice(refusalCopy(refusal, title));
    if (refusal === 'stale' && sheet?.kind === 'edit') {
      const current = store.getSnapshot().state?.meals.find((meal) => meal.id === sheet.entryId);
      if (current) setSheet({ ...sheet, expected: snapshotOfMeal(current) });
    }
  };

  const submitMeal = async (values: MealSheetValues) => {
    if (sheet === null || sheet.kind === 'task' || busy) return;
    setBusy(true);
    try {
      const outcome: { refusal: MealRefusal | null } = { refusal: null };
      const saved = await store.commit((current, ctx) => {
        const result =
          sheet.kind === 'edit'
            ? updateMeal(current, ctx, sheet.entryId, { title: values.title, date: values.date, slot: values.slot }, sheet.expected)
            : addMeal(current, ctx, { title: values.title, date: values.date, slot: values.slot, id: sheet.draftId });
        outcome.refusal = result.refusal;
        return result.state;
      });
      if (!saved) return setNotice(MEAL_COPY.errSave);
      // `exists` is a repeat of a save that already happened: it is a success, not an error.
      if (outcome.refusal === null || outcome.refusal === 'exists') {
        closeSheet();
        setFlash(null);
        return;
      }
      explain(outcome.refusal, values.title);
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async () => {
    if (sheet === null || sheet.kind !== 'edit' || busy) return;
    setBusy(true);
    try {
      const outcome: { refusal: MealRefusal | null } = { refusal: null };
      const saved = await store.commit((current, ctx) => {
        const result = archiveMeal(current, ctx, sheet.entryId, sheet.expected);
        outcome.refusal = result.refusal;
        return result.state;
      });
      if (!saved) return setNotice(MEAL_COPY.errSave);
      if (outcome.refusal === null) {
        closeSheet();
        setFlash(MEAL_COPY.removed);
        return;
      }
      explain(outcome.refusal, '');
    } finally {
      setBusy(false);
    }
  };

  const submitTask = async (values: MealTaskSheetValues) => {
    if (sheet === null || sheet.kind !== 'task' || busy) return;
    setBusy(true);
    try {
      const outcome: { refusal: string | null } = { refusal: null };
      const saved = await store.commit((current, ctx) => {
        const result = addMealTask(current, ctx, { title: values.title, minutes: values.minutes, due: values.due, id: sheet.draftId });
        outcome.refusal = result.refusal;
        return result.state;
      });
      if (!saved) return setNotice(MEAL_COPY.errSave);
      if (outcome.refusal === null || outcome.refusal === 'exists') {
        closeSheet();
        setFlash(MEAL_COPY.taskAdded);
        return;
      }
      setNotice(
        outcome.refusal === 'invalid-title' ? MEAL_COPY.errTaskBlank : outcome.refusal === 'invalid-minutes' ? MEAL_COPY.errMinutes : outcome.refusal === 'no-meals-context' ? MEAL_COPY.errUnavailable : MEAL_COPY.errSave,
      );
    } finally {
      setBusy(false);
    }
  };

  const editing = sheet?.kind === 'edit' ? entryById(sheet.entryId) : null;

  return (
    <View>
      <PersistenceNotice />
      <SyncNotice />
      <MealsBody
        gate={gate}
        view={view}
        flash={flash}
        onAddMeal={() => openMeal('create', { title: '', date: today, slot: 'unspecified' })}
        onOpenEntry={(id) => {
          const entry = entryById(id);
          if (entry) {
            setNotice(null);
            setFlash(null);
            setSheet({ kind: 'edit', entryId: id, expected: snapshotOfMeal(entry) });
          }
        }}
        onPlanAgain={(sourceId) => {
          const source = entryById(sourceId);
          if (source) openMeal('again', mealDraftFrom(source, today));
        }}
        onAddTask={() => openTaskSheet(null)}
        onOpenTask={onOpenTask}
      />

      {sheet?.kind === 'meal' ? (
        <MealSheet key={`${sheet.mode}:${sheet.draftId}`} visible mode={sheet.mode} initial={sheet.initial} today={today} notice={notice} busy={busy} canWrite={gate.canWrite} onSubmit={submitMeal} onClose={closeSheet} />
      ) : null}

      {sheet?.kind === 'edit' ? (
        <MealSheet
          key={`edit:${sheet.entryId}:${sheet.expected.title}:${sheet.expected.date}:${sheet.expected.slot}`}
          visible
          mode="edit"
          initial={valuesOf(sheet.expected)}
          today={today}
          notice={notice}
          busy={busy}
          canWrite={gate.canWrite}
          onSubmit={submitMeal}
          onClose={closeSheet}
          onRemove={removeEntry}
          onPlanAgain={editing ? () => openMeal('again', mealDraftFrom(editing, today)) : undefined}
          onAddTask={editing ? () => openTaskSheet(editing.date) : undefined}
        />
      ) : null}

      {sheet?.kind === 'task' ? (
        <MealTaskSheet key={sheet.draftId} visible proposedDate={sheet.proposedDate} notice={notice} busy={busy} canWrite={gate.canWrite} onSubmit={submitTask} onClose={closeSheet} />
      ) : null}
    </View>
  );
}
