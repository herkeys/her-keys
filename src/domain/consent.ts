/** Account-scoped, versioned decisions. The server timestamp is the receipt authority. */
export const HER_KEYS_CONSENT_VERSIONS = {
  terms: 'terms-pdf-initial-v1',
  privacy: 'privacy-pdf-initial-v1',
  age18: 'age18-initial-v1',
  ai_processing: 'ai-data-processing-initial-v1',
} as const;

export type HerKeysConsentType = keyof typeof HER_KEYS_CONSENT_VERSIONS;

export interface ConsentReceipt {
  consent_type: HerKeysConsentType;
  policy_version: string;
  granted: boolean;
  recorded_at: string;
}

export interface ConsentDecision {
  legalAccepted: boolean;
  aiDecisionRecorded: boolean;
  aiPermitted: boolean;
}

/** No unchecked/default AI consent: absence means NOT PERMITTED, never implied true. */
export function consentStatus(receipts: readonly ConsentReceipt[]): ConsentDecision {
  const latest = new Map<HerKeysConsentType, ConsentReceipt>();
  for (const receipt of [...receipts].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))) {
    if (!latest.has(receipt.consent_type)) latest.set(receipt.consent_type, receipt);
  }
  const accepted = (type: HerKeysConsentType) => {
    const receipt = latest.get(type);
    return !!receipt && receipt.policy_version === HER_KEYS_CONSENT_VERSIONS[type] && receipt.granted;
  };
  const ai = latest.get('ai_processing');
  const aiDecisionRecorded = !!ai && ai.policy_version === HER_KEYS_CONSENT_VERSIONS.ai_processing;
  return {
    legalAccepted: accepted('terms') && accepted('privacy') && accepted('age18'),
    aiDecisionRecorded,
    aiPermitted: aiDecisionRecorded && ai?.granted === true,
  };
}
