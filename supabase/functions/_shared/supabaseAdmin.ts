import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.116.0';

let admin: SupabaseClient | null = null;

function readSecretKey(): string {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modern) {
    const parsed = JSON.parse(modern) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const localModern = Deno.env.get('SUPABASE_SECRET_KEY');
  if (localModern) return localModern;

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('Supabase server secret key is unavailable');
}

export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('SUPABASE_URL is unavailable');
  admin = createClient(url, readSecretKey(), {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}

export async function requireUser(req: Request, allowPendingDeletion = false): Promise<User> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AuthError('Missing user bearer token');

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new AuthError('User session is not valid');
  if (!allowPendingDeletion) await assertAccountActive(data.user.id);
  return data.user;
}

export async function assertAccountActive(accountId: string): Promise<void> {
  const {data,error}=await adminClient().from('account_deletion_requests').select('id')
    .eq('account_id',accountId).neq('status','restored').limit(1);
  if(error || !data || data.length>0) throw new AuthError('Account access is restricted');
}

export class AuthError extends Error {}
