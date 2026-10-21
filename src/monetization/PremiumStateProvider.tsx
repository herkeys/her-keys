import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { activeAccountId, type AccountState } from '../domain/account/authState';
import type { PaywallOutcome, PaywallPlacement } from './entitlement';
import { PremiumController, type PremiumSnapshot } from './premiumController';
import { premiumCopyFor, purchaseOutcomeNotice, type PremiumCopy } from './premiumCopy';
import { premiumLaunchState } from './premiumLaunchState';
import { deriveFeatureState, isUsable, type PremiumFeatureState } from './premiumFeatureState';
import { UNCONFIGURED_PREMIUM_LEDGER, type PremiumLedgerClient } from './premiumLedgerClient';
import type { ExtractRequest, ExtractResult, GateDecision, GateRequest, GateResult, PremiumServerClient } from './premiumTypes';
import { useEntitlement } from './RevenueCatProvider';

export interface PremiumContextValue {
  snapshot: PremiumSnapshot;
  controller: PremiumController;
  accountBound: boolean;
  /** The cloud household this bound account owns, or null. The ONLY household id a Premium request may carry (the server re-verifies it). */
  householdId: string | null;
  /** The shared decision ledger (receipts). Injected, so a feature never imports a platform client. */
  ledger: PremiumLedgerClient;
  appVersion: string | undefined;
  /** Latest authorization decision per feature, for the CURRENT account only. */
  decisions: Readonly<Record<string, GateDecision>>;
  recordDecision: (featureKey: string, decision: GateDecision | null) => void;
  authorize: (request: GateRequest) => Promise<GateResult>;
  /** Smart Inbox: the server authorizes, runs and meters one extraction. An answer that arrives after the account changed is discarded. */
  extract: (request: ExtractRequest) => Promise<ExtractResult>;
  /** Synchronous account/lifecycle fence for an asynchronous canonical write. */
  isCurrent: () => boolean;
  /** Per-account, backend-authorized permission to PRESENT a new paid offer. */
  canOfferPurchase: () => Promise<boolean>;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

/**
 * Account-safe Premium state for the whole app. Mount it INSIDE the account provider and the entitlement (store) provider.
 *
 *  - It holds the server's view for ONE account and discards everything the instant the account changes or signs out.
 *  - It refreshes on account change and on app foreground — and never calls the store's restore, so it cannot disturb transfer or
 *    alias behaviour. It only ever asks the SERVER (premium-reconcile) to re-read RevenueCat.
 *  - When the store SDK reports an active entitlement but the server has not caught up, it verifies (bounded) — the store is a hint.
 *  - It persists nothing.
 */
type PremiumStateProviderProps = {
  client: PremiumServerClient;
  accountState: AccountState;
  ledger?: PremiumLedgerClient;
  appVersion?: string;
  isAccountCurrent?: (accountId: string, householdId: string) => boolean;
  children: ReactNode;
};

/**
 * Reset the entire consumer subtree on actor/household change, before its first render can expose the previous actor.
 *
 * Only a BOUND account has an actor and a household for Premium to hold, so every unbound kind shares one key. Keying on the kind
 * itself remounted the whole app — the welcome flow included — on every sign-in transition (unauthenticated -> authenticating ->
 * unauthenticated), discarding the sign-up confirmation notice, the code screen and any in-flight provider sign-in (AE2E-D03).
 */
export function PremiumStateProvider(props: PremiumStateProviderProps) {
  const key = props.accountState.kind === 'accountBound'
    ? `${props.accountState.session.accountId}:${props.accountState.householdId}` : 'unbound';
  const scope = useRef({ key });
  if (scope.current.key !== key) scope.current = { key };
  const owner = scope.current;
  const current = useCallback(() => scope.current === owner, [owner]);
  return <PremiumAccountState key={key} {...props} scopeIsCurrent={current} />;
}

function PremiumAccountState({
  client: transport,
  accountState,
  ledger = UNCONFIGURED_PREMIUM_LEDGER,
  appVersion,
  children,
  isAccountCurrent,
  scopeIsCurrent,
}: PremiumStateProviderProps & { scopeIsCurrent: () => boolean }) {
  const { status: storeStatus } = useEntitlement();
  const accountId = activeAccountId(accountState);
  const accountBound = accountState.kind === 'accountBound';
  const householdId = accountState.kind === 'accountBound' ? accountState.householdId : null;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const isCurrent = useCallback(() => live.current && scopeIsCurrent() && accountBound && accountId !== null && householdId !== null
    && (isAccountCurrent?.(accountId, householdId) ?? true), [scopeIsCurrent, accountBound, accountId, householdId, isAccountCurrent]);
  const owner = useMemo(() => ({ accountId, isCurrent }), [accountId, isCurrent]);
  const client = useMemo(() => transport.forAccount?.(owner) ?? transport, [transport, owner]);
  const controller = useMemo(() => new PremiumController(client), [client]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const accountLedger = useMemo(() => ledger.forAccount?.(owner) ?? ledger, [ledger, owner]);
  // Old flows cannot invoke a new account's transport after an await, including a shared-household account switch.
  const scopedLedger = useMemo<PremiumLedgerClient>(() => ({
    async record(input) {
      if (!isCurrent() || input.householdId !== householdId) return { kind: 'unavailable' };
      const result = await accountLedger.record(input);
      return isCurrent() ? result : { kind: 'unavailable' };
    },
    async transition(...args) {
      if (!isCurrent()) return { kind: 'unavailable' };
      const result = await accountLedger.transition(...args);
      return isCurrent() ? result : { kind: 'unavailable' };
    },
    async list(feature, household, limit) {
      if (!isCurrent() || household !== householdId) return { kind: 'unavailable' };
      const result = await accountLedger.list(feature, household, limit);
      return isCurrent() ? result : { kind: 'unavailable' };
    },
  }), [accountLedger, isCurrent, householdId]);
  const [decisionStore, setDecisionStore] = useState<{ accountId: string | null; byFeature: Record<string, GateDecision> }>({ accountId: null, byFeature: {} });

  // A bound account is the only one that may hold Premium state; authDegraded keeps its last server view out of reach.
  useEffect(() => {
    controller.setAccount(accountBound ? accountId : null);
    return () => undefined;
  }, [controller, accountBound, accountId]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh();
    });
    return () => subscription.remove();
  }, [controller]);

  // The store says paid: make the SERVER confirm. (Once per account session automatically; "Check again" is always available.)
  useEffect(() => {
    if (storeStatus === 'plus') controller.noteStoreEntitled();
  }, [storeStatus, snapshot.load, snapshot.server, controller]);

  // A decision belongs to the account that asked and is dropped when the server's own state changes underneath it.
  const decisions = decisionStore.accountId === snapshot.accountId ? decisionStore.byFeature : EMPTY_DECISIONS;
  const stateStamp = snapshot.server?.state ?? null;
  const lastStamp = useRef(stateStamp);
  useEffect(() => {
    if (lastStamp.current !== stateStamp) {
      lastStamp.current = stateStamp;
      setDecisionStore((current) => (current.accountId === snapshot.accountId ? { accountId: snapshot.accountId, byFeature: {} } : current));
    }
  }, [stateStamp, snapshot.accountId]);

  const recordDecision = useCallback(
    (featureKey: string, decision: GateDecision | null) => {
      setDecisionStore((current) => {
        const base = current.accountId === snapshot.accountId ? current.byFeature : {};
        const next = { ...base };
        if (decision === null) delete next[featureKey];
        else next[featureKey] = decision;
        return { accountId: snapshot.accountId, byFeature: next };
      });
    },
    [snapshot.accountId],
  );

  const authorize = useCallback(
    async (request: GateRequest): Promise<GateResult> => {
      if (!isCurrent() || request.householdId !== householdId || controller.getSnapshot().server?.state === 'deletion_pending') return { kind: 'unavailable' };
      const owner = controller.getSnapshot().accountId;
      const result = await client.authorize(request);
      // An answer that arrives after the account changed belongs to nobody on screen now.
      if (!isCurrent() || controller.getSnapshot().accountId !== owner) return { kind: 'unavailable' };
      if (result.kind === 'decision') recordDecision(request.feature, result.decision);
      return result;
    },
    [client, controller, recordDecision, isCurrent, householdId],
  );

  const extract = useCallback(
    async (request: ExtractRequest): Promise<ExtractResult> => {
      if (!isCurrent() || request.householdId !== householdId || controller.getSnapshot().server?.state === 'deletion_pending') return { kind: 'unavailable', reason: 'account_changed' };
      const owner = controller.getSnapshot().accountId;
      const result = await client.extract(request);
      if (!isCurrent() || controller.getSnapshot().accountId !== owner) return { kind: 'unavailable', reason: 'account_changed' };
      return result;
    },
    [client, controller, isCurrent, householdId],
  );

  const canOfferPurchase = useCallback(async () => {
    if (!isCurrent() || controller.getSnapshot().server?.state === 'deletion_pending') return false;
    const owner = controller.getSnapshot().accountId;
    const readiness = await client.purchaseReadiness?.();
    return isCurrent() && controller.getSnapshot().accountId === owner && readiness?.ready === true;
  }, [client, controller, isCurrent]);

  const value = useMemo<PremiumContextValue>(
    () => ({ snapshot, controller, accountBound, householdId, ledger: scopedLedger, appVersion, decisions, recordDecision, authorize, extract, isCurrent, canOfferPurchase }),
    [snapshot, controller, accountBound, householdId, scopedLedger, appVersion, decisions, recordDecision, authorize, extract, isCurrent, canOfferPurchase],
  );
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

