import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { TransitionContext } from '../../domain/context';
import { addDays } from '../../domain/logicalDay';
import type { AppState } from '../../domain/state';
import { useAccount } from '../../store/AccountProvider';
import { useAppStore, useHouseholdState, useStoreSnapshot } from '../../store/AppStateProvider';
import { PersistenceNotice } from '../today/PersistenceNotice';
import { SyncNotice } from '../today/SyncNotice';
import { MoneyBody } from './MoneyBody';
import { MONEY_COPY } from './moneyCopy';
import { moneyGate } from './moneyGate';
import {
  cancelMoneyItem,
  createExpectedIncome,
  createObligation,
  duplicateMoneyItemForward,
  editMoneyItem,
  moneyItemRevision,
  resolveMoneyItem,
  type MutationResult,
} from './mutations';
import { buildMoneyHomeView } from './projection';
import type { MoneyItemFields, MoneyItemOutcome } from './types';
import { MoneySheet } from './MoneySheet';

type SheetState =
  | { kind: 'create'; direction: 'outflow' | 'inflow' }
  | { kind: 'edit'; taskId: string; direction: 'outflow' | 'inflow'; baseUpdatedAt: string | null };

const emptyFields = (dueDate: string): MoneyItemFields => ({ title: '', amountText: '', dueDate, paymentMechanism: null, childId: null, notes: '' });

function outcomeCopy(outcome: MoneyItemOutcome): string {
  switch (outcome) {
    case 'invalid_title':
      return MONEY_COPY.errTitle;
    case 'invalid_amount':
      return MONEY_COPY.errAmount;
    case 'invalid_date':
      return MONEY_COPY.errDate;
    case 'invalid_child':
      return MONEY_COPY.errChild;
    case 'stale':
      return MONEY_COPY.errStale;
    case 'missing':
    case 'not_a_money_item':
    case 'not_open':
      return MONEY_COPY.errGone;
    default:
      return MONEY_COPY.errSave;
  }
}

/**
 * The Money screen: household financial attention, and nothing else. Reads the projection and
 * writes through the canonical store and Money's own domain actions — no direct network call, no
 * queue of its own. Mirrors src/features/meals/MealsOverview.tsx's architecture.
 */
export function MoneyOverview() {
  const { state, today } = useHouseholdState();
  const snapshot = useStoreSnapshot();
  const { syncNamespace } = useAccount();
  const store = useAppStore();

  const gate = moneyGate({ storeStatus: snapshot.status, persistence: snapshot.persistence, syncHydration: syncNamespace?.hydration ?? null });
  const view = useMemo(() => buildMoneyHomeView(state, state.household.id, { nowMs: Date.now() }), [state]);

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closeSheet = () => {
    setSheet(null);
    setNotice(null);
  };

  const taskById = (id: string) => state.tasks.find((task) => task.id === id) ?? null;

  const fieldsFor = (taskId: string): MoneyItemFields => {
    const task = taskById(taskId);
    if (!task || task.value === null) return emptyFields(today);
    return {
      title: task.title,
      amountText: (task.value.amountMinor / 100).toFixed(2),
      dueDate: task.dueDate ?? today,
      paymentMechanism: task.paymentMechanism,
      childId: task.subjectMemberId,
      notes: task.notes ?? '',
    };
  };

  const run = async (mutate: (state: AppState, ctx: TransitionContext) => MutationResult<MoneyItemOutcome>) => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome: { value: MoneyItemOutcome | null } = { value: null };
      const saved = await store.commit((current, ctx) => {
        const result = mutate(current, ctx);
        outcome.value = result.outcome;
        return result.state;
      });
      if (!saved) {
        setNotice(MONEY_COPY.errSave);
        return false;
      }
      if (outcome.value === 'saved') {
        closeSheet();
        return true;
      }
      setNotice(outcomeCopy(outcome.value ?? 'missing'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = (fields: MoneyItemFields) => {
    if (sheet === null) return;
    if (sheet.kind === 'create') {
      run((current, ctx) => (sheet.direction === 'outflow' ? createObligation(current, ctx, fields) : createExpectedIncome(current, ctx, fields)));
    } else {
      run((current, ctx) => editMoneyItem(current, ctx, { taskId: sheet.taskId, baseUpdatedAt: sheet.baseUpdatedAt, fields }));
    }
  };

  const resolve = () => {
    if (sheet?.kind !== 'edit') return;
    run((current, ctx) => resolveMoneyItem(current, ctx, sheet.taskId));
  };

  const cancel = () => {
    if (sheet?.kind !== 'edit') return;
    run((current, ctx) => cancelMoneyItem(current, ctx, sheet.taskId));
  };

  const duplicateForward = () => {
    if (sheet?.kind !== 'edit') return;
    const task = taskById(sheet.taskId);
    const nextDueDate = addDays(task?.dueDate ?? today, 30);
    run((current, ctx) => duplicateMoneyItemForward(current, ctx, { taskId: sheet.taskId, nextDueDate }));
  };

  const openEdit = (taskId: string) => {
    const task = taskById(taskId);
    if (!task || task.value === null) return;
    setNotice(null);
    setSheet({ kind: 'edit', taskId, direction: task.value.direction, baseUpdatedAt: moneyItemRevision(task) });
  };

  const openCreate = (direction: 'outflow' | 'inflow') => {
    setNotice(null);
    setSheet({ kind: 'create', direction });
  };

  return (
    <View>
      <PersistenceNotice />
      <SyncNotice />
      <MoneyBody gate={gate} view={view} onAddObligation={() => openCreate('outflow')} onAddIncome={() => openCreate('inflow')} onOpenItem={openEdit} />

      {sheet ? (
        <MoneySheet
          key={sheet.kind === 'edit' ? `edit:${sheet.taskId}:${sheet.baseUpdatedAt}` : `create:${sheet.direction}`}
          visible
          mode={sheet.kind === 'edit' ? 'edit' : 'create'}
          direction={sheet.direction}
          initial={sheet.kind === 'edit' ? fieldsFor(sheet.taskId) : emptyFields(today)}
          notice={notice}
          busy={busy}
          canWrite={gate.canWrite}
          childOptions={state.children}
          onSubmit={submit}
          onClose={closeSheet}
          onResolve={sheet.kind === 'edit' ? resolve : undefined}
          onCancel={sheet.kind === 'edit' ? cancel : undefined}
          onDuplicateForward={sheet.kind === 'edit' ? duplicateForward : undefined}
        />
      ) : null}
    </View>
  );
}
