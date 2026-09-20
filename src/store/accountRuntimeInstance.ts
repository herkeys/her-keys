import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { createAccountRuntime, type AccountRuntime } from '../domain/account/accountRuntime';
import { UNBOUND_IDENTITY } from '../domain/account/binding';
import type { CloudAccountClient } from '../domain/account/cloudClient';
import { createProviderRegistry, type AuthProviderAdapter } from '../domain/account/provider';
import { createSecureSessionStore } from '../domain/account/secureSession';
import { deviceTimeZone } from '../domain/logicalDay';
import { identifyRevenueCatAccount } from '../monetization/revenueCatClient';
import { createAppleProvider } from '../platform/appleProvider';
import { createGoogleProvider } from '../platform/googleProvider';
import { createDeviceSecureStorage } from '../platform/secureStore';
import { createSupabaseAccountClient, createSupabaseClient } from '../platform/supabaseCloud';
import { appStore } from './appStoreInstance';

/**
 * The account composition root.
 *
 * Every dependency the identity wave needs is assembled here and nowhere else,
 * so the domain stays free of `expo-*` and `@supabase/*` imports and can be
 * tested without a device. If Supabase is not configured for this build there
 * is no runtime at all — the app runs locally, exactly as it did before
 * accounts existed.
 */

const client = createSupabaseClient();

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

export const accountsAvailable = client !== null;

const adapters: AuthProviderAdapter[] = client === null ? [] : [createAppleProvider(client), createGoogleProvider(client)];

/** Which providers this device can actually offer. Asked, not assumed. */
export const accountProviders = createProviderRegistry(adapters);

export const accountRuntime: AccountRuntime = createAccountRuntime({
  sessions: createSecureSessionStore(createDeviceSecureStorage()),
  providers: accountProviders,
  cloud: client === null ? unconfiguredCloud : createSupabaseAccountClient(client),
  identity: {
    current: () => appStore.currentIdentity() ?? UNBOUND_IDENTITY,
    set: (identity) => appStore.setIdentity(identity),
    save: () => appStore.saveIdentity(),
  },
  localState: () => {
    const state = appStore.getSnapshot().state;
    if (state === null) throw new Error('The account runtime read household state before hydration finished.');
    return state;
  },
  timezone: deviceTimeZone,
  now: Date.now,
  newClaimKey: () => Crypto.randomUUID(),
  deviceId: Constants.sessionId ?? null,
  onAccountIdentified: async (accountId) => {
    await identifyRevenueCatAccount(accountId);
  },
  report: __DEV__ ? (event) => console.info(`[herkeys] ${JSON.stringify(event)}`) : undefined,
});
