import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Screen } from '../src/design/components';
import type { AuthProvider } from '../src/domain/account/identity';
import { AccountPanel } from '../src/features/account/AccountPanel';
import { accountModalMode } from '../src/features/account/accountModel';
import { accountProviders } from '../src/store/accountRuntimeInstance';
import { useAccount } from '../src/store/AccountProvider';

/**
 * Your Account — the one account surface (the route keeps its `/sign-in` name).
 *
 * Signed out: the available providers. Degraded: reconnect the same account. Connected: Sign out. While a provider flow or
 * the binding is in flight the panel shows progress and offers nothing contradictory. Every action is AccountRuntime's,
 * through `useAccount`; this screen never touches a session or a store. Quarantine (`boundOther`) never reaches here —
 * the route guard sends that state to `account-conflict` alone.
 */
export default function SignIn() {
  const { state, available, busy, signIn, signOut } = useAccount();
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  useEffect(() => {
    let live = true;
    // Availability is asked of the adapters, not assumed from the platform: a
    // build with no Supabase project should not show a button that cannot work.
    accountProviders
      .available()
      .then((offered) => {
        if (live) setProviders(offered);
      })
      .catch(() => {
        if (live) setProviders([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Screen scroll={false}>
      <AccountPanel
        mode={accountModalMode(state, available)}
        providers={providers}
        busy={busy}
        failed={state.kind === 'authError'}
        onSignIn={(provider) => void signIn(provider)}
        onSignOut={() => void signOut()}
        onClose={() => router.back()}
      />
    </Screen>
  );
}
