import type { AuthProvider, ProviderResult } from './identity';

/**
 * THE AUTHENTICATION PROVIDER BOUNDARY.
 *
 * Apple and Google are the only two the product offers. Each is an adapter
 * behind this interface, so the state machine never learns which one it is
 * talking to and household semantics can never differ by provider
 * (B4-P0-012, B4-P0-016).
 *
 * An adapter RETURNS its outcome instead of throwing. "She changed her mind"
 * and "this build is misconfigured" are different situations with different
 * answers, and an exception collapses them into one.
 */
export interface AuthProviderAdapter {
  readonly provider: AuthProvider;
  /**
   * Whether this provider can be offered on this device at all — Sign in with
   * Apple is not available off Apple platforms, and a provider with no client
   * id configured is not available anywhere.
   */
  isAvailable(): Promise<boolean>;
  signIn(): Promise<ProviderResult>;
}

export interface ProviderRegistry {
  /** Providers to show her, in the order they should appear. */
  available(): Promise<AuthProvider[]>;
  signIn(provider: AuthProvider): Promise<ProviderResult>;
}

export function createProviderRegistry(adapters: readonly AuthProviderAdapter[]): ProviderRegistry {
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));

  return {
    async available() {
      const offered: AuthProvider[] = [];
      for (const adapter of adapters) {
        // One provider being unavailable must not hide the other, so each is
        // asked on its own and a failure to answer counts as unavailable.
        try {
          if (await adapter.isAvailable()) offered.push(adapter.provider);
        } catch {
          // Deliberately swallowed: an adapter that cannot say whether it works
          // is one we do not offer.
        }
      }
      return offered;
    },

    async signIn(provider) {
      const adapter = byProvider.get(provider);
      if (!adapter) {
        return { kind: 'configurationError', detail: `No adapter is registered for ${provider}` };
      }
      try {
        return await adapter.signIn();
      } catch (error) {
        // An adapter that throws anyway is a provider error, not a crash. She
        // gets a screen she can act on rather than a dead end.
        return { kind: 'providerError', detail: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * A scripted adapter for local development and tests.
 *
 * It exists so the identity state machine can be proven end to end without real
 * Apple or Google credentials, which no local run should need. It is never
 * registered in a release build: `createAccountRuntime` takes its adapters as an
 * argument precisely so the composition root decides.
 */
export function createScriptedProvider(
  provider: AuthProvider,
  script: { available?: boolean; results: readonly ProviderResult[] }
): AuthProviderAdapter {
  let call = 0;
  return {
    provider,
    async isAvailable() {
      return script.available ?? true;
    },
    async signIn() {
      const result = script.results[Math.min(call, script.results.length - 1)];
      call += 1;
      return result ?? { kind: 'providerError', detail: 'scripted provider ran out of results' };
    },
  };
}
