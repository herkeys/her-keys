import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MOMENTUM_FEATURE_KEY } from '../../../domain/premium/momentum/model';
import { usePremiumFeature, usePremiumState, usePremiumUpgrade, type PremiumFeatureApi, type PremiumUpgradeApi } from '../../../monetization/PremiumStateProvider';
import { useStoreSnapshot } from '../../../store/AppStateProvider';
import { COPY } from './copy';
import { approveNextStep, generateWeeklyReview, listSavedReviews, nextStepApproved, type MomentumFlowDeps, type ReviewOutcome, type SavedReview } from './momentumFlow';

export type MomentumView =
  | { kind: 'closed' }
  | { kind: 'opening' }
  | { kind: 'review'; outcome: Exclude<ReviewOutcome, { kind: 'denied' }>; nextApproved: boolean }
  | { kind: 'saved'; review: SavedReview };

export interface PremiumMomentumApi {
  feature: PremiumFeatureApi;
  upgrade: PremiumUpgradeApi;
  view: MomentumView;
  /** Saved reviews: her own records, readable whatever the subscription state. */
  saved: SavedReview[];
  notice: { tone: 'attention' | 'info'; message: string } | null;
  approving: boolean;
  /** Resolve a typed reference to a title from the household's CURRENT records (the saved copy holds none). */
  titleOf: (ref: { kind: string; id: string }) => string | null;
  open: () => Promise<void>;
  openSaved: (id: string) => void;
  close: () => void;
  approveNext: () => Promise<void>;
}

/**
 * The weekly review's behaviour. It owns no business rule: the domain derives and counts, the flow sequences receipts, authorization
 * and saving, and the server decides who may have a NEW review. This hook only holds screen state and makes sure nothing runs twice.
 */
export function usePremiumMomentum(): PremiumMomentumApi {
  const snapshot = useStoreSnapshot();
  const { householdId, ledger, appVersion } = usePremiumState();
  const feature = usePremiumFeature(MOMENTUM_FEATURE_KEY, COPY.featureName);
  const upgrade = usePremiumUpgrade('premium_feature');

  const [view, setView] = useState<MomentumView>({ kind: 'closed' });
  const [saved, setSaved] = useState<SavedReview[]>([]);
  const [notice, setNotice] = useState<PremiumMomentumApi['notice']>(null);
  const [approving, setApproving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const scope = useRef<string | null>(householdId);

  const deps = useMemo<MomentumFlowDeps | null>(() => {
    if (householdId === null) return null;
    return { ledger, authorize: (request) => feature.authorize(request), householdId, appVersion };
    // `feature.authorize` is stable per feature key; the others are stable per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, ledger, appVersion, feature.authorize]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Everything below belongs to ONE household; if it changes (account switch) all of it is dropped.
  useEffect(() => {
    if (scope.current === householdId) return;
    scope.current = householdId;
    setView({ kind: 'closed' });
    setSaved([]);
    setNotice(null);
  }, [householdId]);

  const refreshSaved = useCallback(async () => {
    if (householdId === null) return;
    const listed = await listSavedReviews({ ledger, householdId });
    if (!mounted.current || scope.current !== householdId) return;
    if (listed.kind === 'ok') setSaved(listed.reviews);
  }, [householdId, ledger]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const titleOf = useCallback(
    (ref: { kind: string; id: string }): string | null => (ref.kind === 'task' ? (snapshot.state?.tasks.find((task) => task.id === ref.id)?.title ?? null) : null),
    [snapshot.state],
  );

  const open = useCallback(async () => {
    const today = snapshot.today;
    if (deps === null || snapshot.state === null || today === null || inFlight.current || !feature.usable) return;
    inFlight.current = true;
    setNotice(null);
    setView({ kind: 'opening' });
    try {
      const outcome = await generateWeeklyReview(deps, { state: snapshot.state, today, nowMs: Date.now() });
      if (!mounted.current || scope.current !== deps.householdId) return;
      if (outcome.kind === 'denied') {
        // The server's answer is what the feature state shows; the sheet stays shut.
        setView({ kind: 'closed' });
        return;
      }
      const nextApproved = outcome.kind === 'ready' && outcome.report.nextStep !== null ? await nextStepApproved(deps, outcome.reviewKey) : false;
      if (!mounted.current || scope.current !== deps.householdId) return;
      setView({ kind: 'review', outcome, nextApproved });
      if (outcome.kind === 'ready') void refreshSaved();
    } finally {
      inFlight.current = false;
    }
  }, [deps, feature.usable, refreshSaved, snapshot.state, snapshot.today]);

  const openSaved = useCallback(
    (id: string) => {
      const review = saved.find((entry) => entry.id === id);
      if (review) setView({ kind: 'saved', review });
    },
    [saved],
  );

  const close = useCallback(() => {
    setView({ kind: 'closed' });
    setNotice(null);
  }, []);

  const approveNext = useCallback(async () => {
    if (deps === null || view.kind !== 'review' || view.outcome.kind !== 'ready' || view.outcome.report.nextStep === null || approving) return;
    const { reviewKey, report } = view.outcome;
    setApproving(true);
    try {
      const result = await approveNextStep(deps, { reviewKey, about: report.nextStep!.about });
      if (!mounted.current || scope.current !== deps.householdId) return;
      if (result.kind === 'approved' || result.kind === 'already_approved') setView({ ...view, nextApproved: true });
      else setNotice({ tone: 'attention', message: COPY.unavailable.nextStep });
    } finally {
      if (mounted.current) setApproving(false);
    }
  }, [approving, deps, view]);

  return { feature, upgrade, view, saved, notice, approving, titleOf, open, openSaved, close, approveNext };
}
