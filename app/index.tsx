import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { canRenderAccountData } from '../src/domain/account/authState';
import type { OnboardingStep } from '../src/domain/state';
import { WelcomeAuthFlow } from '../src/features/account/WelcomeAuthFlow';
import { useAccount } from '../src/store/AccountProvider';
import { useOnboarding } from '../src/store/OnboardingContext';
import { usePremiumIntent } from '../src/store/PremiumIntentContext';

/**
 * The entry route. Access is decided by the root guards (`routeAccess`), and they open this screen in exactly two
 * situations:
 *
 *   - nobody holds this household under an account yet — the welcome tree: Welcome, Premium offer (new users), account choice,
 *     authenticate. There is no way past it into the Life Systems Audit without an account;
 *   - an account holds this household and the audit is unfinished — she is handed straight on to the step she had reached.
 *
 * Which of the two it is comes from account state alone, so a returning account never sees Welcome and nothing here
 * remembers whether she has.
 */
export default function Entry() {
  const account = useAccount();
  const premiumIntent = usePremiumIntent();
  // The Premium offer only reports an intent upward; checkout is presented after account binding and consent (app/_layout.tsx).
  return canRenderAccountData(account.state) ? <ContinueAudit /> : <WelcomeAuthFlow mode="first-run" onPremiumChoice={premiumIntent.setChoice} />;
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
