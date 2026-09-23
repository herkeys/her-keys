/**
 * Ids for Life Admin drafts, allocated when a sheet OPENS (allocating an id changes nothing; only a save creates a row). Saving the
 * same draft twice names the same ids, so a double tap or a retry is a no-op instead of a second record or a second Task.
 *
 * Unlike the shared draft ids (4 random base36 characters), these carry about 128 random bits. A Task created from a private
 * record is unique in the cloud per (household, local id), across owners (`MP-12-01`): a long random local id means another member
 * of the household cannot confirm that such a Task exists by guessing its id. Screen code only: the domain never reads a clock or
 * a random source.
 */
export function newLifeAdminDraftId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomHex32()}`;
}

function randomHex32(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID().replace(/-/g, '');
  if (typeof cryptoApi?.getRandomValues === 'function') {
    return Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // No platform random source: several independent draws, each contributing 32 bits.
  let out = '';
  while (out.length < 32) out += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return out.slice(0, 32);
}
