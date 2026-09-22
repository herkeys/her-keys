# HK-FEATURE-07 — Missing primitives register

Feature 07 (Co-Parent Logistics) built on `repair/hk-integration-readiness-01` @ `14bd58e`. This register lists capabilities the
repaired common foundation does NOT provide, what Feature 07 did about each, and whether a **new durable semantic** would be
needed to solve it properly. Feature 07 solved nothing globally: every "FEATURE-LOCAL: YES" row below is presentation or
composition over existing canonical rows, never a new entity, column, kind or policy.

Fields: **ID · CAPABILITY · ACTUAL FOUNDATION STATE · WHY EXISTING SEMANTICS ARE INSUFFICIENT · IMPACT · FEATURE-LOCAL SOLUTION? ·
NEW DURABLE SEMANTIC? · OWNER CHECKPOINT? · FUTURE DOMAIN · INTEGRATION TIMING**

---

### MP-07-01 · Post-bind child creation
- **State:** `children` exist only from the demo seed, from `claim` (children present before the first bind), and from pull hydration of
  `household_members` (`pullEngine.ts`). `member` is a MAPPING-ONLY sync kind ("claim creates them and claim alone"); no domain function
  adds a child; the IR01 backend ledger records it as **D6: "post-bind child creation has no server path (and no app path exists)"**.
- **Insufficient because:** a brand-new real household starts with `children: []` and cannot gain one.
- **Impact:** a real household with no child cannot create a child-linked handoff. Feature 07 shows a *named blocked state*
  ("no child is recorded in this household") and never invents a child, never matches by name.
- **Feature-local?** NO. **New durable semantic?** YES (a client write path for `household_members`, RLS, a sync kind).
- **Owner checkpoint?** YES — **owned by Kids OS / integration, not triggered by Feature 07** (Feature 07 is fully usable wherever a
  child exists). **Future domain:** Kids OS / People. **Timing:** before any real-household release.

### MP-07-02 · Handoff outcome ("this handoff took place")
- **State:** an event has no completion. `standingOf` documents it ("the calendar does not know whether it was attended; removal is
  retirement"); `VALID_OUTCOMES.event = [cancelled, rescheduled]` locally **and** in the cloud (`behavior_observations.outcome_validity_check`).
- **Insufficient because:** nothing can record that a handoff occurred, was attended, or was completed.
- **Impact:** Feature 07 cannot show a *handoff* as "recorded complete". It shows (a) a past handoff as "This time has passed. Nothing is
  recorded about whether it happened", and (b) the counterpart's **responsibility** as "recorded complete by you" when she completes it.
  RECENTLY COMPLETED lists only rows with real completion evidence (task `completedAt`, responsibility `completedAt`).
- **Feature-local?** NO. **New durable semantic?** YES (a new event outcome, i.e. a cloud CHECK migration).
- **Owner checkpoint?** **YES — prepared: `HK_FEATURE_07_OWNER_CHECKPOINTS.md` OC-1.** Only the affected capability is stopped.
  **Future domain:** Calendar / People. **Timing:** integration, with HK-INT-COPARENT-CALENDAR-01.

### MP-07-03 · Handoff direction (who sends, who receives)
- **State:** no direction on an event; the only person↔commitment association is a responsibility (who does it), which does not say
  whether the user is sending or receiving (a person-held responsibility looks identical in "Alex drops off" and "Alex picks up").
- **Impact:** Feature 07 never states a direction. It shows the user's OWN title verbatim, offers title starters (Drop-off / Pickup /
  Handoff) that only write words she can edit, and never infers from who created the row. Both user-sending and user-receiving cases are
  covered by tests that assert the projection carries no direction field and no invented direction copy.
- **Feature-local?** YES (title starters + no inference). **New durable semantic?** YES if structured direction is ever wanted.
- **Owner checkpoint?** NO (not required by the Feature 07 contract). **Future domain:** Calendar. **Timing:** integration.

### MP-07-04 · Child lifecycle (archived / inactive child)
- **State:** `Child` has no `status`; state validation rejects a reference to a missing child.
- **Impact:** "child archived" cannot occur in stored state. Feature 07 reads defensively: a transition whose `subjectMemberId` is not a
  current child (or is the adult) is NEEDS REVIEW, never re-attached to another child, never matched by name. `childStanding()` is the
  one function to extend if Kids OS adds a lifecycle.
- **Feature-local?** YES (defensive read). **New durable?** YES (a status). **Owner checkpoint?** NO. **Future domain:** Kids OS.

### MP-07-05 · Recurrence exceptions and per-occurrence state for events
- **State:** a recurrence rule is stored on the anchor event; `projectDay` does not expand it; `skipOccurrence` is typed for
  task/system/meal only; responsibility and dependencies attach to the anchor row, not to each date.
