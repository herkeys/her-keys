import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config/supabase';
import { createTimeoutFetch } from './timeoutFetch';

export type AiReportReason = 'unsafe' | 'offensive' | 'inaccurate' | 'privacy' | 'other';
export type AiReportResult = 'received' | 'unavailable' | 'rate_limited' | 'unauthorized';

export interface AiReportClient {
  submit(input: { messageId: string; reason: AiReportReason; dedupeKey: string },
    owner: { accountId: string | null; signal: AbortSignal }): Promise<AiReportResult>;
}

/**
 * Metadata only. No conversation text or model response ever enters this request.
 * Capture the owner's actual JWT before the async transport so a sign-in/account
 * switch cannot substitute a new actor for an old actor's report.
 */
export function createAiReportClient(client: SupabaseClient): AiReportClient {
  const request = createTimeoutFetch((url, options) => globalThis.fetch(url, options));
  return {
    async submit(input, owner) {
      if (!owner.accountId || owner.signal.aborted || !supabaseConfig.url || !supabaseConfig.anonKey) return 'unavailable';
      if (!/^[0-9a-f-]{36}$/i.test(input.dedupeKey) || !/^msg-[A-Za-z0-9_-]{1,80}$/.test(input.messageId)) return 'unavailable';
      try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error || !session || session.user.id !== owner.accountId || owner.signal.aborted) return 'unauthorized';
        const token = session.access_token;
        const response = await request(`${supabaseConfig.url}/rest/v1/rpc/submit_ai_response_report`, {
          method: 'POST',
          headers: {
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_surface: 'talk_it_out',
            p_message_id: input.messageId,
            p_reason: input.reason,
            p_dedupe_key: input.dedupeKey,
          }),
          signal: owner.signal,
        });
        if (owner.signal.aborted) return 'unavailable';
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) return 'unauthorized';
          // PostgREST returns P0001 for the bounded per-account report limit.
          if (response.status === 400) {
            const failure = await response.json().catch(() => ({})) as { message?: string };
            if (failure.message === 'report_rate_limited') return 'rate_limited';
          }
          return 'unavailable';
        }
        const result = await response.json() as { status?: string; receiptId?: unknown };
        return result.status === 'received' && typeof result.receiptId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.receiptId)
          ? 'received' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
  };
}

export const UNCONFIGURED_AI_REPORT_CLIENT: AiReportClient = {
  submit: async () => 'unavailable',
};
