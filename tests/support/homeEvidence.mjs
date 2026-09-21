/**
 * STRUCTURAL SEMANTIC EVIDENCE for a Home item — the fields the contract names, and nothing presentational.
 * JSX snapshots are never used as domain proof; this is the domain reading of the item.
 */
export function evidenceOf(item) {
  return {
    homeItemId: item.homeItemId,
    canonicalKind: item.canonicalKind,
    homeContextId: item.homeContextId,
    homeSystemRole: item.homeSystemRole,
    attentionFacts: item.attentionFacts.map((f) => `${f.reason}/${f.urgency}`),
    responsibilityState: item.responsibility.state,
    coverageState: item.responsibility.coverage,
    dependencyStanding: item.dependency.readiness,
    durationSource: item.duration.kind === 'task' ? ({ 'user-provided': 'user', 'default-estimate': 'default', 'inferred-estimate': 'inferred', unrecorded: null }[item.duration.knowledge]) : 'not_applicable',
    recurrenceState: item.recurrence.state,
    lastDone: item.lastDone === null ? null : item.lastDone.date,
    lastDoneEvidenceType: item.lastDone === null ? null : item.lastDone.evidence,
    lastDoneApplicable: item.lastDoneApplicable,
    nextExpected: item.recurrence.nextExpected,
    scheduledState: item.scheduledState,
    resolutionState: item.resolutionState,
    unknownFacts: [...item.unknownFacts].sort(),
    availableActions: [...item.availableActions],
  };
}

export const evidenceOfView = (view) => view.items.map(evidenceOf);

export const sectionsOf = (view) => Object.fromEntries(view.sections.filter((s) => s.itemIds.length > 0).map((s) => [s.key, s.itemIds]));
