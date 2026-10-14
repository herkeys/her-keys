import type { AppState } from '../../domain/state';
import type { ExtractRequest, ExtractResult } from '../../monetization/premiumTypes';
import type { CaptureEnhancer, PremiumReadingSkip } from '../talk-it-out/capture/coordinator';
import { buildExtractRequest, existingItemsOf, mapExtraction } from './smartInboxMap';

/**
 * Smart Inbox, the Premium reader behind the Talk It Out capture seam.
 *
 * What it promises, and what keeps each promise:
 *   - It is only ever asked AFTER the local high-stakes screen passed and the source was saved (the coordinator's order), so text the
 *     local screen refuses is never sent anywhere.
 *   - It only runs for a bound account with a household, whose SERVER-confirmed entitlement is Premium. The client's belief is a hint;
 *     the server re-decides (entitlement, AI consent, quota) before any model is called.
 *   - It never throws and never blocks the local reading: every failure is "keep the local reading", and only someone who HAS Premium is
 *     told why Premium was not used. A Free user sees nothing change.
 *   - Its output is only ever a proposal for her review. Nothing here writes household state.
 */

/** The server rejects longer text; the local reader has its own over-length handling, so we simply do not send it. */
export const SMART_INBOX_MAX_CHARS = 4000;

export interface SmartInboxEnv {
  /** The latest Premium view, read at CALL time (the coordinator outlives renders). Null where Premium is not mounted. */
  premium: () => {
    accountBound: boolean;
    householdId: string | null;
    /** The server's confirmed entitlement — never the store SDK's. */
    entitled: boolean;
    appVersion: string | undefined;
    extract: (request: ExtractRequest) => Promise<ExtractResult>;
  } | null;
  state: () => AppState | null;
}

/** One key per submission: a retry of the same submission can never be billed twice. */
export const extractionKeyFor = (submissionKey: string): string => `smart-inbox-${submissionKey}`.slice(0, 128);

const skipFor = (result: ExtractResult): PremiumReadingSkip | null => {
  switch (result.kind) {
    case 'denied':
      switch (result.decision.reason) {
        case 'requires_ai_consent':
          return 'consent';
        case 'quota_exhausted':
        case 'rate_limited':
          return 'limit';
        // She does not have (or no longer has) Premium: say nothing, the Free reading is the whole product for her.
        case 'requires_premium':
        case 'entitlement_unknown':
        case 'entitlement_expired':
          return null;
        default:
          return 'unavailable';
      }
    case 'replayed':
      return 'replayed';
    default:
      return 'unavailable';
  }
};

export function createSmartInboxEnhancer(env: SmartInboxEnv): CaptureEnhancer {
  return async ({ text, submissionKey, context, local }) => {
    const premium = env.premium();
    if (!premium || !premium.accountBound || premium.householdId === null || !premium.entitled) return { kind: 'kept-local', skipped: null };
    if (text.length > SMART_INBOX_MAX_CHARS) return { kind: 'kept-local', skipped: null };
    // An empty local reading still goes to the server: a model may read what the rules cannot.
    const { request, refs } = buildExtractRequest({
      text,
      householdId: premium.householdId,
      idempotencyKey: extractionKeyFor(submissionKey),
      context,
      ...(premium.appVersion ? { appVersion: premium.appVersion } : {}),
    });

    let result: ExtractResult;
    try {
      result = await premium.extract(request);
    } catch {
      return { kind: 'kept-local', skipped: 'unavailable' };
    }
    if (result.kind !== 'ok') return { kind: 'kept-local', skipped: skipFor(result) };

    const state = env.state();
    const mapped = mapExtraction({
      extraction: result.extraction,
      text,
      context,
      refs,
      existing: state ? existingItemsOf(state) : [],
      captureId: local.captureId,
    });
    // A reading with nothing in it is not an improvement on the local one: keep what the rules found, and say Premium found nothing more.
    if (mapped.proposals.length === 0) return { kind: 'kept-local', skipped: null };
    return { kind: 'enhanced', result: mapped };
  };
}
