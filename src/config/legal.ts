/**
 * Public Her Keys legal PDFs supplied by the owner and hosted in the
 * Her Keys Production Supabase Storage public "Legal docs" bucket.
 *
 * These are public document URLs, never backend auth endpoints. Keep them
 * separate from the auth shell so legal navigation cannot affect sessions.
 * Verify on a real device before promoting a store candidate.
 */
export const HER_KEYS_LEGAL_URLS = {
  terms: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-terms.pdf',
  privacy: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-policy.pdf',
} as const;
