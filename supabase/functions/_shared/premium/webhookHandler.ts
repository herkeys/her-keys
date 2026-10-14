import { evidencePayload, parseWebhookBody } from './events.ts';
import { candidateAccountIds, planIdentity, type IdentityEvidence } from './identity.ts';
import type { LogFn, PremiumStorePort, RevenueCatApiPort } from './ports.ts';
import { applyEvent } from './projection.ts';
import { reconcileAccount } from './reconcileService.ts';
import type { DeploymentEnvironment, EventStatus, NormalizedEvent, PremiumEnvironment } from './types.ts';
import { SIGNATURE_HEADER, verifyWebhookRequest, webhookConfigProblem, type WebhookAuthConfig } from './webhookAuth.ts';

export interface WebhookDeps {
  store: PremiumStorePort;
  api: RevenueCatApiPort;
  auth: WebhookAuthConfig;
  deployment: DeploymentEnvironment;
  nowMs: () => number;
  log: LogFn;
}

export interface HandlerRequest {
  method: string;
  rawBody: Uint8Array;
  header: (name: string) => string | null;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

const MAX_CAS_ATTEMPTS = 4;

/** Staging and local accept SANDBOX events only; production accepts PRODUCTION only. The other kind is kept as evidence, never granted. */
export const acceptedEnvironment = (deployment: DeploymentEnvironment): PremiumEnvironment => (deployment === 'production' ? 'PRODUCTION' : 'SANDBOX');

/**
 * The RevenueCat webhook endpoint, as a pure request -> response function.
 *
 *   authenticate -> parse (allow-list) -> environment gate -> DURABLE, idempotent receipt -> process -> 200
 *
 * HTTP 200 is returned only after the event is durably stored (RevenueCat retries any other status). A processing failure AFTER the
 * receipt is still a 200 (the event is safe and the backlog processor retries it, dead-lettering after five attempts); a failure to
 * store is a 5xx so RevenueCat retries. Responses and logs carry reason codes only, never payload content.
 */
export async function handleWebhook(deps: WebhookDeps, request: HandlerRequest): Promise<HandlerResponse> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };

  if (webhookConfigProblem(deps.auth) !== null) {
    deps.log({ op: 'webhook', outcome: 'misconfigured' });
    return { status: 503, body: { error: 'not_configured' } };
  }

  const verified = await verifyWebhookRequest({
    rawBody: request.rawBody,
    authorizationHeader: request.header('authorization'),
    signatureHeader: request.header(SIGNATURE_HEADER),
    config: deps.auth,
    nowMs: deps.nowMs(),
  });
  if (!verified.ok) {
    deps.log({ op: 'webhook', outcome: 'unauthorized', reason: verified.reason });
    return { status: 401, body: { error: 'unauthorized' } };
  }

  const parsed = parseWebhookBody(request.rawBody);
  if (!parsed.ok) {
    deps.log({ op: 'webhook', outcome: 'invalid_payload', reason: parsed.reason });
    return { status: 400, body: { error: 'invalid_payload' } };
  }
  const event = parsed.event;

  let runtime;
  let receipt;
  try {
    runtime = await deps.store.getRuntime();
    receipt = await deps.store.recordEvent(event, evidencePayload(event));
  } catch {
    deps.log({ op: 'webhook', outcome: 'store_unavailable', eventType: event.event_type });
    return { status: 503, body: { error: 'temporarily_unavailable' } };
  }

  if (event.environment !== acceptedEnvironment(deps.deployment)) {
    if (!receipt.duplicate) await safeStatus(deps, receipt.id, 'ignored_environment', null, 'environment_mismatch');
    deps.log({ op: 'webhook', outcome: 'ignored_environment', eventType: event.event_type });
    return { status: 200, body: { status: 'ignored_environment' } };
  }

  // A duplicate whose first delivery already finished is acknowledged. One that never finished is processed now (idempotently).
  if (receipt.duplicate && receipt.status !== 'received' && receipt.status !== 'failed') {
    deps.log({ op: 'webhook', outcome: 'duplicate', eventType: event.event_type });
    return { status: 200, body: { status: 'duplicate' } };
  }
  if (!runtime.webhookProcessing) {
    deps.log({ op: 'webhook', outcome: 'stored_processing_halted', eventType: event.event_type });
    return { status: 200, body: { status: 'stored' } };
  }

  const status = await processStoredEvent(deps, receipt.id, event);
  deps.log({ op: 'webhook', outcome: status, eventType: event.event_type });
  return { status: 200, body: { status } };
}

