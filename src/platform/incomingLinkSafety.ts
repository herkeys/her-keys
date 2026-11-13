/** Bound untrusted URLs before any permissive third-party query decoder sees them. */
export const MAX_INCOMING_LINK_LENGTH = 2048;

export function isUnparseableLink(url: string): boolean {
  if (typeof url !== 'string' || url.length > MAX_INCOMING_LINK_LENGTH) return true;
  try {
    decodeURIComponent(url);
    return false;
  } catch {
    return true;
  }
}
