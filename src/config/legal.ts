import { Platform } from 'react-native';

/**
 * Complete public legal documents for each currently supported native release.
 *
 * Google Play requires an in-app privacy link to a full, publicly accessible HTML
 * webpage rather than a PDF. The Android build therefore opens the same full HTML
 * policies published at herkeys.app. Leave the already-reviewed iOS legal destinations
 * untouched; this repair changes Android behavior only.
 *
 * IMPORTANT: verify the public HTTPS URLs at release time. Source availability alone
 * cannot establish that the Production deployment serves the files successfully.
 */
const androidLegalUrls = {
  terms: 'https://herkeys.app/legal/her-keys-full-terms-and-conditions.html',
  privacy: 'https://herkeys.app/legal/her-keys-full-privacy-policy.html',
} as const;

const existingLegalUrls = {
  terms: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-terms.pdf',
  privacy: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-policy.pdf',
} as const;

/** Android alone uses the new full HTML policies; iOS/web retain their existing destinations. */
export function legalUrlsForPlatform(platform: string) {
  return platform === 'android' ? androidLegalUrls : existingLegalUrls;
}

export const HER_KEYS_LEGAL_URLS = legalUrlsForPlatform(Platform.OS);
