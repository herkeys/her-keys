# HK-FEATURE-08 — Missing primitives register and integration candidates

Recorded at ML1 from the read-only foundation trace (baseline `14bd58e`). "Pre-approved MealPlanEntry covers?" refers to the closed contract in `HK_FEATURE_08_MEALS.md` §8. Nothing here was invented to make Feature 08 look complete.

## A. Missing primitives

### MP-01 — HK-MISSING-MEALS-LINK-01: MealPlanEntry → canonical grocery/prep work relationship (Meals-specific #1)

- **Capability:** "Tacos on Tuesday → buy tortillas": durable, neutral relationship from a meal decision to the task(s) she created for it.
- **Actual foundation state:** `dependencies` relations are `requires | part_of | alternative_to`; edges are `scope: 'personal'` and have no UI caller. `requires` meal→task asserts the meal is `blocked` until the task completes; task→meal is blocked forever (a meal is never satisfied). `part_of` reads as "step of", is personal-scope for a household meal, and sits beside goal-step progress semantics. `relatedTo` only gathers rows.
- **Why insufficient:** every existing relation either asserts something false (blocking/readiness/progress) or has the wrong visibility.
- **Impact:** Meals tasks are listed together under "Meal tasks", not under the meal they serve; F08 never says or implies "for Tacos".
- **Feature-local solution?** No (title matching is forbidden; hidden local metadata is forbidden).
- **Pre-approved MealPlanEntry covers?** No.
- **New durable semantic?** Yes (a neutral link).
- **Owner checkpoint?** Yes, before any implementation.
- **Future domain:** shared canonical structure / Meals.
- **Integration timing:** first Meals-specific checkpoint after F08 certification.

### MP-02 — Stable Meals task list role (TASK_LIST_ROLES)

- **Capability:** Meals-category tasks listed on the Meals screen and removed from the Life hub's "Other open tasks", like Kids, Home, Money and Work.
- **Actual state:** the stable context exists (`systemRole: 'meals'`); `TASK_LIST_ROLES` omits it (`taskLists.ts:16`); `tests/build3Audit.capture.test.mjs:125` pins the exact list.
- **Why insufficient:** none for F08 — option B (Meals projection over `openTasksInCategory`) is truthful; the cost is that a Meals task is also listed under Life "Other open tasks".
- **Impact:** same canonical task shown on two Life screens; nothing hidden.
- **Feature-local solution?** Yes (chosen). **Covers?** n/a. **New durable semantic?** No. **Owner checkpoint?** Cross-cutting, decide at Life registration integration.
- **Integration candidate:** HK-INT-MEALS-TASKLIST-ROLE-01.

### MP-03 — Common behavior / observation hook

- **Capability:** record that a canonical row was created, moved or removed, for future pattern intelligence.
- **Actual state:** `appendObservation` has no writers for creation or edit of any kind; the meal vocabulary is `completed | skipped` only (Zod and cloud CHECK).
- **Why insufficient:** any available meal outcome would assert execution.
- **Impact:** planning history lives only in the MealPlanEntry rows themselves (status, date), not as behavior events.
- **Feature-local solution?** No. **Covers?** No. **New durable semantic?** Extending the vocabulary is one (plus a CHECK migration). **Owner checkpoint?** Yes.
- **Integration candidate:** HK-INT-MEALS-PATTERN-01.

### MP-04 — Due-date provenance

- **Capability:** record whether a task's date was stated by her, defaulted, derived from context or inferred.
- **Actual state:** none (`dueSource` / `dateSource` / `dueProvenance` = 0 hits); row provenance cannot express "derived from context" and `artifactId` must name a SourceArtifact.
- **Impact:** F08 must require explicit confirmation before any meal-derived date is persisted, and reports `dueDateSource: 'not-recorded'` for every dated task.
- **Feature-local solution?** Yes (confirmation rule). **New durable semantic?** Yes (a provenance field on Task). **Owner checkpoint?** Yes.

### MP-05 — Responsibility surface and delivery

- **Capability:** ask another person to take a meal task, and learn whether they saw or accepted it.
- **Actual state:** the state model exists (seven states, no `covered`); no UI; nothing delivers a message; `attention.ts:60-62` and `oneMove.ts:118` wrongly treat acknowledged/accepted as handled; `accept()` defaults `stillNeedsMe=false`.
- **Impact:** F08 displays responsibility read-only and builds no "ask" action.
- **Feature-local solution?** Display only. **Owner checkpoint?** Delivery integration and the coverage-semantics defects belong to the responsibility owner.

### MP-06 — Recurrence and Systems creation / materialization

- **Actual state:** `addRecurrence` / `occurrencesOf` / `nextOccurrence` have no caller; completing a task does not materialize the next occurrence; no lister; no production System create path; rules are `scope: 'personal'`.
- **Impact:** "Recurring meal work" is a read-only projection that is empty at this baseline. F04 owns creation.
- **Integration candidate:** HK-INT-MEALS-SYSTEMS-01.

