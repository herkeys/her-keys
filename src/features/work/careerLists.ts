import { isOpportunityOpen, type CareerOpportunity, type OpportunityClosedReason, type OpportunityStage } from '../../domain/foundation/opportunity';

/** The words each stage and closed reason are shown with — one place, for the list and the form alike. */
export const STAGE_LABEL: Record<OpportunityStage, string> = {
  exploring: 'Exploring',
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  closed: 'Closed',
};

export const CLOSED_REASON_LABEL: Record<OpportunityClosedReason, string> = {
  withdrawn: 'I withdrew',
  declined_by_organization: 'They declined',
  offer_rescinded: 'Offer rescinded',
  no_further_response: 'No further response',
  other: 'Other',
};

export interface CareerLists {
  /** Still in play: any stage but Closed, not archived. Most recently moved first. */
  open: CareerOpportunity[];
  /** Closed and kept: her recorded outcome, still in view until SHE archives it. Closed is not archived (ADDENDUM J). */
  closed: CareerOpportunity[];
  /** Out of view, never gone: one tap away, where she can reopen it or restore it. Most recently archived first. */
  archived: CareerOpportunity[];
}

/**
 * Every opportunity she recorded, in exactly one list (HK13-D16). Career Next used to show only the open, unarchived ones, so a closed
 * opportunity vanished exactly as an archived one did — "closed" read as "gone", and "Restore from archive" was unreachable.
 */
export function careerListsOf(opportunities: readonly CareerOpportunity[]): CareerLists {
  const recentlyMoved = (a: CareerOpportunity, b: CareerOpportunity) => b.stageChangedAt.localeCompare(a.stageChangedAt) || a.id.localeCompare(b.id);
  const visible = opportunities.filter((o) => o.archivedAt === null);
  return {
    open: visible.filter((o) => isOpportunityOpen(o)).sort(recentlyMoved),
    closed: visible.filter((o) => !isOpportunityOpen(o)).sort(recentlyMoved),
    archived: opportunities
      .filter((o) => o.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '') || a.id.localeCompare(b.id)),
  };
}
