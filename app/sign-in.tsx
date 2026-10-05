import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Screen } from '../src/design/components';
import type { AuthProvider } from '../src/domain/account/identity';
import { AccountPanel } from '../src/features/account/AccountPanel';
import { accountModalMode } from '../src/features/account/accountModel';
import { WelcomeAuthFlow } from '../src/features/account/WelcomeAuthFlow';
import { accountProviders } from '../src/store/accountRuntimeInstance';
import { useAccount } from '../src/store/AccountProvider';

/**
 * Your Account — the one account surface after the first run (the route keeps its `/sign-in` name).
 *
 * Connected: account status and Sign out. Degraded: reconnect the SAME account — through the welcome tree's own reconnect
 * presentation, so every method she could have signed up with (email included) is there to come back with. While the
 * binding is in flight the panel shows progress and offers nothing contradictory. Every action is AccountRuntime's, through
 * `useAccount`; this screen never touches a session or a store.
 *
 * It does not open for someone who is signed out — signing in for the first time is the entry route's job — and quarantine
 * (`boundOther`) never reaches here: the route guard sends that state to `account-conflict` alone.
 */
export default function SignIn() {
  const { state, available, busy, signIn, signOut } = useAccount();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const mode = accountModalMode(state, available);

  // The reconnect flow mounts for a credential that has LAPSED, and then stays mounted through its own sign-in. Signing out
  // also passes through `authDegraded` for an instant (sync is stopped before the credential is ended), but that arrives
  // while this screen is already busy signing out, so it never starts a reconnect.
  const [reconnecting, setReconnecting] = useState(false);
  const shouldReconnect = mode === 'reconnect' && (reconnecting || !busy);
  if (shouldReconnect !== reconnecting) setReconnecting(shouldReconnect);

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

  if (shouldReconnect) return <WelcomeAuthFlow mode="reconnect" />;

  return (
    <Screen scroll={false}>
      <AccountPanel
        mode={mode}
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
