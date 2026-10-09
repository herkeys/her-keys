import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { canRenderAccountData } from '../src/domain/account/authState';
import type { OnboardingStep } from '../src/domain/state';
import { WelcomeAuthFlow } from '../src/features/account/WelcomeAuthFlow';
import { useAccount } from '../src/store/AccountProvider';
import { useEntitlement } from '../src/monetization/RevenueCatProvider';
import { useOnboarding } from '../src/store/OnboardingContext';

/**
 * The entry route. Access is decided by the root guards (`routeAccess`), and they open this screen in exactly two
 * situations:
 *
 *   - nobody holds this household under an account yet — the welcome tree: Welcome, account choice, authenticate. There is
 *     no way past it into the Life Systems Audit without an account;
 *   - an account holds this household and the audit is unfinished — she is handed straight on to the step she had reached.
 *
 * Which of the two it is comes from account state alone, so a returning account never sees Welcome and nothing here
 * remembers whether she has.
 */
export default function Entry() {
  const account = useAccount();
  const { presentPaywall } = useEntitlement();
  return canRenderAccountData(account.state) ? <ContinueAudit /> : <WelcomeAuthFlow mode="first-run" presentWelcomePaywall={() => presentPaywall('welcome_premium')} />;
}

/**
 * Decided once, when she arrives holding an account: someone part-way through the audit picks up where she left off, and
 * someone who has not started begins at its first step — recorded as reached, exactly as the old Begin button did.
 */
function ContinueAudit() {
  const { resumeStep, recordStep } = useOnboarding();
  const [step] = useState<OnboardingStep>(() => resumeStep ?? 'goals');

  useEffect(() => {
    recordStep(step);
  }, [recordStep, step]);

  return <Redirect href={`/onboarding/${step}`} />;
}
