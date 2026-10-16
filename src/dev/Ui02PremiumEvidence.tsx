import { StyleSheet, View } from 'react-native';
import { Overline, Screen } from '../design/components';
import { spacing } from '../design/tokens';
import { PremiumDailyLoadPanel } from '../features/daily-load/premium/PremiumDailyLoadSection';
import type { PremiumDailyLoadApi } from '../features/daily-load/premium/usePremiumDailyLoad';
import { PremiumMomentumPanel } from '../features/momentum/premium/PremiumMomentumSection';
import type { PremiumMomentumApi } from '../features/momentum/premium/usePremiumMomentum';
import { PremiumHomeView } from '../features/premium/PremiumHome';
import type { PremiumHomeApi } from '../features/premium/usePremiumHome';
import { capabilityViews, premiumHomeCopyFor } from '../monetization/premiumHomeCopy';
import type { PremiumHomeState } from '../monetization/premiumHomeState';
import { premiumCopyFor } from '../monetization/premiumCopy';
import type { PremiumFeatureState } from '../monetization/premiumFeatureState';
import type { PremiumFeatureApi, PremiumUpgradeApi } from '../monetization/PremiumStateProvider';

/**
 * HK-FE-UI-02 Phase 3 evidence: the REAL Premium panels and Premium Home view, driven by FIXED api objects built from the real copy
 * builders (`premiumCopyFor`, `premiumHomeCopyFor`, `capabilityViews`). No server, store or purchase is involved; every action is inert.
 * `/gallery?mode=premium&state=<home-active|home-free|home-pending|dailyload|dailyload-upgrade|momentum|momentum-upgrade>`.
 *
 * What it cannot show: the review sheets (pressures, proposals, patterns) need a full household review object; those are asserted
 * structurally by tests/premiumDomain/*Ui.test.mjs and are NOT RUN visually.
 */

const noop = async () => {};
const upgrade: PremiumUpgradeApi = { start: async () => ({ kind: 'cancelled' }), presenting: false, notice: null };

const feature = (state: PremiumFeatureState, name: string): PremiumFeatureApi => {
  const entitled = state.kind === 'entitled';
  return {
    state,
    copy: premiumCopyFor(state, name),
    usable: entitled,
    authorize: async () => { throw new Error('inert evidence api'); },
    refresh: noop,
    verify: noop,
    decision: null,
    clearDecision() {},
  };
};

const ENTITLED: PremiumFeatureState = { kind: 'entitled', subscription: 'active', endsOn: '2026-11-13T00:00:00Z' };
const UPGRADE: PremiumFeatureState = { kind: 'upgrade_required' };

const dailyLoad = (state: PremiumFeatureState): PremiumDailyLoadApi => ({
  feature: feature(state, 'Daily Load review'),
  upgrade,
  date: '2026-10-16' as PremiumDailyLoadApi['date'],
  panel: 'closed',
  review: null,
  proposals: [],
  receipts:
    state.kind === 'entitled'
      ? [{ id: 'r1', status: 'applied' as never, line: '“Return library books” moved to Thursday, Oct 22.', canUndo: true }]
      : [],
  notice: null,
  busyDigest: null,
  undoingId: null,
  confirming: null,
  open: noop,
  close() {},
  askApprove() {},
  cancelConfirm() {},
  approve: noop,
  dismiss: noop,
  undo: noop,
});

const momentum = (state: PremiumFeatureState): PremiumMomentumApi => ({
  feature: feature(state, 'Momentum'),
  upgrade,
  view: { kind: 'closed' } as PremiumMomentumApi['view'],
  saved: [],
  notice: null,
  approving: false,
  titleOf: () => null,
  open: noop,
  openSaved() {},
  close() {},
  approveNext: noop,
});

const MANIFEST = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'].map((featureKey) => ({
  featureKey,
  displayName: featureKey,
  tier: 'premium' as const,
  available: true,
  requiresAiConsent: false,
  minAppVersion: null,
}));

const home = (state: PremiumHomeState): PremiumHomeApi => ({
  state,
  copy: premiumHomeCopyFor(state, () => 'November 13, 2026'),
  capabilities: capabilityViews(state, MANIFEST as never),
  upgrade,
  verify: noop,
  retry: noop,
  manage: noop,
  managing: false,
  manageNotice: null,
});

export function PremiumEvidence({ state }: { state: string }) {
  return (
    <Screen bottomClearance={spacing.xxl}>
      <Overline>{`HK-FE-UI-02 · Premium presentation · ${state}`}</Overline>
      <View style={styles.body}>
        {state === 'home-active' && <PremiumHomeView hold={false} home={home({ kind: 'active', endsOn: '2026-11-13T00:00:00Z' })} />}
        {state === 'home-free' && <PremiumHomeView hold={false} home={home({ kind: 'free' })} />}
        {state === 'home-pending' && <PremiumHomeView hold={false} home={home({ kind: 'verification_pending', cause: 'delayed', canRetry: true })} />}
        {state === 'dailyload' && <PremiumDailyLoadPanel api={dailyLoad(ENTITLED)} />}
        {state === 'dailyload-upgrade' && <PremiumDailyLoadPanel api={dailyLoad(UPGRADE)} />}
        {state === 'momentum' && <PremiumMomentumPanel api={momentum(ENTITLED)} />}
        {state === 'momentum-upgrade' && <PremiumMomentumPanel api={momentum(UPGRADE)} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.xl },
});
