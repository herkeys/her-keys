/**
 * Where the woman's exact words are held.
 *
 * The foundation's `SourceArtifact` stores NO text by design (ADR-011: "Her words stay out of the
 * canonical household record"); it holds only an opaque `contentRef` into "a future content store".
 * That store does not exist, and whether to create one — durable, on-device, unencrypted raw narrative —
 * is a privacy-boundary and product-policy decision, not one this feature may take (ledger: OD-1).
 *
 * So this build holds her words IN MEMORY for the running session only, behind this one interface.
 * What that means, stated plainly and asserted by tests:
 *   - the review can show "what you said" while the app is open;
 *   - retrying a reading that failed before it finished works while the app is open;
 *   - after the app closes the wording is gone; the structured readings (durable) remain reviewable and
 *     any question they were asking is regenerated from the durable reading, but a source with no
 *     readings cannot be re-read and is listed honestly as such.
 *
 * Moving to a durable store later replaces this one implementation. Nothing here logs, serialises,
 * or sends the text anywhere.
 */
export interface CaptureTextStore {
  put(contentRef: string, text: string): void;
  get(contentRef: string): string | null;
  has(contentRef: string): boolean;
  delete(contentRef: string): void;
  /** The references currently held, so words no source refers to any more can be forgotten. */
  refs(): string[];
  /** Forget everything held. */
  clear(): void;
}

export function createMemoryCaptureTextStore(): CaptureTextStore {
  const held = new Map<string, string>();
  return {
    put: (ref, text) => void held.set(ref, text),
    get: (ref) => held.get(ref) ?? null,
    has: (ref) => held.has(ref),
    delete: (ref) => void held.delete(ref),
    refs: () => [...held.keys()],
    clear: () => held.clear(),
  };
}

/**
 * Forget any held words whose source no longer exists (a household reset, a withdrawn source). The words are
 * only ever reachable through a source, so an orphan is unreachable memory holding something she said.
 */
export function pruneOrphans(text: CaptureTextStore, liveRefs: ReadonlySet<string>): void {
  for (const ref of text.refs()) if (!liveRefs.has(ref)) text.delete(ref);
}
