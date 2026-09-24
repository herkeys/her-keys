import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import type { AccountRuntime } from '../domain/account/accountRuntime';
import type { CloudAccountClient } from '../domain/account/cloudClient';
import { createProviderRegistry, type AuthProviderAdapter } from '../domain/account/provider';
import { createSecureSessionStore } from '../domain/account/secureSession';
import { deviceTimeZone } from '../domain/logicalDay';
import type { SyncRuntime } from '../domain/sync/syncRuntime';
import type { SyncTransport } from '../domain/sync/transport';
import { identifyRevenueCatAccount } from '../monetization/revenueCatClient';
import { createAppleProvider } from '../platform/appleProvider';
import { createGoogleProvider } from '../platform/googleProvider';
import { createDeviceSecureStorage } from '../platform/secureStore';
import { createSupabaseAccountClient, createSupabaseClient } from '../platform/supabaseCloud';
import { createSupabaseSessionClient } from '../platform/supabaseSessionClient';
import { createSupabaseSyncTransport } from '../platform/supabaseSyncTransport';
import { appStore, changeObserver } from './appStoreInstance';
import { composeAccountApp } from './composeAccountApp';

/**
 * The account composition root.
 *
 * Every dependency the identity wave needs is assembled here and nowhere else,
 * so the domain stays free of `expo-*` and `@supabase/*` imports and can be
 * tested without a device. If Supabase is not configured for this build no
 * account can bind: cloud calls are honest refusals, the sync runtime is still
 * composed (so the composition never differs between builds) but never starts,
 * and the app runs locally exactly as it did before accounts existed.
 *
 * Binding an account and synchronizing it are one composition, in
 * `composeAccountApp`. This file only supplies the platform pieces.
 */

// Provider authentication is intentionally isolated from the data transport
// client. A Google/Apple account is verified against the bound Her Keys actor
// before its session can ever be installed on the client that reaches data.
const client = createSupabaseClient();
const providerClient = createSupabaseClient();
const sessions = createSecureSessionStore(createDeviceSecureStorage());
const sessionClient = client === null ? undefined : createSupabaseSessionClient(client);

/**
 * With no Supabase project configured, every cloud call is an honest refusal
 * rather than a crash or a hang. A build in this state can still be used; it
 * simply cannot bind to an account.
 */
const unconfiguredCloud: CloudAccountClient = {
  async bootstrapAccount() {
    return { kind: 'rejected', detail: 'This build has no Supabase project configured.' };
  },
  async claimLocalHousehold() {
    return { kind: 'rejected', detail: 'This build has no Supabase project configured.' };
  },
};

export const accountsAvailable = client !== null && providerClient !== null;

const adapters: AuthProviderAdapter[] = providerClient === null ? [] : [createAppleProvider(providerClient), createGoogleProvider(providerClient)];

/** Which providers this device can actually offer. Asked, not assumed. */
export const accountProviders = createProviderRegistry(adapters);

/**
 * With no Supabase project there is nothing to transport to. The runtime is still composed (so the composition never differs
 * between builds), but no account can bind, so it never starts.
 */
const unconfiguredTransport: SyncTransport = (() => {
  const refusal = async () => ({ kind: 'failure' as const, failure: 'unreachable' as const, detail: 'This build has no Supabase project configured.', code: null });
  return { create: refusal, update: refusal, pull: refusal, fetchRows: refusal };
})();

const report = __DEV__ ? (event: { type: string; detail?: string }) => console.info(`[herkeys] ${JSON.stringify(event)}`) : undefined;

/**
 * THE composition: the account runtime AND the sync runtime, wired by the same function every test calls. Everything platform
 * specific — Expo, Supabase, the keychain — is supplied here and nowhere else.
 */
const app = composeAccountApp({
  store: appStore,
  observer: changeObserver,
  account: {
    sessions,
    sessionClient,
    providers: accountProviders,
    cloud: client === null ? unconfiguredCloud : createSupabaseAccountClient(client),
    timezone: deviceTimeZone,
    now: Date.now,
    newClaimKey: () => Crypto.randomUUID(),
    deviceId: Constants.sessionId ?? null,
    onAccountIdentified: async (accountId) => {
      await identifyRevenueCatAccount(accountId);
    },
    report,
  },
  sync: {
    transport: client === null ? unconfiguredTransport : createSupabaseSyncTransport(client),
    newDeviceId: () => Crypto.randomUUID(),
    report,
  },
});

export const accountRuntime: AccountRuntime = app.accountRuntime;
export const syncRuntime: SyncRuntime = app.syncRuntime;
