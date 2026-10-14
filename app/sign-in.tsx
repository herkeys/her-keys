import { router } from 'expo-router';
import { DeleteAccountPanel } from '../src/features/account/DeleteAccountPanel';
import { useEffect, useRef, useState } from 'react';
import { Screen } from '../src/design/components';
import type { AuthProvider } from '../src/domain/account/identity';
import { AccountPanel } from '../src/features/account/AccountPanel';
import { accountModalMode } from '../src/features/account/accountModel';
import { WelcomeAuthFlow } from '../src/features/account/WelcomeAuthFlow';
import { accountProviders } from '../src/store/accountRuntimeInstance';
import { useAccount } from '../src/store/AccountProvider';
import { useEntitlement } from '../src/monetization/RevenueCatProvider';

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
  const [privacy, setPrivacy] = useState(false);
  const { state, available, busy, signIn, signOut } = useAccount();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const mode = accountModalMode(state, available);
  const { restore } = useEntitlement();
  const accountId = state.kind === 'accountBound' ? state.session.accountId : null;
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const restoreInFlight = useRef(false);
  const mounted = useRef(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ accountId: string; notice: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const onRestore = async () => {
    const owner = currentAccount.current;
    if (owner === null || busy || restoreInFlight.current) return;
    restoreInFlight.current = true;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const outcome = await restore(owner);
      if (!mounted.current || currentAccount.current !== owner) return;
      const notice = outcome.kind === 'restored' ? 'Your Premium purchase was restored.'
        : outcome.kind === 'no_purchases_found' ? 'No Premium purchase was found for this store account.'
        : outcome.kind === 'unavailable' ? 'Purchases can’t be restored right now. Reconnect your account and try again.'
        : 'Purchases couldn’t be restored. Try again.';
      setRestoreResult({ accountId: owner, notice });
    } catch {
      if (mounted.current && currentAccount.current === owner) setRestoreResult({ accountId: owner, notice: 'Purchases couldn’t be restored. Try again.' });
    } finally {
      restoreInFlight.current = false;
      if (mounted.current) setRestoring(false);
    }
  };

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
  if (privacy) return <Screen scroll={false}><DeleteAccountPanel onBack={() => setPrivacy(false)} /></Screen>;

  return (
    <Screen scroll={false}>
      <AccountPanel
        onPrivacy={() => setPrivacy(true)}
        mode={mode}
        providers={providers}
        busy={busy}
        failed={state.kind === 'authError'}
        onSignIn={(provider) => void signIn(provider)}
        onSignOut={() => void signOut()}
        onClose={() => router.back()}
        onRestore={accountId === null ? undefined : () => void onRestore()}
        restoring={restoring}
        restoreNotice={restoreResult?.accountId === accountId ? restoreResult.notice : null}
      />
    </Screen>
  );
}
