// Edge Function wiring shared by the Premium functions. DENO ONLY (reads Deno.env).
import { adminClient } from '../supabaseAdmin.ts';
import { createRevenueCatApi } from './revenueCatApi.ts';
import { createSupabaseStore } from './supabasePorts.ts';
import type { LogFn, PremiumStorePort, RevenueCatApiPort } from './ports.ts';
import type { DeploymentEnvironment } from './types.ts';
import { DEFAULT_TOLERANCE_SECONDS, type WebhookAuthConfig } from './webhookAuth.ts';

export function readDeployment(): DeploymentEnvironment {
  const value = Deno.env.get('PREMIUM_ENVIRONMENT');
  // Unset or unknown is the most restrictive non-production choice; production must be asked for explicitly.
  return value === 'production' || value === 'staging' ? value : 'local';
}

export function readWebhookAuthConfig(deployment: DeploymentEnvironment): WebhookAuthConfig {
  const hmac = Deno.env.get('REVENUECAT_WEBHOOK_HMAC_SECRET');
  return {
    authorizationSecret: Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? null,
    hmacSecret: hmac && hmac.length > 0 ? hmac : null,
    requireHmac: deployment === 'production' || deployment === 'staging',
    toleranceSeconds: DEFAULT_TOLERANCE_SECONDS,
  };
}

/** Metadata-only structured log line. Callers pass reason codes and counts, never content, e-mail, prices or identifiers of people. */
export const log: LogFn = (record) => {
  console.log(JSON.stringify({ component: 'premium', ...record }));
};

export function createStore(): PremiumStorePort {
  return createSupabaseStore(adminClient());
}

export function createApi(): RevenueCatApiPort | null {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  return key ? createRevenueCatApi(key) : null;
}

/** A provider API that always reports unavailable: reconciliation then fails closed instead of crashing the caller. */
export const unavailableApi: RevenueCatApiPort = { getSubscriber: () => Promise.resolve({ ok: false, status: null }) };
