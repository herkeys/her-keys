import { useState } from 'react';
import { EmptyState } from '../../../design/components';
import type { AppState } from '../../../domain/state';
import { COPY } from '../copy';
import {
  createHandoff,
  createMoneyFollowUp,
  createPreparation,
  editHandoff,
  editMoneyFollowUp,
  suggestedCurrency,
  type CounterpartInput,
  type FollowUpFields,
  type HandoffFields,
  type PreparationFields,
} from '../mutations';
import type { CoParentLogisticsView } from '../types';
import { followUpEditorGate, handoffEditorGate, linkableTransitions, outcomeMessage, preparationEditorGate, type EditorGate } from './actions';
import type { ContainerProps } from './containerTypes';
import { FollowUpEditor } from './FollowUpEditor';
import { HandoffEditor } from './HandoffEditor';
import { useMutationRunner, type Transition } from './hooks';
import { handoffChoices } from './labels';
import { leave } from './navigation';
import { BlockedNotices } from './parts';
import { PreparationEditor } from './PreparationEditor';

/** When an editor may not open: say why (a blocked household names the reasons; anything else is "not there" or "not that kind"). */
function GateNotice({ gate, record }: { gate: Exclude<EditorGate<unknown>, { kind: 'ready' }>; record: 'handoff' | 'follow-up' }) {
  if (gate.kind === 'blocked') return <BlockedNotices codes={gate.codes} />;
  if (gate.kind === 'not_a_record') {
    return record === 'handoff' ? (
      <EmptyState title={COPY.states.notAHandoffTitle} body={COPY.states.notAHandoffBody} />
    ) : (
      <EmptyState title={COPY.states.notAFollowUpTitle} body={COPY.states.notAFollowUpBody} />
    );
  }
  return <EmptyState title={COPY.states.notFoundTitle} body={COPY.states.notFoundBody} />;
}

/**
 * Saving, for every editor: one guarded run; on `saved` she goes back, on ANY other outcome she stays on the form with that
 * outcome's own sentence (and a stale refusal also turns Save off, because the row she opened is no longer the row that is there).
 */
function useSaver() {
  const { run, busy } = useMutationRunner();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const save = async (transition: Transition<string>) => {
    setError(null);
    const result = await run(transition);
    if (result === null) return;
    if (result.outcome === 'saved') return leave();
    setError(outcomeMessage(result.outcome));
    if (result.outcome === 'stale') setStale(true);
  };

  return { save, busy, error, stale };
}

interface EditorProps {
  id?: string;
  state: AppState;
  view: CoParentLogisticsView;
}

/** A new handoff, or an edit of one. The gate (and, on edit, the seed) is read ONCE when the editor opens. */
export function HandoffEditorContainer({ id, state, view }: EditorProps) {
  const saver = useSaver();
  const [gate] = useState(() => handoffEditorGate(state, view, id));
  if (gate.kind !== 'ready') return <GateNotice gate={gate} record="handoff" />;
  const { seed } = gate;

  const onSubmit = (fields: HandoffFields, counterpart: CounterpartInput) =>
    saver.save((s, ctx) => (id === undefined ? createHandoff(s, ctx, fields, counterpart) : editHandoff(s, ctx, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields })));

  return (
    <HandoffEditor
      mode={id === undefined ? 'create' : 'edit'}
      initial={seed.fields}
      childOptions={view.children}
      people={view.people}
      error={saver.error}
      busy={saver.busy}
      stale={saver.stale}
      onSubmit={(fields, counterpart) => void onSubmit(fields, counterpart)}
      onCancel={leave}
    />
  );
}

/** A new preparation item, optionally arriving tied to a handoff (`linkId`). */
export function PreparationEditorContainer({ state, view, ctx, linkId }: Pick<ContainerProps, 'state' | 'view' | 'ctx'> & { linkId?: string }) {
  const saver = useSaver();
  const [gate] = useState(() => preparationEditorGate(view));
  if (gate.kind !== 'ready') return <GateNotice gate={gate} record="handoff" />;

  const onSubmit = (fields: PreparationFields) => saver.save((s, transitionCtx) => createPreparation(s, transitionCtx, fields));

  return (
    <PreparationEditor
      childOptions={view.children}
      transitions={handoffChoices(linkableTransitions(state, view, linkId), ctx.today)}
      initialLinkId={linkId ?? null}
      error={saver.error}
      busy={saver.busy}
      onSubmit={(fields) => void onSubmit(fields)}
      onCancel={leave}
    />
  );
}

/** A new follow-up, or an edit of an open one. The seed's `baseUpdatedAt` is what makes a stale edit refuse. */
export function FollowUpEditorContainer({ id, state, view }: EditorProps) {
  const saver = useSaver();
  const [gate] = useState(() => followUpEditorGate(state, view, id));
  // The suggestion is read once too: a currency she recorded earlier, offered but never applied by itself.
  const [suggestion] = useState(() => (id === undefined ? suggestedCurrency(state) : null));
  if (gate.kind !== 'ready') return <GateNotice gate={gate} record="follow-up" />;
  const { seed } = gate;

  const onSubmit = (fields: FollowUpFields, counterpart: CounterpartInput) =>
    saver.save((s, ctx) => (id === undefined ? createMoneyFollowUp(s, ctx, fields, counterpart) : editMoneyFollowUp(s, ctx, { taskId: id, baseUpdatedAt: seed.baseUpdatedAt, fields })));

  return (
    <FollowUpEditor
      mode={id === undefined ? 'create' : 'edit'}
      initial={seed.fields}
      childOptions={view.children}
      people={view.people}
      suggestedCurrency={suggestion}
      error={saver.error}
      busy={saver.busy}
      stale={saver.stale}
      onSubmit={(fields, counterpart) => void onSubmit(fields, counterpart)}
      onCancel={leave}
    />
  );
}
