import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  addLifeRecord,
  addLifeRecordTask,
  archiveLifeRecord,
  restoreLifeRecord,
  snapshotOfLifeRecord,
  updateLifeRecord,
  type LifeRecordResult,
  type LifeRecordSnapshot,
  type LifeRecordTaskRefusal,
} from '../../domain/lifeRecords';
import type { TransitionContext } from '../../domain/context';
import type { LocalDate } from '../../domain/logicalDay';
import type { AppStore } from '../../state/appStore';
import type { AppState, LifeRecord, LifeRecordLinkRelation } from '../../domain/state';
import { newLifeAdminDraftId } from './draftId';
import { LifeAdminBody } from './LifeAdminBody';
import { LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';
import { lifeAdminGate, type LifeAdminGateInput } from './lifeAdminGate';
import { buildLifeAdminView, buildRecordDetail } from './lifeAdminView';
import { RecordDetailSheet } from './RecordDetailSheet';
import { EMPTY_RECORD_VALUES, RecordSheet, type RecordSheetValues } from './RecordSheet';
import { RecordTaskSheet, type RecordTaskSheetValues } from './RecordTaskSheet';

/**
 * The Life Admin / Documents screen. It reads the projection and writes through the canonical store and the LifeRecord commands,
 * and nothing else: no network call, no queue of its own, no log line. Navigation is passed in, so this component holds no router.
 * Sheet ids are allocated when a sheet OPENS; opening or closing a sheet never changes the household.
 */

type SheetState =
  | { kind: 'create'; draftId: string }
  | { kind: 'edit'; recordId: string; expected: LifeRecordSnapshot }
  | { kind: 'detail'; recordId: string }
  | { kind: 'task'; recordId: string; relation: LifeRecordLinkRelation; taskId: string; linkId: string };

const valuesOf = (record: LifeRecord): RecordSheetValues => ({
  title: record.title,
  kind: record.kind,
  typeName: record.typeName ?? '',
  issuerName: record.issuerName ?? '',
  referenceNumber: record.referenceNumber ?? '',
  issuedOn: record.issuedOn ?? '',
  expiresOn: record.expiresOn ?? '',
  renewBy: record.renewBy ?? '',
  reviewOn: record.reviewOn ?? '',
  locationHint: record.locationHint ?? '',
  note: record.note ?? '',
  subjectMemberId: record.subjectMemberId,
});

/** What she typed, as the command's input: every field is stated, so an emptied field is cleared. */
const fieldsOf = (values: RecordSheetValues) => ({
  title: values.title,
  kind: values.kind,
  typeName: values.typeName,
  issuerName: values.issuerName,
  referenceNumber: values.referenceNumber,
  issuedOn: values.issuedOn,
  expiresOn: values.expiresOn,
  renewBy: values.renewBy,
  reviewOn: values.reviewOn,
  locationHint: values.locationHint,
  note: values.note,
  subjectMemberId: values.subjectMemberId,
});

function recordRefusalCopy(result: Pick<LifeRecordResult, 'refusal' | 'field'>): string {
  switch (result.refusal) {
    case 'invalid-field':
      return (result.field !== null && COPY.errField[result.field]) || COPY.errSave;
    case 'records-full':
      return COPY.errFull;
    case 'stale':
      return COPY.errStale;
    case 'not-found':
      return COPY.errGone;
    default:
      return COPY.errSave;
  }
}

function taskRefusalCopy(refusal: LifeRecordTaskRefusal): string {
  switch (refusal) {
    case 'invalid-title':
      return COPY.errTaskTitle;
    case 'invalid-category':
      return COPY.errTaskCategory;
    case 'invalid-date':
      return COPY.errTaskDate;
    case 'invalid-minutes':
      return COPY.errTaskMinutes;
    case 'archived':
      return COPY.errTaskArchived;
    case 'task-full':
    case 'links-full':
      return COPY.errTaskFull;
    case 'not-found':
      return COPY.errGone;
    default:
      return COPY.errSave;
  }
}

const activeCategories = (state: AppState) =>
  [...state.categories].filter((category) => category.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder).map((category) => ({ id: category.id, name: category.name }));

export interface LifeAdminNavigation {
  onOpenTask: (taskId: string) => void;
  onSkip: () => void;
}

export interface LifeAdminContainerProps extends LifeAdminNavigation {
  state: AppState;
  today: LocalDate;
  gateInput: LifeAdminGateInput;
  /** Only what the container needs from the store: one commit per action, and the latest state after a stale refusal. */
  store: Pick<AppStore, 'commit' | 'getSnapshot'>;
}

/**
 * Everything the screen does, with the store passed in (so it is exercised against a real store in tests). Opening or closing a
 * sheet sets component state and allocates draft ids; the store is written only by a Save, an Archive or a Restore.
 */
export function LifeAdminContainer({ state, today, gateInput, store, onOpenTask, onSkip }: LifeAdminContainerProps) {
  const gate = lifeAdminGate(gateInput);
  const view = useMemo(() => buildLifeAdminView(state, today), [state, today]);

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recordById = (id: string) => state.lifeRecords.find((record) => record.id === id) ?? null;
  const open = (next: SheetState | null) => {
    setNotice(null);
    setSheet(next);
  };

  /** Runs one command through the store. Returns the command's own answer, or null when the store could not save. */
  async function run<T extends { state: AppState }>(command: (current: AppState, ctx: TransitionContext) => T): Promise<T | null> {
    const outcome: { result: T | null } = { result: null };
    const saved = await store.commit((current, ctx) => {
      outcome.result = command(current, ctx);
      return outcome.result.state;
    });
    return saved ? outcome.result : null;
  }

  const submitRecord = async (values: RecordSheetValues) => {
    if (sheet === null || (sheet.kind !== 'create' && sheet.kind !== 'edit') || busy) return;
    setBusy(true);
    try {
      const result =
        sheet.kind === 'create'
          ? await run((current, ctx) => addLifeRecord(current, ctx, { ...fieldsOf(values), id: sheet.draftId }))
          : await run((current, ctx) => updateLifeRecord(current, ctx, sheet.recordId, fieldsOf(values), sheet.expected));
      if (result === null) return setNotice(COPY.errSave);
      // `exists` repeats a save that already happened: it is a success.
      if (result.refusal === null || result.refusal === 'exists') {
        setFlash(COPY.saved);
        open(sheet.kind === 'edit' ? { kind: 'detail', recordId: sheet.recordId } : null);
        return;
      }
      setNotice(recordRefusalCopy(result));
      if (result.refusal === 'stale' && sheet.kind === 'edit') {
        const latest = store.getSnapshot().state?.lifeRecords.find((record) => record.id === sheet.recordId);
        if (latest) setSheet({ ...sheet, expected: snapshotOfLifeRecord(latest) });
      }
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (to: 'archived' | 'active') => {
    if (sheet === null || sheet.kind !== 'detail' || busy) return;
    setBusy(true);
    try {
      const result = await run((current, ctx) => (to === 'archived' ? archiveLifeRecord(current, ctx, sheet.recordId) : restoreLifeRecord(current, ctx, sheet.recordId)));
      if (result === null) return setNotice(COPY.errSave);
      if (result.refusal === null || result.refusal === 'archived' || result.refusal === 'active') {
        setFlash(to === 'archived' ? COPY.archivedFlash : COPY.restoredFlash);
        open(to === 'archived' ? null : sheet);
        return;
      }
      setNotice(recordRefusalCopy(result));
    } finally {
      setBusy(false);
    }
  };

  const submitTask = async (values: RecordTaskSheetValues) => {
    if (sheet === null || sheet.kind !== 'task' || busy || values.categoryId === null) return;
    const categoryId = values.categoryId;
    setBusy(true);
    try {
      const minutes = values.minutes.trim().length === 0 ? null : Number(values.minutes.trim());
      const result = await run((current, ctx) =>
        addLifeRecordTask(current, ctx, {
          recordId: sheet.recordId,
          taskId: sheet.taskId,
          linkId: sheet.linkId,
          relation: sheet.relation,
          title: values.title,
          categoryId,
          dueDate: values.dueDate.trim().length === 0 ? null : values.dueDate.trim(),
          minutes,
        })
      );
      if (result === null) return setNotice(COPY.errSave);
      if (result.refusal === null || result.refusal === 'exists') {
        setFlash(COPY.taskAdded);
        open({ kind: 'detail', recordId: sheet.recordId });
        return;
      }
      setNotice(taskRefusalCopy(result.refusal));
    } finally {
      setBusy(false);
    }
  };

  const childOptions = state.children.map((child) => ({ id: child.id, name: child.displayName }));
  const detail = sheet?.kind === 'detail' ? buildRecordDetail(state, today, sheet.recordId) : null;
  const editing = sheet?.kind === 'edit' ? recordById(sheet.recordId) : null;
  const tasking = sheet?.kind === 'task' ? recordById(sheet.recordId) : null;

  return (
    <View>
      <LifeAdminBody
        gate={gate}
        view={view}
        flash={flash}
        onAddRecord={() => {
          setFlash(null);
          open({ kind: 'create', draftId: newLifeAdminDraftId('life-record') });
        }}
        onSkip={onSkip}
        onOpenRecord={(recordId) => {
          setFlash(null);
          open({ kind: 'detail', recordId });
        }}
      />

      {sheet?.kind === 'create' ? (
        <RecordSheet key={sheet.draftId} visible mode="create" initial={EMPTY_RECORD_VALUES} childOptions={childOptions} notice={notice} busy={busy} canWrite={gate.canWrite} onSubmit={submitRecord} onClose={() => open(null)} />
      ) : null}

      {sheet?.kind === 'edit' && editing !== null ? (
        <RecordSheet
          key={`edit:${sheet.recordId}:${JSON.stringify(sheet.expected).length}:${sheet.expected.title}`}
          visible
          mode="edit"
          initial={valuesOf(editing)}
          childOptions={childOptions}
          notice={notice}
          busy={busy}
          canWrite={gate.canWrite}
          onSubmit={submitRecord}
          onClose={() => open({ kind: 'detail', recordId: sheet.recordId })}
        />
      ) : null}

      {sheet?.kind === 'detail' && detail !== null ? (
        <RecordDetailSheet
          key={sheet.recordId}
          visible
          detail={detail}
          notice={notice}
          busy={busy}
          canWrite={gate.canWrite}
          onEdit={() => {
            const record = recordById(sheet.recordId);
            if (record) open({ kind: 'edit', recordId: record.id, expected: snapshotOfLifeRecord(record) });
          }}
          onAddTask={(relation) =>
            open({ kind: 'task', recordId: sheet.recordId, relation, taskId: newLifeAdminDraftId('task'), linkId: newLifeAdminDraftId('life-link') })
          }
          onArchive={() => void changeStatus('archived')}
          onRestore={() => void changeStatus('active')}
          onOpenTask={onOpenTask}
          onClose={() => open(null)}
        />
      ) : null}

      {sheet?.kind === 'task' && tasking !== null ? (
        <RecordTaskSheet
          key={sheet.taskId}
          visible
          relation={sheet.relation}
          recordTitle={tasking.title}
          renewBy={tasking.renewBy}
          categories={activeCategories(state)}
          notice={notice}
          busy={busy}
          canWrite={gate.canWrite}
          onSubmit={submitTask}
          onClose={() => open({ kind: 'detail', recordId: sheet.recordId })}
        />
      ) : null}
    </View>
  );
}
