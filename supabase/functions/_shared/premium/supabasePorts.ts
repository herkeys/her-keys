// Production adapter for PremiumStorePort over the service-role Supabase client. DENO ONLY (not imported by the app test suite).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import type { AuthorizeArgs, PremiumStorePort } from './ports.ts';
import type { AuthorizationDecision, DeploymentEnvironment, EntitlementState, EventStatus, NormalizedEvent, Projection } from './types.ts';

function fail(op: string, error: { message?: string; code?: string } | null): never {
  // Reason codes only: a database error message may quote row content.
  throw new Error(`${op}_failed${error?.code ? `:${error.code}` : ''}`);
}

const PROJECTION_COLUMNS =
  'source,environment,product_id,store,has_entitlement,expires_at,grace_expires_at,canceled_at,billing_issue_at,revoked_at,expiration_confirmed_at,clocks,last_event_ms,last_reconciled_at,needs_reconcile,version';

export function createSupabaseStore(client: SupabaseClient): PremiumStorePort {
  return {
    async getRuntime() {
      const { data, error } = await client
        .from('premium_runtime_config')
        .select('environment,webhook_processing,premium_enabled')
        .eq('singleton', true)
        .single();
      if (error || !data) fail('runtime', error);
      return {
        environment: data.environment as DeploymentEnvironment,
        webhookProcessing: data.webhook_processing as boolean,
        premiumEnabled: data.premium_enabled as boolean,
      };
    },

    async recordEvent(event, payload) {
      const { data, error } = await client.rpc('premium_record_event', {
        p_event: { ...event, payload },
      });
      if (error || !data) fail('record_event', error);
      return { id: data.id as string, duplicate: data.duplicate as boolean, status: data.status as EventStatus };
    },

    async setEventStatus(id, status, accountId, errorCode) {
      const { data, error } = await client.rpc('premium_event_set_status', {
        p_id: id,
        p_status: status,
        p_account: accountId,
        p_error: errorCode,
      });
      if (error) fail('set_event_status', error);
      return data as EventStatus;
    },

    async listBacklog(limit) {
      const { data, error } = await client
        .from('premium_events')
        .select('id,event_id,event_type,environment,event_timestamp_ms,app_user_id,original_app_user_id,aliases,transferred_from,transferred_to,payload')
        .in('status', ['received', 'failed'])
        .order('received_at', { ascending: true })
        .limit(limit);
      if (error) fail('list_backlog', error);
      return (data ?? []).map((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const event: NormalizedEvent = {
          event_id: row.event_id,
          event_type: row.event_type,
          environment: row.environment,
          event_timestamp_ms: row.event_timestamp_ms,
          app_user_id: row.app_user_id,
          original_app_user_id: row.original_app_user_id,
          aliases: row.aliases ?? [],
          transferred_from: row.transferred_from ?? [],
          transferred_to: row.transferred_to ?? [],
          entitlement_ids: (payload.entitlement_ids as string[] | null) ?? null,
          product_id: (payload.product_id as string | null) ?? null,
          new_product_id: (payload.new_product_id as string | null) ?? null,
          store: (payload.store as string | null) ?? null,
          expiration_at_ms: (payload.expiration_at_ms as number | null) ?? null,
          purchased_at_ms: (payload.purchased_at_ms as number | null) ?? null,
          grace_period_expiration_at_ms: (payload.grace_period_expiration_at_ms as number | null) ?? null,
          cancel_reason: (payload.cancel_reason as string | null) ?? null,
          expiration_reason: (payload.expiration_reason as string | null) ?? null,
          period_type: (payload.period_type as string | null) ?? null,
        };
        return { id: row.id as string, event };
      });
    },

    async resolveAccounts(ids) {
      const out = new Map<string, string>();
      if (ids.length === 0) return out;
      const { data, error } = await client.rpc('premium_resolve_accounts', { p_ids: ids });
      if (error) fail('resolve_accounts', error);
      for (const row of (data ?? []) as Array<{ provider_user_id: string; account_id: string }>) out.set(row.provider_user_id, row.account_id);
      return out;
    },

    async registerIdentity(providerUserId, accountId, kind, source) {
      const { data, error } = await client.rpc('premium_register_identity', {
        p_provider_user_id: providerUserId,
        p_account: accountId,
        p_kind: kind,
        p_source: source,
      });
      if (error) fail('register_identity', error);
      return data as 'verified' | 'ambiguous' | 'rejected';
    },

    async getProjection(accountId) {
      const { data, error } = await client.from('premium_entitlements').select(PROJECTION_COLUMNS).eq('account_id', accountId).maybeSingle();
      if (error) fail('get_projection', error);
      if (!data) return null;
      const { version, ...projection } = data as Record<string, unknown>;
      return { version: Number(version), projection: projection as unknown as Projection };
    },

    async applyProjection(accountId, expectedVersion, projection) {
      const { data, error } = await client.rpc('premium_apply_projection', {
        p_account: accountId,
        p_expected_version: expectedVersion,
        p_fields: projection,
      });
      if (error || !data) fail('apply_projection', error);
      return { applied: data.applied as boolean, version: (data.version as number | null) ?? null };
    },

    async reconcileClaim(accountId) {
      const { data, error } = await client.rpc('premium_reconcile_claim', { p_account: accountId });
      if (error) fail('reconcile_claim', error);
      return data === true;
    },

    async reconcileReport(accountId, outcome) {
      const { error } = await client.rpc('premium_reconcile_report', { p_account: accountId, p_outcome: outcome });
      if (error) fail('reconcile_report', error);
    },

    async getState(accountId) {
      const { data, error } = await client.rpc('premium_entitlement_state', { p_account: accountId });
      if (error) fail('get_state', error);
      return data as EntitlementState;
    },

    async authorize(args: AuthorizeArgs) {
      const { data, error } = await client.rpc('premium_authorize', {
        p_account: args.accountId,
        p_feature: args.feature,
        p_household: args.householdId,
        p_idempotency_key: args.idempotencyKey,
        p_request_id: args.requestId,
        p_app_version: args.appVersion,
        p_units: args.units,
        p_complete_now: args.completeNow,
      });
      if (error || !data) fail('authorize', error);
      return data as AuthorizationDecision;
    },

    async completeUsage(accountId, feature, idempotencyKey) {
      const { data, error } = await client.rpc('premium_complete_usage', { p_account: accountId, p_feature: feature, p_idempotency_key: idempotencyKey });
      if (error) fail('complete_usage', error);
      return data as string;
    },

    async failUsage(accountId, feature, idempotencyKey) {
      const { data, error } = await client.rpc('premium_fail_usage', { p_account: accountId, p_feature: feature, p_idempotency_key: idempotencyKey });
      if (error) fail('fail_usage', error);
      return data as string;
    },
  };
}
