import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { epochMsOf, logicalDateAt, type LocalDate } from '../../../domain/logicalDay';
import type { DailyLoadReview, RescheduleProposal } from '../../../domain/premium/dailyLoadReview';
import type { LedgerRow } from '../../../monetization/premiumLedgerClient';
import { usePremiumFeature, usePremiumState, usePremiumUpgrade, type PremiumFeatureApi, type PremiumUpgradeApi } from '../../../monetization/PremiumStateProvider';
import { useAppStore, useStoreSnapshot } from '../../../store/AppStateProvider';
import { COPY, approveOutcomeMessage, receiptLine, undoOutcomeMessage } from './copy';
import { FEATURE_KEY, approveProposal, openReview, recoverOnOpen, rejectProposal, undoChange, type FlowDeps } from './dailyLoadFlow';

export interface Notice {
  tone: 'success' | 'attention' | 'info';
  message: string;
}

export interface ReceiptView {
  id: string;
  status: LedgerRow['status'];
  line: string;
  canUndo: boolean;
}

export interface PremiumDailyLoadApi {
  feature: PremiumFeatureApi;
  upgrade: PremiumUpgradeApi;
  date: LocalDate | null;
  panel: 'closed' | 'opening' | 'open';
  review: DailyLoadReview | null;
  /** Proposals she has not dismissed in this session. */
  proposals: RescheduleProposal[];
  receipts: ReceiptView[];
  notice: Notice | null;
  /** The proposal being approved, or the receipt being undone, while that is in flight. */
  busyDigest: string | null;
  undoingId: string | null;
  confirming: RescheduleProposal | null;
  open: () => Promise<void>;
  close: () => void;
  askApprove: (proposal: RescheduleProposal) => void;
  cancelConfirm: () => void;
  approve: () => Promise<void>;
  dismiss: (proposal: RescheduleProposal) => Promise<void>;
  undo: (receiptId: string) => Promise<void>;
}

/**
 * The Premium Daily Load panel's behaviour. It owns no business rule: the server decides who may review (the gate), the domain decides
 * what is offered (`reviewDay`) and what applying or undoing may do (`dailyLoadChange`), and `dailyLoadFlow` sequences receipt, save
 * and receipt. This hook only holds screen state and makes sure nothing runs twice.
 */