async function safeStatus(deps: WebhookDeps, id: string, status: EventStatus, accountId: string | null, code: string | null): Promise<EventStatus | null> {
  try {
    return await deps.store.setEventStatus(id, status, accountId, code);
  } catch {
    return null;
  }
}

/** Processes one durably stored event. Never throws: a failure is recorded on the event for the backlog processor. */
export async function processStoredEvent(deps: WebhookDeps, id: string, event: NormalizedEvent): Promise<EventStatus> {
  let accountForStatus: string | null = null;
  try {
    const resolved = await deps.store.resolveAccounts(candidateAccountIds(event));
    const plan = planIdentity(event, resolved);
    await registerEvidence(deps, plan.evidence);

    if (plan.kind === 'none') {
      const status: EventStatus = event.event_type === 'TEST' ? 'ignored_test' : 'ignored_unknown';
      return await finish(deps, id, status, null, status === 'ignored_test' ? null : 'unresolvable_subscriber');
    }

    if (plan.kind === 'transfer' || plan.kind === 'ambiguous') {
      // Ownership is whatever RevenueCat's own record says for each exact App User ID. Nothing is granted from the event itself.
      for (const accountId of plan.accountIds) await reconcileStrict(deps, accountId);
      return await finish(deps, id, plan.kind === 'ambiguous' ? 'ambiguous' : 'processed', plan.accountIds[0] ?? null, null);
    }

    const accountId = plan.accountId;
    accountForStatus = accountId;
    let needsReconcile = false;
    let disposition = 'stale';
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const stored = await deps.store.getProjection(accountId);
      const result = applyEvent(stored?.projection ?? null, event);
      needsReconcile = result.reconcile;
      disposition = result.disposition;
      if (result.projection === null) break;
      const written = await deps.store.applyProjection(accountId, stored?.version ?? 0, result.projection);
      if (written.applied) break;
      if (attempt === MAX_CAS_ATTEMPTS - 1) throw new Error('cas_conflict');
    }
    if (needsReconcile) await reconcileStrict(deps, accountId);

    const status: EventStatus = disposition === 'ignored_test' ? 'ignored_test' : disposition === 'ignored_unknown' ? 'ignored_unknown' : 'processed';
    return await finish(deps, id, status, accountId, null);
  } catch {
    const result = await safeStatus(deps, id, 'failed', accountForStatus, 'processing_error');
    return result ?? 'failed';
  }
}

/**
 * A reconcile this event NEEDS must actually happen. If RevenueCat cannot be reached the event is marked `failed` (and retried by the
 * backlog, dead-lettering after five attempts) rather than recorded as processed, which would silently drop the signal.
 */
async function reconcileStrict(deps: WebhookDeps, accountId: string): Promise<void> {
  const status = await reconcileAccount(
    { store: deps.store, api: deps.api, deployment: deps.deployment, nowMs: deps.nowMs, log: deps.log },
    accountId,
    { force: true },
  );
  if (status !== 'reconciled') throw new Error(`reconcile_${status}`);
}

async function finish(deps: WebhookDeps, id: string, status: EventStatus, accountId: string | null, code: string | null): Promise<EventStatus> {
  return await deps.store.setEventStatus(id, status, accountId, code);
}

async function registerEvidence(deps: WebhookDeps, evidence: IdentityEvidence[]): Promise<void> {
  for (const item of evidence) {
    if (item.kind === 'anonymous') await deps.store.registerIdentity(item.providerUserId, null, 'anonymous', 'webhook');
    else if (item.accountId !== null) await deps.store.registerIdentity(item.providerUserId, item.accountId, item.kind, 'webhook');
  }
}

/**
 * Operator-driven backlog recovery: re-process events still `received`/`failed` (oldest first). Dead-lettering after five failures is
 * enforced by the store. Safe to run repeatedly: every step is idempotent.
 */
export async function processBacklog(deps: WebhookDeps, limit: number): Promise<{ attempted: number; processed: number; stillFailing: number }> {
  const runtime = await deps.store.getRuntime();
  if (!runtime.webhookProcessing) return { attempted: 0, processed: 0, stillFailing: 0 };
  const batch = await deps.store.listBacklog(Math.max(1, Math.min(limit, 200)));
  let processed = 0;
  let stillFailing = 0;
  for (const item of batch) {
    const status = await processStoredEvent(deps, item.id, item.event);
    if (status === 'failed' || status === 'dead_letter') stillFailing += 1;
    else processed += 1;
  }
  return { attempted: batch.length, processed, stillFailing };
}
