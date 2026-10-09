import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../config/supabase';

const PRODUCTION_URL = 'https://npykvnxnehlsdlbumzwk.supabase.co';

/**
 * Welcome email sending is a LIVE-APP responsibility, not a staging
 * dependency. The backend independently checks the same project identity,
 * validates the caller and owns the recipient and delivery ledger.
 */
export function isProductionWelcomeEnabled(config: SupabaseConfig): boolean {
  return config.backend === 'production' && config.url === PRODUCTION_URL;
}

export async function requestProductionWelcomeEmail(
  client: Pick<SupabaseClient, 'functions'> | null,
  config: SupabaseConfig,
): Promise<void> {
  if (!client || !isProductionWelcomeEnabled(config)) return;
  try {
    // This request has no name, email or other household data in its body.
    // The server reads the recipient from the verified user JWT.
    await client.functions.invoke('herkeys-welcome-email', { body: {} });
  } catch {
    // A noncritical welcome email never interrupts app entry or account binding.
    // The next authenticated startup may retry; server deduplicates by user id.
  }
}
