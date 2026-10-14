import type { NormalizedEvent } from './types.ts';

/**
 * Provider identity -> account resolution (A0 section 1.2). Provider ids are NOT interchangeable with Supabase UUIDs:
 *  - only the CURRENT `app_user_id` can name the account, and only if it is a real Supabase account (UUID that exists);
 *  - `original_app_user_id` and `aliases` are evidence, never accounts;
 *  - if more than one real account is implicated, nothing is granted automatically: the accounts are reconciled and ownership
 *    is whatever RevenueCat's own subscriber record says for that exact App User ID;
 *  - a transfer never grants from the event alone.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isAccountShaped = (id: string): boolean => UUID_PATTERN.test(id);
export const isAnonymousId = (id: string): boolean => id.startsWith('$RCAnonymousID');

export interface IdentityEvidence {
  providerUserId: string;
  kind: 'primary' | 'alias' | 'original' | 'anonymous';
  /** The real account this id names, or null if it names none. */
  accountId: string | null;
}

export type IdentityPlan =
  | { kind: 'single'; accountId: string; evidence: IdentityEvidence[] }
  | { kind: 'ambiguous'; accountIds: string[]; evidence: IdentityEvidence[] }
  | { kind: 'transfer'; accountIds: string[]; evidence: IdentityEvidence[] }
  | { kind: 'none'; evidence: IdentityEvidence[] };

/** Every provider id an event mentions that could possibly be an account, so the store can resolve them in one query. */
export function candidateAccountIds(event: NormalizedEvent): string[] {
  const all = [event.app_user_id, event.original_app_user_id, ...event.aliases, ...event.transferred_from, ...event.transferred_to];
  const out: string[] = [];
  for (const id of all) if (id !== null && isAccountShaped(id) && !out.includes(id)) out.push(id);
  return out;
}

export function planIdentity(event: NormalizedEvent, accountByProviderId: ReadonlyMap<string, string>): IdentityPlan {
  const account = (id: string | null): string | null => (id !== null ? accountByProviderId.get(id.toLowerCase()) ?? accountByProviderId.get(id) ?? null : null);
  const evidence: IdentityEvidence[] = [];
  const add = (id: string | null, kind: IdentityEvidence['kind']): void => {
    if (id === null || evidence.some((e) => e.providerUserId === id)) return;
    evidence.push({ providerUserId: id, kind: isAnonymousId(id) ? 'anonymous' : kind, accountId: account(id) });
  };
  add(event.app_user_id, 'primary');
  add(event.original_app_user_id, 'original');
  for (const alias of event.aliases) add(alias, 'alias');
  for (const id of [...event.transferred_from, ...event.transferred_to]) add(id, 'alias');

  if (event.event_type === 'TRANSFER') {
    const accountIds = unique([...event.transferred_from, ...event.transferred_to].map(account).filter((a): a is string => a !== null));
    return accountIds.length > 0 ? { kind: 'transfer', accountIds, evidence } : { kind: 'none', evidence };
  }

  const primary = account(event.app_user_id);
  const others = unique([event.original_app_user_id, ...event.aliases].map(account).filter((a): a is string => a !== null && a !== primary));
  if (primary !== null && others.length === 0) return { kind: 'single', accountId: primary, evidence };
  if (primary !== null || others.length > 1) {
    return { kind: 'ambiguous', accountIds: unique([...(primary !== null ? [primary] : []), ...others]), evidence };
  }
  // No current account-grade id. An alias that happens to be a real account is NOT promoted to the account.
  return { kind: 'none', evidence };
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