const EMPTY_DECISIONS: Readonly<Record<string, GateDecision>> = {};

export function usePremiumState(): PremiumContextValue {
  const value = useContext(PremiumContext);
  if (!value) throw new Error('usePremiumState must be used within PremiumStateProvider');
  return value;
}

/** For a surface that is useful without Premium (the Account screen): the Premium state, or null where no provider is mounted. */
export function usePremiumStateIfMounted(): PremiumContextValue | null {
  return useContext(PremiumContext);
}

export interface PremiumFeatureApi {
  state: PremiumFeatureState;
  copy: PremiumCopy;
  usable: boolean;
  /** Ask the server to authorize ONE operation. Records the decision so `state` reflects exactly what the server said. */
  authorize: (request: Omit<GateRequest, 'feature'>) => Promise<GateResult>;
  /** Re-read the server's view (e.g. on screen focus). */
  refresh: () => Promise<void>;
  /** "Check again": the server re-reads the store's record for this account. */
  verify: () => Promise<void>;
  /** The latest server decision for this feature (current account), if any. */
  decision: GateDecision | null;
  clearDecision: () => void;
}

/** The one hook every Premium pillar uses to know what she can do, and to ask the server to do it. */
export function usePremiumFeature(featureKey: string, featureName: string): PremiumFeatureApi {
  const { snapshot, controller, accountBound, decisions, recordDecision, authorize, isCurrent } = usePremiumState();
  const { status: storeStatus } = useEntitlement();
  const decision = decisions[featureKey] ?? null;
  const state = useMemo(
    () => deriveFeatureState({ accountBound, featureKey, snapshot, storeStatus, decision }),
    [accountBound, featureKey, snapshot, storeStatus, decision],
  );
  const copy = useMemo(() => premiumCopyFor(state, featureName), [state, featureName]);
  return {
    state,
    copy,
    usable: isUsable(state),
    authorize: useCallback((request) => authorize({ ...request, feature: featureKey }), [authorize, featureKey]),
    refresh: useCallback(() => isCurrent() ? controller.refresh() : Promise.resolve(), [controller, isCurrent]),
    verify: useCallback(() => isCurrent() ? controller.startVerification() : Promise.resolve(), [controller, isCurrent]),
    decision,
    clearDecision: useCallback(() => recordDecision(featureKey, null), [recordDecision, featureKey]),
  };
}

