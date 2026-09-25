/**
 * Supabase connection settings, read from Expo public env vars.
 *
 * Only `EXPO_PUBLIC_...` names belong here. The anon/publishable key is
 * client-safe by design — RLS is what protects the data, which is why the
 * schema's whole security posture is built on policies and column grants
 * rather than on a secret the app holds. A `service_role` key must never reach
 * client source, and nothing here reads one.
 */

export type HerKeysBackend = 'staging' | 'production';

export interface SupabaseConfig {
  url: string | undefined;
  /** Modern publishable key preferred; legacy anon remains supported during migration. */
  anonKey: string | undefined;
  backend: HerKeysBackend | undefined;
}

const PROJECT_REF: Record<HerKeysBackend, string> = {
  staging: 'fhhudicklmpofuzkxeqe',
  production: 'npykvnxnehlsdlbumzwk',
};

export const supabaseConfig: SupabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  backend:
    process.env.EXPO_PUBLIC_HERKEYS_BACKEND === 'staging' || process.env.EXPO_PUBLIC_HERKEYS_BACKEND === 'production'
      ? process.env.EXPO_PUBLIC_HERKEYS_BACKEND
      : undefined,
};

export function isSupabaseConfigured(config: SupabaseConfig = supabaseConfig): boolean {
  if (!config.url || !config.anonKey) return false;
  assertBackendMatchesUrl(config);
  return true;
}

/**
 * A release profile can name the backend it intends to use. That turns a stale
 * local .env from a silent cross-environment build into an immediate failure.
 */
export function assertBackendMatchesUrl(config: SupabaseConfig = supabaseConfig): void {
  if (!config.backend || !config.url) return;
  const expected = PROJECT_REF[config.backend];
  let host: string;
  try {
    host = new URL(config.url).hostname;
  } catch {
    throw new Error('Her Keys Supabase URL is not a valid URL');
  }
  if (!host.startsWith(`${expected}.`) && host !== `${expected}.supabase.co`) {
    throw new Error(`Her Keys ${config.backend} build is pointed at the wrong Supabase project`);
  }
}
