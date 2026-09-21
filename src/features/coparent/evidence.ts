import { intentLifecycle } from '../../domain/authorization';
import type { ActionIntent } from '../../domain/foundation/authorization';
import { refKey, type TypedRef } from '../../domain/foundation/typedRef';
import type { AppState } from '../../domain/state';
import type { RequestEvidence } from './types';

/**
 * EXECUTION EVIDENCE — read, never written.
 *
 * Feature 07 creates no intent, decision, execution or outcome and contacts no one. The only way a device can be told that something
 * was sent, delivered or paid is a row the trusted server boundary wrote and the device pulled. On this baseline no provider exists,
 * so these reads are nearly always "nothing" — which is exactly what lets the copy say "Her Keys has not contacted <name>".
 */

const REQUEST_CATEGORIES: ReadonlySet<string> = new Set(['delegation_request', 'outbound_message']);
const PAYMENT_CATEGORY = 'financial_action';

export interface EvidenceIndex {
  request: (refs: readonly TypedRef[]) => RequestEvidence;
  /** A `paid` outcome under a succeeded execution of a `financial_action` intent about this ref. */
  serviceReportedPayment: (ref: TypedRef) => boolean;
}

export function buildEvidenceIndex(state: Pick<AppState, 'intents' | 'decisions' | 'executions' | 'outcomes'>): EvidenceIndex {
  const requestIntents = new Map<string, ActionIntent[]>();
  const paymentIntents = new Map<string, ActionIntent[]>();
  for (const intent of state.intents) {
    if (intent.about === null) continue;
    const key = refKey(intent.about);
    const target = REQUEST_CATEGORIES.has(intent.category) ? requestIntents : intent.category === PAYMENT_CATEGORY ? paymentIntents : null;
    if (target !== null) target.set(key, [...(target.get(key) ?? []), intent]);
  }
  const lifecycle = (intent: ActionIntent) => intentLifecycle(state as AppState, intent.id);

  return {
    request(refs) {
      let sent = false;
      let delivered = false;
      for (const ref of refs) {
        for (const intent of requestIntents.get(refKey(ref)) ?? []) {
          const life = lifecycle(intent);
          if (life === null) continue;
          if (life.executions.some((execution) => execution.result === 'succeeded')) sent = true;
          if (life.outcomes.some((outcome) => outcome.kind === 'delivered')) delivered = true;
        }
      }
      // Delivery is only ever reported for something that was sent.
      return { sent, delivered: sent && delivered };
    },
    serviceReportedPayment(ref) {
      return (paymentIntents.get(refKey(ref)) ?? []).some((intent) => {
        const life = lifecycle(intent);
        return life !== null && life.executions.some((execution) => execution.result === 'succeeded') && life.outcomes.some((outcome) => outcome.kind === 'paid');
      });
    },
  };
}
