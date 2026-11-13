import type { AccountSession } from '../domain/account/identity';
import { consentStatus, HER_KEYS_CONSENT_VERSIONS, type ConsentReceipt, type HerKeysConsentType } from '../domain/consent';
import { createSupabaseClient } from './supabaseCloud';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ConsentReadResult =
  | { kind: 'ok'; receipts: ConsentReceipt[] }
  | { kind: 'unavailable' };

export interface ConsentChoice {
  consent_type: HerKeysConsentType;
  granted: boolean;
}

/**
 * A short-lived authenticated client for the append-only consent ledger.
 * It has no durable Supabase session storage and never adopts a new household.
 */
export function createConsentLedger(session: AccountSession, client: SupabaseClient | null = createSupabaseClient()) {
  const authorized = async () => {
    if (!client) return false;
    try {
      const { data, error } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      return !error && data.user?.id === session.accountId;
    } catch { return false; }
  };
  const read = async (): Promise<ConsentReadResult> => {
    if (!(await authorized()) || !client) return { kind: 'unavailable' };
    try {
      // Read the latest of EACH type. Frequent AI-choice changes must never push
      // mandatory legal receipts out of a shared history limit.
      const answers = await Promise.all(Object.keys(HER_KEYS_CONSENT_VERSIONS).map((type) => client.from('account_consents')
        .select('consent_type,policy_version,granted,recorded_at')
        .eq('account_id', session.accountId)
        .eq('consent_type', type)
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)));
      if (answers.some(({ data, error }) => error || !data)) return { kind: 'unavailable' };
      const data = answers.flatMap((answer) => answer.data ?? []);
      const valid = data.filter((r) =>
        typeof r.consent_type === 'string' &&
        Object.hasOwn(HER_KEYS_CONSENT_VERSIONS, r.consent_type) &&
        typeof r.policy_version === 'string' &&
        typeof r.granted === 'boolean' &&
        typeof r.recorded_at === 'string'
      ) as ConsentReceipt[];
      return { kind: 'ok', receipts: valid };
    } catch { return { kind: 'unavailable' }; }
  };
  const record = async (choices: readonly ConsentChoice[]): Promise<ConsentReadResult> => {
    if (!client || !await authorized()) return { kind: 'unavailable' };
    // A complete set is required; never save a partial mandatory legal decision.
    const types = choices.map((c) => c.consent_type);
    if (choices.length !== 4 || new Set(types).size !== 4 ||
      !(['terms', 'privacy', 'age18'] as const).every((t) => choices.some((c) => c.consent_type === t && c.granted)) ||
      !choices.some((c) => c.consent_type === 'ai_processing')) {
      return { kind: 'unavailable' };
    }
    try {
      const rows = choices.map((c) => ({
        account_id: session.accountId,
        consent_type: c.consent_type,
        policy_version: HER_KEYS_CONSENT_VERSIONS[c.consent_type],
        granted: c.granted,
        // Database defaults recorded_at and id; the client cannot set either.
      }));
      const { error } = await client.from('account_consents').insert(rows);
      if (error) return { kind: 'unavailable' };
      const observed = await read();
      if (observed.kind !== 'ok') return { kind: 'unavailable' };
      const decision = consentStatus(observed.receipts);
      return decision.legalAccepted && decision.aiDecisionRecorded ? observed : { kind: 'unavailable' };
    } catch { return { kind: 'unavailable' }; }
  };
  const changeAiProcessing = async (granted: boolean): Promise<ConsentReadResult> => {
    if (typeof granted !== 'boolean' || !client || !await authorized()) return { kind: 'unavailable' };
    try {
      const { error } = await client.from('account_consents').insert({
        account_id: session.accountId,
        consent_type: 'ai_processing',
        policy_version: HER_KEYS_CONSENT_VERSIONS.ai_processing,
        granted,
      });
      if (error) return { kind: 'unavailable' };
      const observed = await read();
      if (observed.kind !== 'ok') return observed;
      const decision = consentStatus(observed.receipts);
      return decision.aiDecisionRecorded && decision.aiPermitted === granted ? observed : { kind: 'unavailable' };
    } catch { return { kind: 'unavailable' }; }
  };
  return { read, record, changeAiProcessing };
}
