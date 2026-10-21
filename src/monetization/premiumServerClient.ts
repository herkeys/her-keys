import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { premiumRpc, premiumInvoke, type PremiumRequestOwner } from './premiumRequestOwner';
import {
  AUTHORIZATION_REASONS,
  EXTRACT_AMBIGUITIES,
  EXTRACT_UNSUPPORTED_REASONS,
  NEXT_ACTIONS,
  SERVER_ENTITLEMENT_STATES,
  type ExtractRequest,
  type ExtractResult,
  type Extraction,
  type GateRequest,
  type GateResult,
  type ManifestEntry,
  type PremiumServerClient,
  type ServerEntitlement,
  type VerifyStatus,
} from './premiumTypes';

/**
 * The Supabase implementation of `PremiumServerClient`. Every response is PARSED against a strict schema: a malformed or unexpected
 * server answer is `unavailable`, never an interpretation. Nothing here reads RevenueCat; nothing here grants anything.
 */
const Instant = z.string().min(1).max(40);

const EntitlementSchema = z.object({
  state: z.enum(SERVER_ENTITLEMENT_STATES),
  expiresAt: Instant.nullable().optional(),
  graceExpiresAt: Instant.nullable().optional(),
  canceled: z.boolean().optional(),
  needsReconcile: z.boolean().optional(),
  checkedAt: Instant.optional(),
  periodType: z.enum(['TRIAL', 'INTRO', 'NORMAL']).nullable().optional(),
  periodStartedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  trialEndsAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

const ManifestSchema = z.array(
  z.object({
    featureKey: z.string().min(1).max(64),
    displayName: z.string().min(1).max(120),
    tier: z.enum(['free', 'premium']),
    available: z.boolean(),
    requiresAiConsent: z.boolean(),
    minAppVersion: z.string().max(20).nullable().optional(),
  }),
);

const QuotaSchema = z.object({
  period: z.enum(['day', 'month']),
  periodStart: z.string(),
  periodEnd: z.string(),
  used: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
});

const DecisionSchema = z.object({
  outcome: z.enum(['allowed', 'denied']),
  reason: z.enum(AUTHORIZATION_REASONS),
  entitlementState: z.enum(SERVER_ENTITLEMENT_STATES).optional(),
  via: z.enum(['premium', 'free_allowance', 'free']).nullable().optional(),
  nextAction: z.enum(NEXT_ACTIONS).optional(),
  quota: QuotaSchema.nullable().optional(),
  decisionId: z.string().nullable().optional(),
  replay: z.boolean().optional(),
});

const VerifySchema = z.object({ status: z.enum(['reconciled', 'rate_limited', 'provider_unavailable', 'invalid_response', 'conflict']) });

const ExtractionSchema = z.object({
  proposals: z.array(
    z.object({
      key: z.string().min(1).max(12),
      kind: z.enum(['task', 'event', 'needsMe']),
      title: z.string().min(1).max(200),
      quote: z.string().max(300),
      span: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      startMinutes: z.number().int().min(0).max(1439).nullable(),
      endMinutes: z.number().int().min(1).max(1440).nullable(),
      durationMinutes: z.number().int().min(1).max(1440).nullable(),
      amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable(),
      direction: z.enum(['outflow', 'inflow']).nullable(),
      childRef: z.string().max(12).nullable(),
      childAmbiguous: z.boolean(),
      category: z.string().max(24).nullable(),
      hedged: z.boolean(),
      ambiguity: z.array(z.enum(EXTRACT_AMBIGUITIES)).max(3),
    }),
  ).max(8),
  unsupported: z.array(
    z.object({
      reason: z.enum(EXTRACT_UNSUPPORTED_REASONS),
      span: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
      person: z.object({ name: z.string().max(80), known: z.boolean() }).nullable(),
    }),
  ).max(8),
  dropped: z.number().int().nonnegative(),
});

const ExtractResponseSchema = z.object({
  status: z.enum(['ok', 'denied', 'replayed', 'unavailable', 'invalid_output', 'invalid_request']),
  extraction: ExtractionSchema.optional(),
  via: z.enum(['premium', 'free_allowance']).nullable().optional(),
  decision: DecisionSchema.optional(),
  reason: z.string().max(40).optional(),
});

function httpStatus(error: unknown): number | null {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * The body of a function answer. supabase-js returns the parsed body as `data` for 2xx, but for a non-2xx it returns `data: null` and
 * leaves the body on `error.context` (a Response). The server's typed 503/502 answers ("provider_unavailable", "invalid_output") are
 * answers, not transport failures, so they are read from there.
 */
async function bodyOf(data: unknown, error: unknown): Promise<unknown> {
  if (data !== null && data !== undefined) return data;
  const context = (error as { context?: { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } } } | null)?.context;
  if (!context) return null;
  try {
    return typeof context.clone === 'function' ? await context.clone().json() : typeof context.json === 'function' ? await context.json() : null;
  } catch {
    return null;
  }
}

const PurchaseReadinessSchema = z.object({ ready: z.boolean(), reason: z.string().max(48) });

export function createPremiumServerClient(client: SupabaseClient, owner?: PremiumRequestOwner): PremiumServerClient {
  return {
    forAccount: (scope) => createPremiumServerClient(client, scope),
    async purchaseReadiness() {
      let deadline: ReturnType<typeof setTimeout> | null = null;
      try {
        const answer = await Promise.race([
          premiumRpc(client, owner, process.env.EXPO_PUBLIC_REVENUECAT_STORE === 'test' ? 'premium_test_store_purchase_readiness' : 'premium_purchase_readiness'),
          new Promise<{ data: null; error: Error }>((resolve) => {
            deadline = setTimeout(() => resolve({ data: null, error: new Error('purchase_readiness_timeout') }), 8000);
          }),
        ]);
        if (answer.error) return { ready: false, reason: 'unavailable' };
        const parsed = PurchaseReadinessSchema.safeParse(answer.data);
        return parsed.success ? parsed.data : { ready: false, reason: 'malformed' };
      } catch {
        return { ready: false, reason: 'unavailable' };
      } finally {
        if (deadline !== null) clearTimeout(deadline);
      }
    },
    async entitlement() {
      try {
        const { data, error } = await premiumRpc(client, owner, 'premium_my_entitlement');
        if (error) return { kind: 'unavailable' };
        const parsed = EntitlementSchema.safeParse(data);
        if (!parsed.success) return { kind: 'unavailable' };
        const value: ServerEntitlement = {
          state: parsed.data.state,
          expiresAt: parsed.data.expiresAt ?? null,
          graceExpiresAt: parsed.data.graceExpiresAt ?? null,
          canceled: parsed.data.canceled ?? false,
          needsReconcile: parsed.data.needsReconcile ?? false,
          checkedAt: parsed.data.checkedAt ?? '',
          ...(parsed.data.periodType !== undefined ? {
            periodType: parsed.data.periodType,
            periodStartedAt: parsed.data.periodStartedAt ?? null,
            trialEndsAt: parsed.data.trialEndsAt ?? null,
          } : {}),
        };
        return { kind: 'ok', value };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async manifest() {
      try {
        const { data, error } = await premiumRpc(client, owner, 'premium_feature_manifest');
        if (error) return { kind: 'unavailable' };
        const parsed = ManifestSchema.safeParse(data);
        if (!parsed.success) return { kind: 'unavailable' };
        const entries: ManifestEntry[] = parsed.data.map((entry) => ({ ...entry, minAppVersion: entry.minAppVersion ?? null }));
        return { kind: 'ok', entries };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async verify() {
      try {
        const { data, error } = await premiumInvoke(client, owner, 'premium-reconcile', {});
        // A 503 still carries a typed status ("provider_unavailable"): it is an answer, not a transport failure.
        if (error && httpStatus(error) !== 503) return { kind: 'unavailable' };
        const parsed = VerifySchema.safeParse(await bodyOf(data, error));
        if (!parsed.success) return { kind: 'unavailable' };
        return { kind: 'ok', status: parsed.data.status as VerifyStatus };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async authorize(request: GateRequest): Promise<GateResult> {
      try {
        const { data, error } = await premiumInvoke(client, owner, 'premium-gate', request);
        const status = httpStatus(error);
        // 400 = the server judged the REQUEST malformed. Distinct from "could not reach it".
        if (error && status === 400) return { kind: 'invalid' };
        if (error && status !== 503) return { kind: 'unavailable' };
        const parsed = DecisionSchema.safeParse(await bodyOf(data, error));
        if (!parsed.success) return { kind: 'unavailable' };
        const d = parsed.data;
        return {
          kind: 'decision',
          decision: {
            outcome: d.outcome,
            reason: d.reason,
            entitlementState: d.entitlementState ?? 'unknown',
            via: d.via ?? null,
            nextAction: d.nextAction ?? 'none',
            quota: d.quota ?? null,
            decisionId: d.decisionId ?? null,
            replay: d.replay ?? false,
          },
        };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async extract(request: ExtractRequest): Promise<ExtractResult> {
      try {
        const { data, error } = await premiumInvoke(client, owner, 'smart-inbox-extract', request);
        const status = httpStatus(error);
        // Only 2xx and the server's own typed 400/502/503 are ANSWERS; anything else (401, 500, a gateway page) is "could not reach it".
        if (error && status !== 400 && status !== 502 && status !== 503) return { kind: 'unavailable', reason: 'transport' };
        const parsed = ExtractResponseSchema.safeParse(await bodyOf(data, error));
        if (!parsed.success) return { kind: 'unavailable', reason: 'malformed' };
        const body = parsed.data;
        switch (body.status) {
          case 'ok':
            return body.extraction ? { kind: 'ok', extraction: body.extraction as Extraction, via: body.via ?? 'premium' } : { kind: 'unavailable', reason: 'malformed' };
          case 'denied': {
            const d = body.decision;
            if (!d) return { kind: 'unavailable', reason: 'malformed' };
            return {
              kind: 'denied',
              decision: {
                outcome: d.outcome,
                reason: d.reason,
                entitlementState: d.entitlementState ?? 'unknown',
                via: d.via ?? null,
                nextAction: d.nextAction ?? 'none',
                quota: d.quota ?? null,
                decisionId: d.decisionId ?? null,
                replay: d.replay ?? false,
              },
            };
          }
          case 'replayed':
            return { kind: 'replayed' };
          case 'invalid_output':
            return { kind: 'invalid_output' };
          case 'invalid_request':
            return { kind: 'invalid_request' };
          default:
            return { kind: 'unavailable', reason: body.reason ?? 'unavailable' };
        }
      } catch {
        return { kind: 'unavailable', reason: 'transport' };
      }
    },
  };
}

/** A build with no Supabase project cannot reach the server: Premium features stay honestly unavailable; Free is untouched. */
export const UNCONFIGURED_PREMIUM_SERVER: PremiumServerClient = {
  entitlement: async () => ({ kind: 'unavailable' }),
  manifest: async () => ({ kind: 'unavailable' }),
  verify: async () => ({ kind: 'unavailable' }),
  authorize: async () => ({ kind: 'unavailable' }),
  extract: async () => ({ kind: 'unavailable', reason: 'not_configured' }),
};
