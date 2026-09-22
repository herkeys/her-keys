# HK-FEATURE-07 — Owner checkpoints

Only genuinely NEW durable semantics appear here. Nothing below was implemented: no migration, no schema change, no RLS, no sync kind,
no dependent UI. Feature 07 stopped **only the affected capability** and continued everything else.

| ID | Semantic | Status |
|---|---|---|
| OC-1 | A handoff outcome ("this handoff took place") | **PREPARED — awaiting owner; capability stopped** |

---

## OC-1 — Handoff outcome

1. **User problem.** After a handoff time passes she wants to record, in her own words and only as her own record, that it took place —
   without rereading messages or keeping a mental note — and see it under "Recently completed".
2. **Missing canonical capability.** Nothing can record an outcome for an *event*. The only event outcomes are `cancelled` and `rescheduled`.
3. **Why existing semantics are insufficient.** `standingOf` says an event "never completes"; `VALID_OUTCOMES.event = [cancelled, rescheduled]`
   is enforced locally (`BehaviorObservationSchema`) and in the cloud (`behavior_observations.outcome_validity_check`). A responsibility
   `completed` records the *holder's* part, not the event; a task cannot stand in for an event without a second, competing model.
4. **Proposed domain type.** Add outcome `completed` to `VALID_OUTCOMES.event` — an append-only `BehaviorObservation` about the event,
   meaning "the user recorded that this took place". Copy would always read "You recorded this handoff complete."
5. **Storage representation.** No new table or column: one new permitted `(about_type='event', outcome='completed')` pair.
6. **Identity semantics.** Same `behavior_observations` identity (`local_id`); the subject is the existing event row.
7. **Ownership semantics.** Owner-private profile FK, exactly as every observation (`scope='personal'`).
8. **Lifecycle.** Append-only. A later `cancelled`/`rescheduled` is a separate observation; a correction is a new observation, never an edit.
   Recurrence: an observation would name the anchor row plus `planned_date`, so an occurrence's outcome is not the series'.
9. **Null / unknown semantics.** No observation = nothing recorded (never "missed", never "did not happen").
10. **Privacy scope.** Owner-only, like every observation. It would never be labelled shared, verified or legal evidence.
11. **RLS posture.** Inherited. No new policy; the existing observation insert/select policies apply.
12. **Sync representation.** Existing `observation` kind (create-only). No new kind.
13. **Migration shape.** One additive change: replace the `outcome_validity_check` constraint on `behavior_observations` with the same
    `CASE` plus `WHEN 'event' THEN outcome IN ('cancelled','rescheduled','completed')`.
14. **Populated-database behavior.** A constraint that only *widens* the accepted set cannot invalidate any existing row.
15. **Overlap.** Calendar (would own "was attended"), People (responsibility completion is distinct), Kids (child context only). Money and
    Systems: none. Life Admin: none.
16. **Alternatives considered.** (a) Use the responsibility `completed` state — **already used**, kept, but absent when no responsibility exists.
    (b) Create a task "Record handoff" — a second model. (c) A new `HandoffRecord` entity — explicitly forbidden. (d) Do nothing (chosen for now).
17. **Consequence of deferral.** A handoff itself can never show "you recorded this complete". The rest of Feature 07 is unaffected:
    a past handoff reads "This time has passed. Nothing is recorded about whether it happened", and the counterpart's responsibility can be
    recorded complete. Approving OC-1 would require a migration approval and would add nothing to Feature 07 except one button and one row type.