export function usePremiumDailyLoad(): PremiumDailyLoadApi {
  const store = useAppStore();
  const snapshot = useStoreSnapshot();
  const { householdId, ledger, appVersion, isCurrent } = usePremiumState();
  const feature = usePremiumFeature(FEATURE_KEY, COPY.featureName);
  const upgrade = usePremiumUpgrade('premium_feature');

  const [panel, setPanel] = useState<PremiumDailyLoadApi['panel']>('closed');
  const [opened, setOpened] = useState<{ review: DailyLoadReview; reviewKey: string } | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyDigest, setBusyDigest] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<RescheduleProposal | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Everything below belongs to ONE household; if it changes (account switch) all of it is dropped.
  const scope = useRef<string | null>(householdId);

  const date = snapshot.today;

  const deps = useMemo<FlowDeps | null>(() => {
    if (householdId === null) return null;
    return {
      ledger,
      authorize: (request) => feature.authorize(request),
      commit: (transition) => isCurrent() ? store.commit((state, ctx) => isCurrent() ? transition(state, ctx) : state) : Promise.resolve(false),
      getState: () => {
        const state = store.getSnapshot().state;
        if (state === null) throw new Error('household not loaded');
        return state;
      },
      householdId,
      appVersion,
    };
    // `feature.authorize` is stable per feature key; the others are stable per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, ledger, appVersion, store, feature.authorize, isCurrent]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (scope.current === householdId) return;
    scope.current = householdId;
    setPanel('closed');
    setOpened(null);
    setDismissed(new Set());
    setRows([]);
    setNotice(null);
    setConfirming(null);
  }, [householdId]);

  const refreshReceipts = useCallback(async () => {
    if (householdId === null) return;
    const listed = await ledger.list(FEATURE_KEY, householdId, 20);
    if (!mounted.current || scope.current !== householdId) return;
    if (listed.kind === 'ok') setRows(listed.value);
  }, [householdId, ledger]);

  // On arrival: finish any receipt a crash or a dropped connection left half-done, then show her own receipts. Reading her own
  // receipts needs no subscription: they are hers.
  useEffect(() => {
    if (deps === null || snapshot.state === null) return;
    let cancelled = false;
    void (async () => {
      await recoverOnOpen(deps);
      if (!cancelled) await refreshReceipts();
    })();
    return () => {
      cancelled = true;
    };
    // once per household; the household's own state is read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, snapshot.state === null]);

  const guarded = useCallback(async (work: () => Promise<void>) => {
    if (inFlight.current || !isCurrent()) return;
    inFlight.current = true;
    try {
      await work();
    } finally {
      inFlight.current = false;
    }
  }, [isCurrent]);

  const open = useCallback(
    () =>
      guarded(async () => {
        if (deps === null || date === null) return;
        setPanel('opening');
        setNotice(null);
        setDismissed(new Set());
        const outcome = await openReview(deps, date);
        if (!mounted.current || scope.current !== deps.householdId) return;
        if (outcome.kind === 'ready') {
          setOpened({ review: outcome.review, reviewKey: outcome.reviewKey });
          setPanel('open');
        } else {
          // A denial is shown by `feature.state` (the server's own words); an unreachable gate says so plainly.
          setPanel('closed');
          if (outcome.kind === 'unavailable') setNotice({ tone: 'attention', message: 'Her Keys couldn’t reach Premium just now. Nothing has changed. Try again in a moment.' });
        }
      }),
    [deps, date, guarded],
  );

  const close = useCallback(() => {
    setPanel('closed');
    setConfirming(null);
  }, []);

  const approve = useCallback(
    () =>
      guarded(async () => {
        const proposal = confirming;
        if (proposal === null || deps === null || opened === null) return;
        setConfirming(null);
        setBusyDigest(proposal.digest);
        setNotice(null);
        const outcome = await approveProposal(deps, opened.reviewKey, proposal);
        if (!mounted.current || scope.current !== deps.householdId) return;
        setBusyDigest(null);
        setNotice(approveOutcomeMessage(outcome, proposal));
        if (outcome.kind === 'applied') setOpened(null); // the day has changed: the old review is no longer the day
        await refreshReceipts();
        if (outcome.kind === 'applied') setPanel('closed');
      }),
    [confirming, deps, opened, guarded, refreshReceipts],
  );

  const dismiss = useCallback(
    (proposal: RescheduleProposal) =>
      guarded(async () => {
        if (deps === null || opened === null) return;
        setDismissed((current) => new Set(current).add(proposal.digest));
        await rejectProposal(deps, opened.reviewKey, proposal);
        if (mounted.current) await refreshReceipts();
      }),
    [deps, opened, guarded, refreshReceipts],
  );

  const undo = useCallback(
    (receiptId: string) =>
      guarded(async () => {
        const row = rows.find((candidate) => candidate.id === receiptId);
        if (row === undefined || deps === null) return;
        setUndoingId(receiptId);
        setNotice(null);
        const outcome = await undoChange(deps, row);
        if (!mounted.current || scope.current !== deps.householdId) return;
        setUndoingId(null);
        setNotice(undoOutcomeMessage(outcome));
        await refreshReceipts();
      }),
    [rows, deps, guarded, refreshReceipts],
  );

  const tz = snapshot.state?.user.timezone ?? 'UTC';
  const receipts = useMemo<ReceiptView[]>(
    () =>
      rows
        .filter((row) => row.kind === 'daily_load.reschedule_task' && ['applied', 'reverted', 'revert_blocked', 'rejected', 'failed'].includes(row.status))
        .slice(0, 6)
        .map((row) => {
          const taskId = typeof row.proposalRef.id === 'string' ? row.proposalRef.id : null;
          const title = taskId === null ? null : snapshot.state?.tasks.find((task) => task.id === taskId)?.title ?? null;
          const plan = (row.plannedSnapshot?.plan ?? null) as { kind?: string; date?: string; startsAt?: string } | null;
          const toDate = plan?.kind === 'day' && plan.date ? plan.date : plan?.kind === 'timed' && plan.startsAt ? logicalDateAt(epochMsOf(plan.startsAt), tz) : null;
          return { id: row.id, status: row.status, line: receiptLine(row, title, toDate), canUndo: row.status === 'applied' };
        }),
    [rows, snapshot.state, tz],
  );

  const proposals = useMemo(() => (opened?.review.proposals ?? []).filter((p) => !dismissed.has(p.digest)), [opened, dismissed]);

  return {
    feature,
    upgrade,
    date,
    panel,
    review: opened?.review ?? null,
    proposals,
    receipts,
    notice,
    busyDigest,
    undoingId,
    confirming,
    open,
    close,
    askApprove: setConfirming,
    cancelConfirm: () => setConfirming(null),
    approve,
    dismiss,
    undo,
  };
}