### MP-07 — Archive retention / pruning

- **Actual state:** no hard delete anywhere for `authenticated`; only `discovery` has a tombstone. Archive-only removal accumulates rows; F08 raises the cap to 5000 and refuses at the cap.
- **Impact:** at very high volume a household cannot add more meals until a retention policy exists.
- **Owner checkpoint:** yes (pruning or hard-delete is a new semantic).

### MP-08 — Meal creation time / last-change time

- **Actual state:** meals have no `createdAt`/`updatedAt`; the cloud has `origin_created_at`/`origin_updated_at` (granted, unused by the meal projection).
- **Impact:** none for V1 (ordering is `(date, slot, id)`, and ids embed creation time). Adding the two fields later needs no SQL.
- **Considered / deferred.**

### MP-09 — Dietary / allergy context

- **Actual state:** none anywhere; only unstructured `Task.notes`. Any future context must be surfaced with attribution and never as safe or allergen-free. **Owner checkpoint:** yes (medical-adjacent semantic).

### MP-10 — Per-record conflict handling

- **Actual state:** whole-row CAS; archive vs rename collides; the only UI is the generic "N changes need your attention" (Today). No meal case in `clash.ts`.
- **Impact:** a lost cross-device edit is preserved as evidence, not shown per meal.

### MP-11 — Cloud hydration exposed to screens

- **Actual state:** `identity.sync.hydration` is read by no screen. F08 reads `useAccount().syncNamespace` in its own screen gate so a newly bound device never shows "No meals planned yet" before its first pull. A shared hook would be cleaner.

### MP-12 — Household timezone change

- **Actual state:** `state.user.timezone` is set once and never updated (travel deferred, `logicalDay.ts:9`). F08 is correct for both cases (entries are calendar dates), but "today" cannot follow a moved household until the foundation supports it.

### MP-13 — Child-scoped meals

- **Actual state:** the enum and the cloud allow `child` (with `subject_member_id`); the local meal schema has no subject field, so it cannot be produced. F08 adds no child behavior. **Integration candidate:** HK-INT-MEALS-KIDS-01.

### MP-14 — Meal notes

- **Actual state:** none authorized. A durable notes field needs an owner checkpoint (privacy: free text crossing the account boundary).

### MP-15 — Same-household second account (product path)

- **Actual state:** the RLS policies support it; no product path creates a second adult (only `bootstrap_account`; no invitations). Tested as a constructed actor only.

### MP-16 — Plan This Again lineage

- **Actual state:** provenance `artifactId` must name a SourceArtifact, so a new entry cannot record which entry it was reused from.

### Observed, out of scope (not repaired — no opportunistic cleanup)

- `src/domain/sync/applySupport.ts:63` — a regex written `/^d{4}-d{2}.../` (backslashes missing) so `looksLikeInstant` never matches.
- `src/domain/account/claim.ts` contains a raw NUL byte at offset 13423 (the search tool treats it as binary).
- `src/domain/responsibility.ts` `accept()` defaults `stillNeedsMe=false`, contradicting its own comment; `attention.ts` / `oneMove.ts` treat acknowledged/accepted as handled.
- Hard-coded run-state copy elsewhere ("Working", "N systems running").

## B. Integration candidates (recorded, not implemented)

| ID | Candidate | Note |
| --- | --- | --- |
| HK-INT-MEALS-TODAY-01 | grocery/prep → Today | canonical confirmed-date tasks already reach Today; explicit meal projection is separate |
| HK-INT-MEALS-CALENDAR-01 | explicit scheduling → Calendar | a planned meal is not a scheduled time |
| HK-INT-MEALS-SYSTEMS-01 | repeated work → Systems | needs F04 creation and materialization |
| HK-INT-MEALS-KIDS-01 | legitimate child food context → Kids | needs child subject on meals |
| HK-INT-MEALS-MONEY-01 | grocery financial context → Money | Money OS owns it; no budget in Meals |
| HK-INT-MEALS-HOME-01 | household operation boundary → Home | |
| HK-INT-MEALS-COPARENT-01 | food/prep transitions → Co-Parent | |
| HK-INT-TIO-MEALS-01 | Talk It Out → reviewed MealPlanEntry proposal | suggestion ≠ decision |
| HK-INT-MEALS-PATTERN-01 | planning history → pattern intelligence | receives entries as PLANNING RECORDS; needs MP-03 |
| HK-INT-MEALS-TASKLIST-ROLE-01 | add `meals` to `TASK_LIST_ROLES` | resolves the double listing; edits a shared constant and one exact-equality test |
| HK-INT-WAVE2-LIFE-REGISTRATION | final Life hub registration | the Meals route and hub row already exist at the baseline; only registration policy remains |
| HK-INT-MEALS-RUNMJS-01 | `run.mjs` post-baseline migration count | every branch that adds a migration edits the "exactly N migrations" check; merge will conflict on it |
