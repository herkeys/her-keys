import type { PaywallOutcome } from './entitlement';

/**
 * What she is told when a Premium paywall ends. Every way a paywall can end has words, so a tap on a Premium control is never
 * met with silence — and none of the words claim anything the SDK did not report.
 *
 *   purchased / restored / already_entitled -> success (the entitlement itself is refreshed by the provider, from CustomerInfo)
 *   cancelled                               -> info: she chose not to buy; nothing is wrong
 *   no_offering / unavailable / error       -> attention: nothing changed, free features are unaffected, and what to do next
 *
 * Messages never include the SDK's own error text (it is private, store-specific and not written for her).
 */
export type PaywallNoticeTone = 'success' | 'info' | 'attention';

export interface PaywallNotice {
  tone: PaywallNoticeTone;
  message: string;
}

export function paywallNoticeFor(outcome: PaywallOutcome): PaywallNotice | null {
  switch (outcome.kind) {
    case 'purchased':
      return { tone: 'success', message: 'Her Keys Premium is active on your account.' };
    case 'restored':
      return { tone: 'success', message: 'Your Premium purchase was restored.' };
    case 'already_entitled':
      return { tone: 'success', message: 'Her Keys Premium is already active on your account.' };
    case 'cancelled':
      return { tone: 'info', message: 'No purchase was made. You can explore Premium again whenever you’re ready.' };
    case 'no_offering':
      return { tone: 'attention', message: 'Premium isn’t available to purchase right now. Nothing has changed, and everything in Her Keys still works. Try again later.' };
    case 'unavailable':
      return { tone: 'attention', message: 'Premium can’t be reached right now. Nothing has changed, and everything in Her Keys still works. Try again later.' };
    case 'error':
      return { tone: 'attention', message: 'Premium couldn’t open right now. Please try again in a moment. If you were charged, use Restore purchases in Your Account.' };
    case 'continued_without_plus':
      return null;
  }
}
