import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { premiumAuthorization, premiumRpc, type PremiumRequestOwner } from './premiumRequestOwner';

/**
 * The client side of the shared Premium decision ledger (supabase/migrations/20261015130000_premium_decision_ledger.sql).
 *
 * The ledger holds typed REFERENCES and minimal undo snapshots — never titles, notes or amounts. It is written only through the
 * server's two state-machine functions, and only for an operation the server has authorized. Every response is parsed strictly;
 * a malformed answer is `unavailable`, never an interpretation.
 */
export const LEDGER_STATUSES = ['proposed', 'approved', 'rejected', 'applying', 'applied', 'failed', 'reverted', 'revert_blocked', 'abandoned'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export interface LedgerRow {
  id: string;
  featureKey: string;
  kind: string;
  status: LedgerStatus;
  idempotencyKey: string;
  proposalRef: Record<string, unknown>;
  sourceRef: Record<string, unknown> | null;
  proposalDigest: string;
  corrected: boolean;
  beforeSnapshot: Record<string, unknown> | null;
  plannedSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  failureCode: string | null;
  proposedAt: string;
  appliedAt: string | null;
  revertedAt: string | null;
  updatedAt: string;
}

export interface LedgerRecordInput {
  householdId: string;
  featureKey: string;
  kind: string;
  idempotencyKey: string;
  proposalRef: Record<string, unknown>;
  sourceRef?: Record<string, unknown> | null;
  proposalDigest: string;
  before?: Record<string, unknown> | null;
  planned?: Record<string, unknown> | null;
  inverse?: Record<string, unknown> | null;
}

export type LedgerPatch = {
  after_snapshot?: Record<string, unknown>;
  planned_snapshot?: Record<string, unknown>;
  result_ref?: Record<string, unknown> | Array<Record<string, unknown>>;
  failure_code?: string;
  corrected?: boolean;
};

export type LedgerResult<T> = { kind: 'ok'; value: T } | { kind: 'refused'; code: 'not_authorized' | 'ownership_denied' | 'duplicate' | 'idempotency_conflict' | 'illegal_transition' | 'not_found' | 'rejected' } | { kind: 'unavailable' };

export interface PremiumLedgerClient {
  forAccount?(owner: PremiumRequestOwner): PremiumLedgerClient;
  record(input: LedgerRecordInput): Promise<LedgerResult<LedgerRow>>;
  transition(id: string, to: LedgerStatus, patch?: LedgerPatch): Promise<LedgerResult<LedgerRow>>;
  /** The caller's OWN receipts (RLS), newest first. Readable whatever the subscription state. */
  list(featureKey: string, householdId: string, limit: number): Promise<LedgerResult<LedgerRow[]>>;
}

const Json = z.record(z.string(), z.unknown());
const RowSchema = z.object({
  id: z.string().min(1),
  feature_key: z.string(),
  kind: z.string(),
  status: z.enum(LEDGER_STATUSES),
  idempotency_key: z.string(),
  proposal_ref: Json,
  source_ref: Json.nullable().optional(),
  proposal_digest: z.string(),
  corrected: z.boolean().optional(),
  before_snapshot: Json.nullable().optional(),
  planned_snapshot: Json.nullable().optional(),
  after_snapshot: Json.nullable().optional(),
  failure_code: z.string().nullable().optional(),
  proposed_at: z.string(),
  applied_at: z.string().nullable().optional(),
  reverted_at: z.string().nullable().optional(),
  updated_at: z.string(),
});

function toRow(data: unknown): LedgerRow | null {
  const parsed = RowSchema.safeParse(data);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id, featureKey: r.feature_key, kind: r.kind, status: r.status, idempotencyKey: r.idempotency_key, proposalRef: r.proposal_ref,
    sourceRef: r.source_ref ?? null, proposalDigest: r.proposal_digest, corrected: r.corrected ?? false, beforeSnapshot: r.before_snapshot ?? null,
    plannedSnapshot: r.planned_snapshot ?? null, afterSnapshot: r.after_snapshot ?? null, failureCode: r.failure_code ?? null,
    proposedAt: r.proposed_at, appliedAt: r.applied_at ?? null, revertedAt: r.reverted_at ?? null, updatedAt: r.updated_at,
  };
}

/** Maps the server's refusal to a typed code. Messages are matched by their stable tokens, never shown to her. */
function refusal(error: { code?: string; message?: string } | null): LedgerResult<never> {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/not_authorized/.test(text)) return { kind: 'refused', code: 'not_authorized' };
  if (/ownership_denied/.test(text)) return { kind: 'refused', code: 'ownership_denied' };
  if (/idempotency_conflict/.test(text)) return { kind: 'refused', code: 'idempotency_conflict' };
  if (/23505|premium_decisions_one_live_proposal/.test(text)) return { kind: 'refused', code: 'duplicate' };
  if (/illegal_transition|22023/.test(text)) return { kind: 'refused', code: 'illegal_transition' };
  if (/not_found|P0002/.test(text)) return { kind: 'refused', code: 'not_found' };
  if (/42501|23514|check_violation/.test(text)) return { kind: 'refused', code: 'rejected' };
  return { kind: 'unavailable' };
}

export function createPremiumLedgerClient(client: SupabaseClient, owner?: PremiumRequestOwner): PremiumLedgerClient {
  return {
    forAccount: (scope) => createPremiumLedgerClient(client, scope),
    async record(input) {
      try {
        const { data, error } = await premiumRpc(client, owner, 'premium_decision_record', {
          p_household: input.householdId,
          p_feature: input.featureKey,
          p_kind: input.kind,
          p_idempotency_key: input.idempotencyKey,
          p_proposal_ref: input.proposalRef,
          p_proposal_digest: input.proposalDigest,
          p_source_ref: input.sourceRef ?? null,
          p_before: input.before ?? null,
          p_planned: input.planned ?? null,
          p_inverse: input.inverse ?? null,
        });
        if (error) return refusal(error);
        const row = toRow(data);
        return row === null ? { kind: 'unavailable' } : { kind: 'ok', value: row };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async transition(id, to, patch = {}) {
      try {
        const { data, error } = await premiumRpc(client, owner, 'premium_decision_transition', { p_id: id, p_to: to, p_patch: patch });
        if (error) return refusal(error);
        const row = toRow(data);
        return row === null ? { kind: 'unavailable' } : { kind: 'ok', value: row };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async list(featureKey, householdId, limit) {
      try {
        const authorization = await premiumAuthorization(client, owner);
        const request = client
          .from('premium_decisions')
          .select('*')
          .eq('feature_key', featureKey)
          .eq('household_id', householdId)
          .order('updated_at', { ascending: false })
          .limit(Math.max(1, Math.min(limit, 100)));
        const { data, error } = await (authorization ? request.setHeader('Authorization', authorization) : request);
        if (error) return { kind: 'unavailable' };
        const rows: LedgerRow[] = [];
        for (const item of data ?? []) {
          const row = toRow(item);
          if (row === null) return { kind: 'unavailable' };
          rows.push(row);
        }
        return { kind: 'ok', value: rows };
      } catch {
        return { kind: 'unavailable' };
      }
    },
  };
}

export const UNCONFIGURED_PREMIUM_LEDGER: PremiumLedgerClient = {
  record: async () => ({ kind: 'unavailable' }),
  transition: async () => ({ kind: 'unavailable' }),
  list: async () => ({ kind: 'unavailable' }),
};
