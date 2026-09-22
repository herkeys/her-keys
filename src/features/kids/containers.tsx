import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppText, Button, EmptyState, InlineNotice, Overline, StatusList } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { StyleSheet, View } from 'react-native';
import { logicalDateAt } from '../../domain/logicalDay';
import { useAppStore, useHouseholdState, useStoreSnapshot } from '../../store/AppStateProvider';
import { needsAttention, openTaskLabel } from '../life/openTaskLabel';
import { unlinkedKidsTasks } from './unlinked';
import { HUB, NOTICE, childError, editNotice, eventError, handoffMessage, taskError } from './copy';
import { labelChildren } from './identity';
import {
  addChildToHousehold,
  canAddChild,
  commitKids,
  completeChildTask,
  createChildEvent,
  createChildTask,
  editChildEvent,
  editChildTask,
  eventFingerprint,
  eventFormValues,
  recordAcknowledged,
  recordAccepted,
  recordDeclined,
  removeChildItem,
  requestHandoff,
  requestHandoffToNewPerson,
  takeBack,
  taskFingerprint,
  type HandoffOutcome,
  type ResponseOutcome,
} from './mutations';
import { buildChildDetail, buildItemFact, buildKidsView } from './projection';
import type { KidsRef } from './types';
import { AddChildView } from './views/AddChildView';
import { ChildDetailView } from './views/ChildDetailView';
import { ItemEditorView, type EditorValues, type SubmitResult } from './views/ItemEditorView';
import { KidsHubView } from './views/KidsHubView';
import type { AppState } from '../../domain/state';
import type { TransitionContext } from '../../domain/context';

/**
 * The wiring: store and router in, views out. Nothing here decides what is true about a child; the projection does, and every write
 * goes through `commitKids`, whose OUTCOME (not "committed") decides what she is told.
 */

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The device clock, re-read every minute so "coming up" moves on as events end. The projection itself never reads a clock. */
function useNowMs(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const openChild = (childId: string) => router.push({ pathname: '/life/child/[childId]', params: { childId } });
const openItem = (childId: string, ref: KidsRef) => router.push({ pathname: '/life/child-item', params: { childId, kind: ref.kind, id: ref.id } });

const saved: SubmitResult = { ok: true };
const refused = (message: string): SubmitResult => ({ ok: false, message });
function finish(): SubmitResult {
  router.back();
  return saved;
}

// -------------------------------------------------------------------- hub ---

export function KidsHub() {
  const { state } = useHouseholdState();
  const { identity } = useStoreSnapshot();
  const nowMs = useNowMs();
  const view = useMemo(() => buildKidsView(state, state.household.id, { nowMs }), [state, nowMs]);
  const unlinked = useMemo(() => unlinkedKidsTasks(state, view.today), [state, view.today]);
  return (
    <View style={hubStyles.stack}>
      <KidsHubView view={view} canAddChild={canAddChild(identity)} onOpenChild={openChild} onAddChild={() => router.push('/life/child-add')} />
      {unlinked.length > 0 ? (
        <View style={hubStyles.block}>
          <Overline>Not linked to a child</Overline>
          <AppText variant="supporting" color={color.text.secondary}>
            Tasks in your kids list that don't name a child. They stay here so nothing is out of reach.
          </AppText>
          <StatusList
            items={unlinked.map((entry) => ({
              key: entry.task.id,
              label: entry.task.title,
              value: openTaskLabel(entry, view.today),
              needsAttention: needsAttention(entry),
              onPress: () => router.push({ pathname: '/task-editor', params: { taskId: entry.task.id } }),
            }))}
          />
        </View>
      ) : null}
    </View>
  );
}

const hubStyles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  block: { gap: spacing.md },
});

// ----------------------------------------------------------------- detail ---

export function ChildDetailScreen() {
  const params = useLocalSearchParams<{ childId?: string | string[] }>();
  const childId = first(params.childId);
  const { state } = useHouseholdState();
  const nowMs = useNowMs();
  const navigation = useNavigation();
  const detail = useMemo(() => (childId ? buildChildDetail(state, state.household.id, childId, { nowMs }) : null), [state, childId, nowMs]);

  const title = detail?.label.short ?? 'Child';
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  if (!detail) {
    return <EmptyState title="This child isn't here" body="It may belong to a different account, or it was never part of this household." />;
  }
  const kid = detail.childId;
  return (
    <ChildDetailView
      detail={detail}
      today={detail.today}
      onOpenItem={(ref) => openItem(kid, ref)}
      onAddTask={() => router.push({ pathname: '/life/child-item', params: { childId: kid, kind: 'task' } })}
      onAddEvent={() => router.push({ pathname: '/life/child-item', params: { childId: kid, kind: 'event' } })}
      onAddPlanStep={(parent) => router.push({ pathname: '/life/child-item', params: { childId: kid, kind: 'task', partOf: `${parent.kind}:${parent.id}` } })}
    />
  );
}

