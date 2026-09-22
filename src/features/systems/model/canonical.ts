/**
 * Deterministic JSON: object keys sorted at every depth, arrays kept in their given order.
 *
 * One serializer for two jobs that both need a value to have exactly one text form: the content
 * fingerprint the editor uses to notice canonical state moved underneath it, and the committed
 * structural evidence files that are compared against regenerated output.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonicalize(v)])
    );
  }
  return value;
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

/** Pretty, stable, newline-terminated: the form committed under `tests/fixtures/systems/scenarios/`. */
export const evidenceText = (value: unknown): string => `${JSON.stringify(canonicalize(value), null, 2)}\n`;
