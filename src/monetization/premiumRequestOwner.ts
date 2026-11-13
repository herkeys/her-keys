import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline } from '../domain/account/deadline';

/** The provider's account/household lifetime, captured before any asynchronous SDK work. */
export interface PremiumRequestOwner {
  accountId: string | null;
  isCurrent: () => boolean;
}

/** Pin the originating JWT; Supabase's asynchronous token injection must never substitute another actor. */
export async function premiumAuthorization(client: SupabaseClient, owner?: PremiumRequestOwner): Promise<string | undefined> {
  if (!owner) return undefined;
  if (!owner.accountId || !owner.isCurrent()) throw new Error('premium_account_changed');
  const result = await withDeadline(() => client.auth.getSession(), 8000);
  if (result.timedOut) throw new Error('premium_session_unavailable');
  const { data: { session }, error } = result.value;
  if (error || !session?.access_token || session.user.id !== owner.accountId || !owner.isCurrent()) {
    throw new Error('premium_account_changed');
  }
  return `Bearer ${session.access_token}`;
}

export async function premiumRpc(client: SupabaseClient, owner: PremiumRequestOwner | undefined, name: string, args?: Record<string, unknown>) {
  const authorization = await premiumAuthorization(client, owner);
  const request = client.rpc(name, args);
  return authorization ? request.setHeader('Authorization', authorization) : request;
}

export async function premiumInvoke(client: SupabaseClient, owner: PremiumRequestOwner | undefined, name: string, body: object, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('premium_request_cancelled');
  const authorization = await premiumAuthorization(client, owner);
  if (signal?.aborted) throw new Error('premium_request_cancelled');
  return client.functions.invoke(name, { body, ...(signal ? { signal } : {}), ...(authorization ? { headers: { Authorization: authorization } } : {}) });
}
