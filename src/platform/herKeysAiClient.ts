import type { SupabaseClient } from '@supabase/supabase-js';
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
  advance(input: HerKeysAiRequest): Promise<HerKeysAiCall>;
}

export function createHerKeysAiClient(client: SupabaseClient): HerKeysAiClient {
  return {
    async advance(input) {
      try {
        const { data, error } = await client.functions.invoke('herkeys-ai', { body: input });
        if (error) {
          const status =
            typeof (error as { context?: { status?: unknown } }).context?.status === 'number'
              ? (error as { context: { status: number } }).context.status
              : null;
          if (status === 401) return { kind: 'unauthorized' };

          const reason =
            data && typeof data === 'object' && typeof (data as Record<string, unknown>).reason === 'string'
              ? String((data as Record<string, unknown>).reason)
              : 'ai_service_unavailable';
          return { kind: 'unavailable', reason };
        }

        const parsed = parseHerKeysAiTurn(data);
        if (!parsed) return { kind: 'invalid', reason: 'invalid_ai_contract' };
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
        return { kind: 'unavailable', reason: 'network_unavailable' };
      }
    },
  };
}

export const UNCONFIGURED_HER_KEYS_AI: HerKeysAiClient = {
  advance: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
};
