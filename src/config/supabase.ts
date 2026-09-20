/**
 * Supabase connection settings, read from Expo public env vars.
 *
 * Only `EXPO_PUBLIC_...` names belong here. The anon/publishable key is
 * client-safe by design — RLS is what protects the data, which is why the
 * schema's whole security posture is built on policies and column grants
 * rather than on a secret the app holds. A `service_role` key must never reach
 * client source, and nothing here reads one.
 */

export interface SupabaseConfig {
  url: string | undefined;
  anonKey: string | undefined;
}

export const supabaseConfig: SupabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

export function isSupabaseConfigured(config: SupabaseConfig = supabaseConfig): boolean {
  return Boolean(config.url) && Boolean(config.anonKey);
}

/** Google's OAuth client ids, per platform. Absent means "do not offer Google". */
export const googleAuthConfig = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
