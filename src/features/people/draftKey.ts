import { DRAFT_KEY_PATTERN } from '../../domain/people';

/**
 * The Add Follow-up draft key, from random bytes (HK-FEATURE-13).
 *
 * Minted when the flow OPENS and held in memory only — opening writes nothing. It becomes the idempotency key of the save and the
 * high-entropy part of the private Task's local id (HK_FEATURE_13_PEOPLE.md, M0 finding 2). 20 bytes → 32 base-36 characters (~160
 * bits minted, ~155 kept). The random source is injected: the app passes expo-crypto's `getRandomBytes`; a test passes fixed bytes.
 */
export const DRAFT_KEY_BYTES = 20;

export function draftKeyFrom(bytes: Uint8Array): string {
  if (bytes.length < DRAFT_KEY_BYTES) throw new Error('a draft key needs at least 20 random bytes');
  let key = '';
  for (let i = 0; i < DRAFT_KEY_BYTES; i += 1) key += (bytes[i] % 36).toString(36) + (Math.floor(bytes[i] / 36) % 36).toString(36);
  key = key.slice(0, 32);
  if (!DRAFT_KEY_PATTERN.test(key)) throw new Error('draft key did not match its pattern');
  return key;
}
