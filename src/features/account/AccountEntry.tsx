import { router } from 'expo-router';
import { useAccount } from '../../store/AccountProvider';
import { AccountEntryButton } from './AccountEntryButton';
import { ACCOUNT_ROUTE, accountEntryLabel, accountModalMode } from './accountModel';

/**
 * The ordinary way to Your Account: Sign in, Reconnect, or Your account, depending on where her account stands. Sits with
 * Today's other shell notices; opens the existing `/sign-in` modal. The same on iOS and Android — no platform input.
 */
export function AccountEntry() {
  const { state, available } = useAccount();
  return <AccountEntryButton label={accountEntryLabel(accountModalMode(state, available))} onOpen={() => router.push(ACCOUNT_ROUTE)} />;
}