export interface PremiumUpgradeApi {
  /** Open the approved purchase interface for this placement; on a purchase/restore, hand verification to the server. */
  start: () => Promise<PaywallOutcome>;
  presenting: boolean;
  notice: { tone: PremiumCopy['tone']; message: string } | null;
}

/**
 * Buy or restore from inside a feature, then WAIT FOR THE SERVER (not the store) before the feature unlocks. The caller never loses its
 * place: the paywall is a modal over the same screen, and `usePremiumFeature().state` flips when the server confirms.
 */
export function usePremiumUpgrade(placement: PaywallPlacement): PremiumUpgradeApi {
  const { presentPaywall } = useEntitlement();
  const { controller, isCurrent, canOfferPurchase } = usePremiumState();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [presenting, setPresenting] = useState(false);
  const [notice, setNotice] = useState<PremiumUpgradeApi['notice']>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async (): Promise<PaywallOutcome> => {
    if (inFlight.current || !isCurrent() || controller.getSnapshot().server?.state === 'deletion_pending') return { kind: 'unavailable' };
    // A paid offer requires server-confirmed release of the actual three benefits.
    // Store entitlement alone never makes an unreleased product commercially ready.
    if (!premiumLaunchState(controller.getSnapshot().manifest).ready) {
      if (mounted.current) setNotice({
        tone: 'attention',
        message: 'Her Keys Premium is not available for purchase here yet. Your Free tools are unaffected.',
      });
      return { kind: 'unavailable' };
    }
    inFlight.current = true;
    setPresenting(true);
    setNotice(null);
    let outcome: PaywallOutcome;
    try {
      const ready = await canOfferPurchase();
      outcome = ready && isCurrent() ? await presentPaywall(placement) : { kind: 'unavailable' };
    
    } catch {
      outcome = { kind: 'error', message: 'paywall_threw' };
    } finally {
      inFlight.current = false;
    }
    if (!isCurrent()) return { kind: 'unavailable' };
    if (outcome.kind === 'purchased' || outcome.kind === 'restored' || outcome.kind === 'already_entitled') void controller.startVerification();
    if (mounted.current) {
      setPresenting(false);
      setNotice(purchaseOutcomeNotice(outcome));
    }
    return outcome;
  }, [controller, placement, presentPaywall, isCurrent, canOfferPurchase]);

  return { start, presenting, notice };
}