// ------------------------------------------------------------------ editor ---

const asRef = (raw: string | undefined): KidsRef | null => {
  const [kind, ...rest] = (raw ?? '').split(':');
  const id = rest.join(':');
  return (kind === 'task' || kind === 'event') && id.length > 0 ? { kind, id } : null;
};

type Step = (state: AppState, ctx: TransitionContext) => { state: AppState; outcome: HandoffOutcome | ResponseOutcome };

export function ItemEditorScreen() {
  const params = useLocalSearchParams<{ childId?: string | string[]; kind?: string | string[]; id?: string | string[]; partOf?: string | string[] }>();
  const kind: 'task' | 'event' = first(params.kind) === 'event' ? 'event' : 'task';
  const id = first(params.id);
  const partOf = asRef(first(params.partOf));
  const store = useAppStore();
  const { state } = useHouseholdState();
  const nowMs = useNowMs();
  const navigation = useNavigation();
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const [respBusy, setRespBusy] = useState(false);

  const task = id !== undefined && kind === 'task' ? state.tasks.find((row) => row.id === id) : undefined;
  const event = id !== undefined && kind === 'event' ? state.events.find((row) => row.id === id) : undefined;
  const row = task ?? event;
  const editing = id !== undefined;
  const ref: KidsRef | null = editing ? { kind, id } : null;
  const item = ref ? buildItemFact(state, state.household.id, ref, { nowMs }) : null;
  const parent = partOf ? (partOf.kind === 'task' ? state.tasks.find((t) => t.id === partOf.id) : state.events.find((e) => e.id === partOf.id)) : undefined;
  const childId = editing ? (row?.subjectMemberId ?? null) : (first(params.childId) ?? parent?.subjectMemberId ?? null);

  // The version she opened: captured once (and again on "show the newer version"), never refreshed while she types.
  const baseline = useRef<{ key: string; value: string } | null>(null);
  if (task || event) {
    const key = `${id}:${reload}`;
    if (baseline.current === null || baseline.current.key !== key) {
      baseline.current = { key, value: task ? taskFingerprint(task) : eventFingerprint(event as NonNullable<typeof event>) };
    }
  }

  const headerTitle = editing ? (kind === 'task' ? 'Task' : 'Event') : kind === 'task' ? 'New task' : 'New event';
  useLayoutEffect(() => {
    navigation.setOptions({ title: headerTitle });
  }, [navigation, headerTitle]);

  const timeZone = state.user.timezone;
  const choices = useMemo(() => labelChildren(state.children, logicalDateAt(nowMs, timeZone)), [state.children, nowMs, timeZone]);
  const people = useMemo(
    () =>
      state.people
        .filter((person) => person.status === 'active')
        .map((person) => ({ id: person.id, displayName: person.displayName }))
        .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id < b.id ? -1 : 1)),
    [state.people]
  );

  if (editing && (row === undefined || item === null)) {
    return (
      <>
        <EmptyState title="This isn't there any more" body={NOTICE.missing} />
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </>
    );
  }

  const shown = event ? eventFormValues(event, timeZone) : { date: '', startText: '', endText: '' };
  const initial: EditorValues = {
    childId,
    title: row?.title ?? '',
    dueDate: task?.dueDate ?? '',
    durationText: task ? String(task.durationMinutes) : '15',
    durationTouched: false,
    notes: row?.notes ?? '',
    commitment: row?.commitment ?? 'flexible',
    date: shown.date,
    startText: shown.startText,
    endText: shown.endText,
    where: event?.location ?? '',
    handoffToPersonId: null,
  };

  const onSubmit = async (v: EditorValues): Promise<SubmitResult> => {
    const forChild = v.childId ?? childId;
    const opened = baseline.current?.value ?? '';

    if (kind === 'task' && task) {
      const { committed, result } = await commitKids(store, (s, ctx) =>
        editChildTask(s, ctx, { taskId: task.id, baseline: opened, title: v.title, dueDate: v.dueDate, durationText: v.durationText, durationTouched: v.durationTouched, notes: v.notes, commitment: v.commitment, childId: forChild ?? '' })
      );
      if (!committed || !result) return refused(NOTICE.saveFailed);
      if (result.outcome === 'saved' || result.outcome === 'unchanged') return finish();
      if (result.outcome === 'stale' || result.outcome === 'missing') {
        const message = editNotice(result.outcome) ?? NOTICE.stale;
        setNotice(message);
        return refused(message);
      }
      return refused(taskError(result.outcome));
    }

    if (kind === 'task') {
      const { committed, result } = await commitKids(store, (s, ctx) =>
        createChildTask(s, ctx, { childId: forChild, title: v.title, dueDate: v.dueDate, durationText: v.durationText, durationTouched: v.durationTouched, notes: v.notes, commitment: v.commitment, handoffToPersonId: v.handoffToPersonId, partOf })
      );
      if (!committed || !result) return refused(NOTICE.saveFailed);
      return result.outcome === 'created' ? finish() : refused(taskError(result.outcome));
    }

    if (event) {
      const { committed, result } = await commitKids(store, (s, ctx) =>
        editChildEvent(s, ctx, { eventId: event.id, baseline: opened, title: v.title, date: v.date, startText: v.startText, endText: v.endText, location: v.where, notes: v.notes, commitment: v.commitment, childId: forChild ?? '' })
      );
      if (!committed || !result) return refused(NOTICE.saveFailed);
      if (result.outcome === 'saved' || result.outcome === 'unchanged') return finish();
      if (result.outcome === 'stale' || result.outcome === 'missing') {
        const message = editNotice(result.outcome) ?? NOTICE.stale;
        setNotice(message);
        return refused(message);
      }
      return refused(eventError(result.outcome));
    }

    const { committed, result } = await commitKids(store, (s, ctx) =>
      createChildEvent(s, ctx, { childId: forChild, title: v.title, date: v.date, startText: v.startText, endText: v.endText, location: v.where, notes: v.notes, commitment: v.commitment, handoffToPersonId: v.handoffToPersonId })
    );
    if (!committed || !result) return refused(NOTICE.saveFailed);
    return result.outcome === 'created' ? finish() : refused(eventError(result.outcome));
  };

  const respond = async (step: Step) => {
    setRespBusy(true);
    try {
      const { committed, result } = await commitKids(store, step);
      setHandoffNote(!committed || !result ? NOTICE.saveFailed : handoffMessage(result.outcome));
    } finally {
      setRespBusy(false);
    }
  };

  const responsibilityId = item?.responsibility.responsibilityId ?? '';
  const responsibility =
    item && ref
      ? {
          facts: item.responsibility,
          actions: item.actions,
          people,
          busy: respBusy,
          message: handoffNote,
          onAskPerson: (personId: string) => respond((s, ctx) => requestHandoff(s, ctx, { ref, personId })),
          onAskNewPerson: (name: string, relationship: string) => respond((s, ctx) => requestHandoffToNewPerson(s, ctx, { ref, name, relationship })),
          onSeen: () => respond((s, ctx) => recordAcknowledged(s, ctx, responsibilityId)),
          onAccepted: (stillNeedsMe: boolean) => respond((s, ctx) => recordAccepted(s, ctx, responsibilityId, stillNeedsMe)),
          onDeclined: () => respond((s, ctx) => recordDeclined(s, ctx, responsibilityId)),
          onTakeBack: () => respond((s, ctx) => takeBack(s, ctx, responsibilityId)),
        }
      : null;

  return (
    <ItemEditorView
      key={`${id ?? 'new'}:${reload}`}
      kind={kind}
      mode={editing ? 'edit' : 'create'}
      timeZone={timeZone}
      childChoices={choices}
      initial={initial}
      durationKnowledge={item?.duration?.knowledge ?? null}
      planStepFor={parent?.title ?? null}
      people={people}
      responsibility={responsibility}
      notice={notice}
      onSubmit={onSubmit}
      onMarkDone={
        task
          ? async () => {
              const { committed, result } = await commitKids(store, (s, ctx) => completeChildTask(s, ctx, task.id));
              if (!committed || !result) return refused(NOTICE.saveFailed);
              return result.outcome === 'completed' ? finish() : refused(NOTICE.missing);
            }
          : undefined
      }
      onRemove={
        ref
          ? async () => {
              const { committed, result } = await commitKids(store, (s, ctx) => removeChildItem(s, ctx, ref));
              if (!committed || !result) return refused(NOTICE.saveFailed);
              return result.outcome === 'removed' ? finish() : refused(NOTICE.missing);
            }
          : undefined
      }
      onReload={() => {
        setNotice(null);
        setReload((n) => n + 1);
      }}
    />
  );
}

// ----------------------------------------------------------------- add child ---

export function AddChildScreen() {
  const store = useAppStore();
  const { identity } = useStoreSnapshot();
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Add a child' });
  }, [navigation]);

  if (!canAddChild(identity)) return <InlineNotice tone="info" title="Adding a child" body={HUB.addChildUnavailable} />;

  return (
    <AddChildView
      onSubmit={async (displayName, birthDate) => {
        // Another account may have signed in while this form was open: check again at the moment of saving.
        if (!canAddChild(store.getSnapshot().identity)) return { ok: false, message: HUB.addChildUnavailable };
        const { committed, result } = await commitKids(store, (s, ctx) => addChildToHousehold(s, ctx, { displayName, birthDate }));
        if (!committed || !result) return { ok: false, message: NOTICE.saveFailed };
        if (result.outcome === 'added') return finish();
        return { ok: false, message: childError(result.outcome) };
      }}
    />
  );
}
