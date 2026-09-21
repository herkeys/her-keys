# HK-HOSTILE-AUDIT-01 — Owner decision register

These are only decisions that cannot be derived safely from existing doctrine. Implementation gaps with a clear conservative answer are not listed as owner choices.

## OD-01 — What does removal of a prerequisite mean?

**Question:** when a dependency edge still points to a task/event that was intentionally removed, is the prerequisite satisfied, unsatisfied, or separately retired?

**Why existing semantics cannot resolve it:** “removed” says the canonical commitment is no longer active; it does not say the real-world prerequisite was completed. Product doctrine requires `REMOVED ≠ COMPLETED`, but it does not say whether the dependent obligation itself should be cancelled or replanned.

**Options:**

1. Treat removal as satisfied. Lowest friction, but can falsely unlock dependent work.
2. Keep it unmet. Most conservative, but can leave permanent waiting state with no correction path.
3. Add explicit dependency retirement/replacement evidence. Truthful and correctable, but adds a lifecycle primitive and migration.

**Auditor recommendation:** option 3. Until implemented, use option 2 in reasoning and copy it as “prerequisite no longer available,” never “completed.”

**Blocking:** yes, for dependency reconciliation.  
**Decision deadline:** BEFORE INTEGRATION.

## OD-02 — How is task duration knowledge represented?

**Question:** should absent duration remain null, or should the default estimate remain numeric with a durable source/confidence marker?

**Why existing semantics cannot resolve it:** quick capture intentionally avoids burden, but capacity must distinguish unknown/default from user-provided fact. The current local and cloud schemas store only the number.

**Options:**

1. Make duration nullable and treat null as unknown.
2. Keep the estimate and add `durationSource` (`user`, `default`, `inferred`, `import`) plus optional confidence.
3. Keep the current 15-minute value and soften all copy; this still cannot support trustworthy reasoning.

**Auditor recommendation:** option 2; it preserves low-friction capture while preventing confidence escalation. Fallback to option 1 if the smaller contract is preferred.

**Blocking:** yes, for F03 backend integration and capacity truth.  
**Decision deadline:** BEFORE INTEGRATION.

## OD-03 — Are Systems allowed to be child-specific?

**Question:** should a System carry a child subject as the cloud schema already supports?

**Why existing semantics cannot resolve it:** the cloud explicitly models and constrains `subject_member_id`, while the local canonical model and F04 editor do not. Removing it and implementing it are both schema/product choices.

**Options:**

1. Add `subjectMemberId` locally, enforce child-scope pairing, and expose correction/editing.
2. Remove child scope/subject from cloud Systems until a later feature.
3. Keep cloud-only support. Rejected: it guarantees a lossy round trip.

**Auditor recommendation:** option 1 because household routines commonly belong to a child and the server contract is already designed for it.

**Blocking:** yes, before child Systems or general F04 cloud wiring.  
**Decision deadline:** BEFORE INTEGRATION.

## OD-04 — Should Talk It Out retain exact source words?

**Question:** should raw voice/text survive the session, and under what retention/consent policy?

**Why existing semantics cannot resolve it:** provenance deliberately records that evidence arrived without equating metadata with raw content. Durable source improves correction/audit but materially changes privacy, deletion and security obligations.

**Options:**

1. Keep exact words session-only; persist structured interpretation plus digest/reference metadata.
2. Encrypt and retain raw content for a short user-visible period with explicit deletion.
3. User-selectable retention with a session-only default.

**Auditor recommendation:** option 1 for initial integration; revisit option 3 only with an end-to-end privacy design.

**Blocking:** no for current F02; yes before any UI promises verbatim recall.  
**Decision deadline:** BEFORE BETA.

## OD-05 — What is a System occurrence/run?

**Question:** what durable record proves that a scheduled System occurrence existed, ran, was skipped, or completed?

**Why existing semantics cannot resolve it:** the current model holds a System definition, ordered steps and recurrence rule. A computed next date is not an occurrence, and a definition edit is not execution evidence.

**Options:**

1. Add a materialized occurrence/run entity with per-step or aggregate lifecycle.
2. Keep Systems definition-only and make no execution/history claims.
3. Infer runs from elapsed schedule dates. Rejected as epistemically false.

**Auditor recommendation:** option 2 for initial integration, then option 1 in an authorized execution/history wave.

**Blocking:** no for definition-only F04; yes for reminders that claim completion/history.  
**Decision deadline:** BEFORE BETA if run behavior is in scope; otherwise BEFORE PRODUCTION.

## OD-06 — What removal lifecycle do Systems and steps use?

**Question:** may a System/step be retired, archived or deleted, and what happens to references/history?

**Why existing semantics cannot resolve it:** no legitimate command exists today. Hard deletion risks referential history; permanent undeletability creates burden.

**Options:**

1. Archive/retire definitions and steps while preserving ids/history.
2. Permit deletion only when unreferenced, otherwise retire.
3. Permanent no-removal policy.

**Auditor recommendation:** option 1, with an explicit status and no inference that retirement completed prior occurrences.

**Blocking:** no for current truthful unavailable UI; yes before offering removal controls.  
**Decision deadline:** DURING INTEGRATION for UX planning; BEFORE BETA for implementation.

## OD-07 — What safety behavior follows high-stakes capture?

**Question:** after high-stakes content is correctly kept out of Discovery, should the product only capture it, show crisis/support resources, or invoke another explicitly authorized flow?

**Why existing semantics cannot resolve it:** the routing truth is clear, but advice/escalation varies by jurisdiction and carries safety/privacy obligations.

**Options:** capture and remain neutral; show localized opt-in resources; introduce a separately reviewed safety workflow.

**Auditor recommendation:** keep the repaired capture-first route and use clearly optional resources only after legal/safety review. Never silently contact or execute.

**Blocking:** no for the repaired F02 route.  
**Decision deadline:** BEFORE BETA.
