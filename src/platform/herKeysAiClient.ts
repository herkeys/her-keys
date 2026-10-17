import type { SupabaseClient } from '@supabase/supabase-js';
import { HER_KEYS_CONSENT_VERSIONS } from '../domain/consent';
import {
  parseHerKeysAiTurn,
  type HerKeysAiRequest,
  type HerKeysAiTurn,
} from '../features/talk-it-out/providerContract';

export type HerKeysAiCall =
  | { kind: 'ready'; value: HerKeysAiTurn }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'invalid'; reason: string };

export interface HerKeysAiClient {
  advance(input: HerKeysAiRequest, owner: { accountId: string | null; signal: AbortSignal }): Promise<HerKeysAiCall>;
}

function reportFallback(reason: string) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(`[herkeys] ${JSON.stringify({ type: 'talk_it_out.provider_turn', provider: 'fallback', reason })}`);
  }
}

export function createHerKeysAiClient(client: SupabaseClient): HerKeysAiClient {
  return {
    async advance(input, owner) {
      try {
        if (!owner.accountId || owner.signal.aborted) return { kind: 'unauthorized' };
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError || !session?.access_token || session.user.id !== owner.accountId || owner.signal.aborted) {
          return { kind: 'unauthorized' };
        }
        // Pin this request to its originating session. The SDK otherwise reads
        // the current JWT again after the asynchronous consent lookup, allowing
        // an account switch to send the old account's words as the new account.
        // This is only a client boundary; the server verifies JWT and consent.
        const authorization = `Bearer ${session.access_token}`;
        // Even when UI consent was saved, recheck the current account's latest
        // server-owned decision immediately before an external AI request.
        // A declined, withdrawn, stale or unreadable decision FAILS CLOSED.
        if (process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE === 'true') {
          const { data: receipts, error: consentError } = await client.from('account_consents')
            .select('policy_version,granted')
            .eq('account_id', owner.accountId)
            .eq('consent_type', 'ai_processing')
            .order('recorded_at', { ascending: false })
            .limit(1)
            .abortSignal(owner.signal);
          if (consentError || !receipts?.length ||
              receipts[0].policy_version !== HER_KEYS_CONSENT_VERSIONS.ai_processing ||
              receipts[0].granted !== true) {
            return { kind: 'unavailable', reason: 'ai_processing_consent_required' };
          }
        }
        if (owner.signal.aborted) return { kind: 'unauthorized' };
        const { data, error } = await client.functions.invoke('herkeys-ai', {
          body: input, headers: { Authorization: authorization }, signal: owner.signal,
        });
        if (owner.signal.aborted) return { kind: 'unauthorized' };
        if (error) {
          const status =
            typeof (error as { context?: { status?: unknown } }).context?.status === 'number'
              ? (error as { context: { status: number } }).context.status
              : null;
          if (status === 401) {
            reportFallback('unauthorized');
            return { kind: 'unauthorized' };
          }

          const reason =
            data && typeof data === 'object' && typeof (data as Record<string, unknown>).reason === 'string'
              ? String((data as Record<string, unknown>).reason)
              : 'ai_service_unavailable';
          reportFallback(reason);
          return { kind: 'unavailable', reason };
        }

        const parsed = parseHerKeysAiTurn(data);
        if (!parsed) {
          reportFallback('invalid_ai_contract');
          return { kind: 'invalid', reason: 'invalid_ai_contract' };
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.info(
            `[herkeys] ${JSON.stringify({
              type: 'talk_it_out.provider_turn',
              provider: parsed.meta.provider,
              model: parsed.meta.model,
              requestId: parsed.meta.requestId,
              latencyMs: parsed.meta.latencyMs,
            })}`,
          );
        }
        return { kind: 'ready', value: parsed };
      } catch {
        reportFallback('network_unavailable');
        return { kind: 'unavailable', reason: 'network_unavailable' };
      }
    },
  };
}

export const UNCONFIGURED_HER_KEYS_AI: HerKeysAiClient = {
  advance: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
};
