import type { LogFn, PremiumStorePort, RevenueCatApiPort } from './ports.ts';
import { mergeReconciled, parseSubscriberResponse } from './reconcile.ts';
import type { DeploymentEnvironment } from './types.ts';

export interface ReconcileDeps {
  store: PremiumStorePort;
  api: RevenueCatApiPort;
  deployment: DeploymentEnvironment;
  nowMs: () => number;
  log: LogFn;
}

export type ReconcileStatus = 'reconciled' | 'rate_limited' | 'provider_unavailable' | 'invalid_response' | 'conflict';

const MAX_CAS_ATTEMPTS = 4;

/**
 * Reads RevenueCat's authenticated subscriber record for the EXACT App User ID (the Supabase account UUID) and writes the projection.
 * Bounded: a user-initiated call passes the per-account claim gate (minimum interval with exponential backoff on failure); a
 * server-initiated one (a transfer, an ambiguity, backlog repair) is `force` and bounded by the event rate instead.
 *
 * It never lets one account's reconcile touch another's row, and the result cannot be edited by the account it describes.
 */
export async function reconcileAccount(deps: ReconcileDeps, accountId: string, options: { force: boolean }): Promise<ReconcileStatus> {
  const started = deps.nowMs();
  if (!options.force && !(await deps.store.reconcileClaim(accountId))) {
    deps.log({ op: 'reconcile', outcome: 'rate_limited' });
    return 'rate_limited';
  }
  const fetched = await deps.api.getSubscriber(accountId);
  if (!fetched.ok) {
    await deps.store.reconcileReport(accountId, 'failed');
    deps.log({ op: 'reconcile', outcome: 'provider_unavailable', providerStatus: fetched.status });
    return 'provider_unavailable';
  }
  const parsed = parseSubscriberResponse(fetched.body, deps.nowMs(), deps.deployment);
  if (!parsed.ok) {
    await deps.store.reconcileReport(accountId, 'failed');
    deps.log({ op: 'reconcile', outcome: 'invalid_response' });
    return 'invalid_response';
  }
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const stored = await deps.store.getProjection(accountId);
    const merged = mergeReconciled(stored?.projection ?? null, parsed.projection);
    const result = await deps.store.applyProjection(accountId, stored?.version ?? 0, merged);
    if (result.applied) {
      await deps.store.reconcileReport(accountId, 'ok');
      deps.log({ op: 'reconcile', outcome: 'reconciled', latencyMs: deps.nowMs() - started, attempts: attempt + 1 });
      return 'reconciled';
    }
  }
  await deps.store.reconcileReport(accountId, 'failed');
  deps.log({ op: 'reconcile', outcome: 'conflict' });
  return 'conflict';
}
