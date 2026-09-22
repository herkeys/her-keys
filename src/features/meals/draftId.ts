/**
 * An id for a sheet's draft, allocated when the sheet opens. Saving the same draft twice (a double tap, a retry after a slow save)
 * then names the same id, and the action treats the repeat as a no-op instead of creating a second entry. It looks like a production
 * id (prefix, time, a little randomness) and satisfies the same id pattern. Screen code only: the domain never reads the clock.
 */
export function newDraftId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${prefix}-${time}-d${random}`;
}
