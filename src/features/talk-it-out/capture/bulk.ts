import { isUndecidedReadingTitle, type Interpretation } from '../../../domain/foundation/interpretation';
import type { AppState } from '../../../domain/state';
import type { CaptureDetail } from './coordinator';

/**
 * WHICH READINGS "SAVE THE READY ONES" MAY SAVE.
 *
 * Saving several things at once is a convenience for the easy cases, never a way round review. A reading is eligible only when saving it
 * alone would also be unremarkable: it is open, named, has an area, and there is NOTHING she was told to check. Everything else keeps its
 * own card and its own Save, exactly as before:
 *
 *   - an assumption was made (a guessed day, AM/PM or length, a shortened title, "you weren't sure", a possible duplicate, or a Premium
 *     reading, whose own note says to check each detail) - the reading must be looked at;
 *   - the session no longer knows what was assumed (after a restart) - the card already says "check the day and time";
 *   - it carries money - a transaction is never saved as a side effect of a batch;
 *   - it is about one of her children - a child's commitment is never saved as a side effect of a batch;
 *   - a question is open, it was never named, or its area is not chosen - it cannot be saved at all yet.
 *
 * Pure: it reads, it never writes.
 */

export type BulkIneligibleReason =
  | 'not-open'
  | 'question-open'
  | 'needs-title'
  | 'needs-area'
  | 'assumption-made'
  | 'assumptions-unknown'
  | 'money'
  | 'child';

export type BulkEligibility = { ok: true } | { ok: false; reason: BulkIneligibleReason };

export function bulkEligibility(
  state: Pick<AppState, 'categories'>,
  reading: Interpretation,
  details: CaptureDetail | null,
  chosenCategoryId?: string | null
): BulkEligibility {
  if (reading.state === 'clarifying') return { ok: false, reason: 'question-open' };
  if (reading.state !== 'pending') return { ok: false, reason: 'not-open' };
  if (isUndecidedReadingTitle(reading.title)) return { ok: false, reason: 'needs-title' };
  if (reading.clarification !== null) return { ok: false, reason: 'question-open' };
  if (reading.value !== null) return { ok: false, reason: 'money' };
  if (reading.subjectMemberId !== null) return { ok: false, reason: 'child' };
  if (details === null) return { ok: false, reason: 'assumptions-unknown' };
  if (details.assumptions.length > 0) return { ok: false, reason: 'assumption-made' };
  if (reading.proposedKind !== 'needsMe') {
    const active = (id: string) => state.categories.some((c) => c.id === id && c.status === 'active');
    const hinted = reading.categoryHint !== null && state.categories.some((c) => c.systemRole === reading.categoryHint && c.status === 'active');
    const chosen = chosenCategoryId !== undefined && chosenCategoryId !== null && active(chosenCategoryId);
    if (!chosen && !hinted) return { ok: false, reason: 'needs-area' };
  }
  return { ok: true };
}
