import type { LogFn, PremiumStorePort } from '../ports.ts';
import type { AuthorizationDecision } from '../types.ts';
import { RESPONSE_JSON_SCHEMA, buildPrompt, parseExtractRequest, validateExtraction, type ValidExtraction } from './contract.ts';

/** The one operation this endpoint performs: server-executed, so it OWNS the reserve -> run -> complete/fail lifecycle of the usage unit. */
export const FEATURE_KEY = 'smart_inbox_extract';
export const PROVIDER_DEADLINE_MS = 12_000;

export type ProviderResult =
  | { ok: true; text: string; tokens: { input: number | null; output: number | null } }
  | { ok: false; kind: 'timeout' | 'rate_limited' | 'unavailable' | 'not_configured' };

export interface ExtractionProvider {
  /** True when a model credential is configured. Checked BEFORE a unit is reserved, so an unconfigured deployment charges nothing. */
  configured(): boolean;
  extract(input: { system: string; user: string; schema: object; deadlineMs: number }): Promise<ProviderResult>;
}

export interface SmartInboxDeps {
  store: PremiumStorePort;
  provider: ExtractionProvider;
  nowMs: () => number;
  log: LogFn;
  newRequestId: () => string;
}

export interface SmartInboxResponse {
  status: number;
  body: Record<string, unknown>;
}

const invalid = (reason: string): SmartInboxResponse => ({ status: 400, body: { status: 'invalid_request', reason } });

/**
 * POST smart-inbox-extract for a signed-in caller (`userId` is the verified JWT subject; the body can name no account).
 *
 *  1. parse the STRICT request (an unknown key, an over-long note, a malformed context are refused outright);
 *  2. the provider must be configured (otherwise nothing is reserved);
 *  3. the SERVER authorizes through the single Premium boundary: entitlement or an approved allowance, ownership of the household,
 *     the current AI Data Processing consent, quota, rate and the global cost cap. Nothing is sent to a provider before this passes;
 *  4. a replay of an already-reserved key returns `replayed` and calls NOTHING: a repeated key is never a free provider call;
 *  5. the model is called with a hard deadline; any failure RELEASES the reservation;
 *  6. the output is validated as hostile; invalid output releases the reservation;
 *  7. only a validated extraction completes the usage unit and is returned. Her words are never stored, logged or echoed.
 */
export async function handleExtract(deps: SmartInboxDeps, userId: string, body: unknown): Promise<SmartInboxResponse> {
  const parsed = parseExtractRequest(body);
  if (!parsed.ok) return invalid(parsed.reason);
  const { request } = parsed;
  const requestId = deps.newRequestId();
  const started = deps.nowMs();

  if (!deps.provider.configured()) {
    deps.log({ op: 'smart_inbox', outcome: 'not_configured' });
    return { status: 503, body: { status: 'unavailable', reason: 'not_configured', requestId } };
  }

  let decision: AuthorizationDecision;
  try {
    decision = await deps.store.authorize({
      accountId: userId,
      feature: FEATURE_KEY,
      householdId: request.householdId,
      idempotencyKey: request.idempotencyKey,
      requestId,
      appVersion: request.appVersion,
      units: 1,
      completeNow: false,
    });
  } catch {
    deps.log({ op: 'smart_inbox', outcome: 'authorize_failed' });
    return { status: 503, body: { status: 'unavailable', reason: 'authorization', requestId } };
  }

  if (decision.outcome !== 'allowed') {
    deps.log({ op: 'smart_inbox', outcome: 'denied', reason: decision.reason });
    return { status: 200, body: { status: 'denied', decision, requestId } };
  }
  if (decision.replay) {
    // The first call already used this unit. Calling the provider again would be an uncharged call: refuse it.
    deps.log({ op: 'smart_inbox', outcome: 'replayed' });
    return { status: 200, body: { status: 'replayed', requestId } };
  }

  const release = async (): Promise<void> => {
    try {
      await deps.store.failUsage(userId, FEATURE_KEY, request.idempotencyKey);
    } catch {
      // The stale-reservation sweeper frees it within the quota's reservation window.
    }
  };

  const prompt = buildPrompt(request);
  const provided = await deps.provider.extract({ system: prompt.system, user: prompt.user, schema: RESPONSE_JSON_SCHEMA, deadlineMs: PROVIDER_DEADLINE_MS });
  const latencyMs = deps.nowMs() - started;
  if (!provided.ok) {
    await release();
    deps.log({ op: 'smart_inbox', outcome: 'provider_failed', kind: provided.kind, latencyMs });
    return { status: 503, body: { status: 'unavailable', reason: provided.kind, requestId } };
  }

  const validated = validateExtraction(provided.text, request);
  if (!validated.ok) {
    await release();
    deps.log({ op: 'smart_inbox', outcome: 'invalid_output', reason: validated.reason, latencyMs });
    return { status: 502, body: { status: 'invalid_output', requestId } };
  }
  const extraction: ValidExtraction = validated.extraction;

  try {
    await deps.store.completeUsage(userId, FEATURE_KEY, request.idempotencyKey);
  } catch {
    // The reservation expires and refunds itself; the customer still gets the reading she was authorized for.
  }
  deps.log({
    op: 'smart_inbox',
    outcome: 'ok',
    latencyMs,
    proposals: extraction.proposals.length,
    unsupported: extraction.unsupported.length,
    dropped: extraction.dropped,
    inputTokens: provided.tokens.input,
    outputTokens: provided.tokens.output,
    via: decision.via,
  });
  return { status: 200, body: { status: 'ok', extraction, via: decision.via, requestId } };
}
