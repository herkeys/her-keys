import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  AUTHORIZATION_REASONS,
  NEXT_ACTIONS,
  SERVER_ENTITLEMENT_STATES,
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

function httpStatus(error: unknown): number | null {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : null;
}

export function createPremiumServerClient(client: SupabaseClient): PremiumServerClient {
  return {
    async entitlement() {
      try {
        const { data, error } = await client.rpc('premium_my_entitlement');
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
        };
        return { kind: 'ok', value };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async manifest() {
      try {
        const { data, error } = await client.rpc('premium_feature_manifest');
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
        const { data, error } = await client.functions.invoke('premium-reconcile', { body: {} });
        // A 503 still carries a typed status ("provider_unavailable"): it is an answer, not a transport failure.
        if (error && httpStatus(error) !== 503) return { kind: 'unavailable' };
        const parsed = VerifySchema.safeParse(data);
        if (!parsed.success) return { kind: 'unavailable' };
        return { kind: 'ok', status: parsed.data.status as VerifyStatus };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async authorize(request: GateRequest): Promise<GateResult> {
      try {
        const { data, error } = await client.functions.invoke('premium-gate', { body: request });
        const status = httpStatus(error);
        // 400 = the server judged the REQUEST malformed. Distinct from "could not reach it".
        if (error && status === 400) return { kind: 'invalid' };
        if (error && status !== 503) return { kind: 'unavailable' };
        const parsed = DecisionSchema.safeParse(data);
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
  };
}

/** A build with no Supabase project cannot reach the server: Premium features stay honestly unavailable; Free is untouched. */
export const UNCONFIGURED_PREMIUM_SERVER: PremiumServerClient = {
  entitlement: async () => ({ kind: 'unavailable' }),
  manifest: async () => ({ kind: 'unavailable' }),
  verify: async () => ({ kind: 'unavailable' }),
  authorize: async () => ({ kind: 'unavailable' }),
};