- **Impact:** a *derived* future date carries no responsibility/preparation of its own. Feature 07 says so ("Recorded for <date>. Nothing
  is recorded for this date.") and never carries an acceptance forward to a date that has none.
- **Feature-local?** PARTIAL (labels only). **New durable?** YES (per-occurrence rows/exceptions). **Owner checkpoint?** NO.
  **Future domain:** Calendar. **Timing:** HK-INT-COPARENT-CALENDAR-01.

### MP-07-06 · Request delivery / provider
- **State:** the intent → decision → execution → outcome model exists (`delegation_request`, `outbound_message`, `delivered`,
  `acknowledged`, `paid`), but executions/outcomes are server-written and no provider exists.
- **Impact:** nothing can be *sent*. Feature 07 renders "sent"/"delivered"/"payment reported" **only** from execution/outcome rows that
  exist; the user-recorded responsibility states are labelled "recorded by you". Task created / request recorded ≠ request sent.
- **Feature-local?** N/A. **New durable?** NO (model exists). **Owner checkpoint?** NO. **Future domain:** integrations. **Timing:** later.

### MP-07-07 · Reimbursement lifecycle (owed / requested / paid / settled)
- **State:** only an amount-bearing task (`value` facet), a responsibility about it, and a possible server `paid` outcome.
- **Impact:** Feature 07 uses the **task bridge**: cost → follow-up task → amount → counterpart → follow-up date. It never says owed,
  requested (as a fact), paid or settled. A completed follow-up task is "marked done", not payment.
- **Feature-local?** NO. **New durable?** YES (a lifecycle). **Owner checkpoint?** NO (task bridge is acceptable for V1).
  **Future domain:** Money OS. **Timing:** HK-INT-COPARENT-MONEY-01.

### MP-07-08 · Household currency
- **State:** no currency default anywhere in state or code; `Money` requires an ISO code.
- **Impact:** the money editor makes currency an explicit chip. The one convenience: the currency of an amount she has already recorded
  in her own household is pre-selected and visibly selected (never silent). No amount is saved without a currency she can see.
- **Feature-local?** YES. **New durable?** YES if a household currency is wanted. **Owner checkpoint?** NO. **Future domain:** Money OS.

### MP-07-09 · Per-child counterpart relationship
- **State:** no child → other-parent relation. `HouseholdPerson.relationship` (`co-parent`, `caregiver`, …) exists and is user-provided.
- **Impact:** the counterpart is derived only from the person held by a responsibility about a record. Feature 07 never assumes one
  co-parent per household and never labels anyone "co-parent" unless `relationship === 'co-parent'`.
- **Feature-local?** YES. **New durable?** YES (a relation). **Owner checkpoint?** NO. **Future domain:** People OS.

### MP-07-10 · "Task about a person" (follow-up WITH someone)
- **State:** the only canonical person↔task association is a responsibility, whose holder is who *does* the task.
- **Impact:** for a money follow-up the counterpart is recorded as the responsibility holder in the *requested* state and worded
  "You recorded a request to <name>" — never "<name> owes". Ambiguity flagged for Money/People OS to define "follow up with".
- **Feature-local?** YES (copy-bounded). **New durable?** YES for a true relation. **Owner checkpoint?** NO.

### MP-07-11 · Per-field provenance for facets (`needsMePersonally`, `value`, `commitment`)
- **State:** a row has one provenance; a facet has none. There is no writer for `needsMePersonally` or `value` after creation
  (`updateTask`/`updateEvent` do not accept them); existing fixtures set them by object spread.
- **Impact:** Feature 07 writes a facet only from an explicit form field, through a feature-owned transition over existing, sync-updatable
  columns (`needs_me_personally`, `value_*`). No new column, kind or grant.
- **Feature-local?** YES. **New durable?** NO. **Owner checkpoint?** NO.

### MP-07-12 · Sensitivity class for a field (location + time glanceability)
- **State:** no per-field privacy classification; Today/Calendar show an event's location wherever they show the event.
- **Impact:** Feature 07's hub never prints a location (progressive disclosure on detail). Feature 07 cannot change Today/Calendar; a
  co-parenting event appears there as any event does. **Recorded for integration** (see HK-INT-COPARENT-CALENDAR-01).
- **Feature-local?** YES for Feature 07's own surfaces. **New durable?** YES (a classification). **Owner checkpoint?** NO.

### MP-07-13 · Shared attention contradicts ACKNOWLEDGED ≠ ACCEPTED
- **State:** `attentionFor` (`reasoning/attention.ts`) treats an *acknowledged* delegation as "handled elsewhere" in its `risk` branch.
- **Impact:** Feature 07 does not import `attentionFor`; it derives facts with the shared `isUnacknowledged`, `standingOf`, `readinessOf`.
  **Recorded for integration** (HK-INT-COPARENT-KIDS-ATTENTION-01 / Today).
- **Feature-local?** N/A. **New durable?** NO. **Owner checkpoint?** NO.

### MP-07-14 · The generic event editor files co-parenting events as `household` scope
- **State:** `EventForm` always saves `scope: 'household'`, even for the co-parenting category; `household` rows are visible to every
  household member (RLS), `coparent-shared` rows are owner-only.
- **Impact:** Feature 07 creates its rows as `coparent-shared` (owner-only). A co-parenting event made through the generic editor is
  visible to other household adults; Feature 07 does not rewrite existing rows' scope (an edit never changes scope) and says nothing about
  visibility for rows that are not owner-only. **Recorded for integration.**
- **Feature-local?** N/A. **New durable?** NO. **Owner checkpoint?** NO.
