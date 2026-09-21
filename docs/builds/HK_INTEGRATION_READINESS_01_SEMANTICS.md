# HK-INTEGRATION-READINESS-01 — final canonical contracts

Four shared truths (three from the repair, one from the owner's resolution of OD-A) every feature (and the future AI layer) may rely on. Each is a *derived or typed fact in the one canonical
state*, never a feature-local convention. Each record below states: definition, invariants, storage, serialization, sync
representation, consumer expectations, legacy behaviour, unknown behaviour, prohibited interpretations.

---

## 1. DEPENDENCY REMOVAL (HA-009) — `REMOVED != COMPLETED`, `MISSING != SATISFIED`

**Definition.** Where a referenced prerequisite *stands* is derived, on read, from lifecycles that already exist:

| Standing | Meaning | Task | Event | Needs Me | Goal | System / Meal |
|---|---|---|---|---|---|---|
| `satisfied` | finished in the way its kind finishes | `completed` | — (an event never "completes") | `resolved` | `achieved` | — |
| `pending` | live and unfinished | `open` | `active` | `open` | `active`, `paused` | present |
| `unavailable / retired` | set aside, **not** finished | `archived` | `removed` | — | `abandoned` | — |
| `unavailable / missing` | no such row (state validation refuses a dangling edge; this is the defensive read) | absent | absent | absent | absent | absent |

`readinessOf(ref)` over its active `requires` edges: `blocked` if anything is `pending`; else `needsReview` if anything is
`unavailable`; else `ready`.

**Invariants.**
* `isDone` is true only for `satisfied`. An event is never done; removal is retirement.
* A dependency row is **never** rewritten, deleted, re-pointed or marked satisfied because its target was removed. History is
  preserved exactly. (`removeDependency` is the *only* writer of edge `removed`, and it is an explicit act.)
* `blockersOf` names only `pending` prerequisites: nothing keeps asserting that a removed thing still exists.
* `isBlocked = readinessOf !== 'ready'`: conservative. A retired prerequisite unlocks nothing.
* One edge means the same thing whatever its target kind (a removed event and an archived task are both `unavailable/retired`).

**Storage / serialization / sync.** *None new.* The standing is computed; nothing is stored and there is no schema change. The
inputs (`status` of task/event/needsMe/goal, dependency `status`) already persist and sync. Second devices converge by pulling the
target's status.

**Consumer expectations.** Ask `standingOf` / `readinessOf`; never test `status === 'removed'` and call it done. Word a
`needsReview` dependent as *review needed / something it needed is no longer available* — never "handled", "done", "ready" or
"needs {the removed thing}". Offer the existing correction: retire the edge (`removeDependency`) or replace what it needs.
`goalProgress` reports `unavailable` steps and never counts them done.

**Legacy.** Every stored dependency and every stored lifecycle keeps its meaning; only the reading of a removed event changes
(done → unavailable). No migration.

**Unknown.** A target with no lifecycle (System, Meal) is `pending` while present, never `satisfied`.

**Prohibited interpretations.** removed ⇒ completed; missing ⇒ satisfied; archived ⇒ completed; "the dependent is unblocked because
its prerequisite is gone"; re-pointing an edge to a substitute; deleting an edge to simplify a screen.

**Known limitation (debt).** Needs Me `resolved` also covers *promotion to a task* (`needsMe.ts:56`), so a promoted item reads
`satisfied` although the work moved. Not part of this defect; recorded.

---

## 2. DURATION KNOWLEDGE (HA-010) — `DEFAULT != USER-PROVIDED`

**Definition.** `Task.durationMinutes` is a number kept **for computation only**. `Task.durationSource` says how far that number may
be trusted as a fact:

| Value | Meaning | Written by |
|---|---|---|
| `user` | she entered or confirmed the number herself in a duration field | `TaskForm` when the field was touched; `updateTask` when told so |
| `default` | nobody supplied one; the planning default (15) stands in — an *assumption*, never a statement | `addTask` with no duration; `TaskForm` when untouched |
| `inferred` | Her Keys read or derived it (from her words in a reading she *approved*, or by an approved recommendation such as shortening) — approved, not stated | `acceptInterpretation`, `approveShortenTask` |
| `null` | provenance never recorded: **not** user-provided, **not** a known default — unknown | every pre-existing row; any bare number written without a stated origin; a cloud row with no source |

`durationKnowledgeOf(task)` maps these to `user-provided | default-estimate | inferred-estimate | unrecorded`;
`isUserProvidedDuration(task)` is true **only** for `user`.

**Invariants.**
* The source is never inferred from the value: an explicit 15 and a default 15 differ only in `durationSource`.
* `addTask` never assumes a supplied number is hers (`null` unless the caller states a source).
* `updateTask`: a *changed* number without a stated source does **not** inherit the old source (→ `null`); an unchanged number
  leaves it alone; an explicit source is honoured (this is how "she confirmed the default 15" is recorded).
* A source outside the vocabulary is refused (local schema, cloud CHECK, claim).

**Storage.** Local: `TaskSchema.durationSource = enum | null`, `.default(null)` — the existing nullable-facet pattern, so a stored task
with no key decodes to `null` (**no envelope version bump; a second save does not upgrade ambiguity**). Cloud:
`tasks.duration_source text NULL CHECK (NULL or 'user'|'default'|'inferred')`, **no default**, column-level INSERT/UPDATE grants for
`authenticated` only, added by the additive migration `20260921120000_ir01_duration_source_and_claim_v3.sql`.

**Serialization / sync.** Projected as `duration_source`; applied as `durationSource`; in `UPDATABLE_COLUMNS.task`; compared by
`rowMatchesLocal` (a lost acknowledgement is recognised only when the source matches). Claim payload **v3** carries it per task
(`null` stays `null`; a v2 claim has none to carry and stores `NULL`).

**Consumer expectations.** A feature may say *you said N minutes* only when `isUserProvidedDuration`. For `default-estimate` and
`unrecorded` it must say *estimate / assumed / not recorded*; for `inferred-estimate` *Her Keys estimated*. Capacity may **compute**
with the number but must carry the knowledge into any claim it makes (a "fits" computed from an assumption is an assumption).
Calendar's `0 = no usable duration` convention is unchanged and independent.

**Legacy.** Rows saved before this contract read `unrecorded`. In the cloud, existing rows keep `NULL` (proved on a populated
database, harness ENV D). Nothing is promoted to `user` or `default`.

**Unknown.** A genuinely unknown duration is represented as the default *estimate* (`default`), not as a missing number, because
capacity arithmetic needs a number; the knowledge that it is an assumption is what is durable.

**Prohibited interpretations.** treating `duration === 15` as either user-provided or default; upgrading `null` to `user`; letting a
changed number inherit the previous source; copy that says "you said" for anything but `user`; sending `'user'` for a null source.

---

## 3. SYSTEM SUBJECT IDENTITY (HA-011)

**Definition.** `HouseholdSystem.subjectMemberId` is the child a routine is *about*, in the **same member identity space** as a Task
or Event subject (`state.children[].id`), mapped to `household_members.id` through the `member` mapping. `null` means a
household-level routine. It is an id — never a name, never guessed, never defaulted to "the first child".

**Invariants** (`findIntegrityProblems`, mirroring the cloud):
* a non-null subject must be a **child** of this household (the account user is *not* a subject — the cloud composite foreign key
  admits `member_type = 'child'` only);
* `scope: 'child'` requires a subject; a household-scope routine may still name one (the rule is one-way, as in the cloud);
* a state that removes the child a System still names is **invalid** — the mutation is refused, the subject is not silently erased.

**Storage.** Local: `subjectMemberId: Id.nullable().default(null)` (no version bump; a stored System with no key reads as
household-level). Cloud: `household_systems.subject_member_id` **already existed** with its composite FK, `child_scope_subject_check`,
trigger-derived `subject_member_type`, RLS, grants and the `sync_push` allow-list — **no schema change**.

**Serialization / sync.** Outbound uses `childRef`: a subject with no mapping refuses to leave the device (`UnresolvedReferenceError`)
rather than sending a household routine. Inbound keeps an unresolvable uuid so the integrity gate names it and the cursor does not
advance — it is never dropped to `null`. The subject is a client-updatable column and part of the lost-acknowledgement comparison.
A second device learns the child through the pull-side hydration of `household_members` (child rows only).

**Consumer expectations.** Read the subject from the System; do not re-derive it from a name or a category. F04 must keep every field
when editing (`{...existing, ...}`) and must not present "child not recorded" once a subject exists.

**Legacy / unknown.** A System with no recorded subject is household-level. No shipped path could have produced a child-scoped System
without a subject.

**Prohibited interpretations.** null ⇒ first child; identifying a child by display name; using a `people` (responsibility) id as a
subject; a phantom household person; sending `scope: 'child'` without a subject.

**Known limitation (debt).** Meal and Category carry the same latent cloud-only subject; the local Task/Event rule still admits the
adult user id as a subject although the cloud will not. Out of scope, recorded.

---

## 4. WHAT AN UNDECIDED READING SAYS TO THE CLOUD (owner decision OD-A)

**Definition.** An `Interpretation` that has not been accepted (`pending`, `clarifying`, `rejected`, `superseded`) MAY sync as structured
interpretation state. Its `title` is the one field that is copied from, or materially derived from, what she said, so the cloud is given a
neutral label for it instead — `To-do to review`, `Event to review` or `Note to review`, by kind (`UNDECIDED_READING_TITLE`). Only an
`accepted` reading carries its own title across: it is then the canonical title of the row it became. `titleForCloud(reading)` is the one place
that says so, and `foundationProjection` applies it when a row is SENT.

**Invariants.**
* Nothing about an undecided reading is held out of sync. Its kind, dates, times, duration, amount, child, category hint, state, open question
  code, supersession chain and provenance travel exactly as before; only the title differs.
* No raw utterance and no title copied from or materially derived from it syncs before explicit acceptance. A reading she corrects is still
  undecided until she accepts it (the foundation has no "user-corrected" marker, and neutral until acceptance is the strictly safer reading), so a
  title she typed herself is held back too.
* A reading that was rejected or superseded was never approved and stays neutral for good. A whole chain sent at once (a device that was offline)
  sends only its decided end with a title.
* The decision is made from the row as it is when it is SENT, not when it was queued: a reading queued pending and accepted before the push carries
  its accepted title; a lost acknowledgement is recognised because the comparison uses the same projection.
* A reading that ARRIVES with a neutral label (the device that heard her keeps her words) cannot be accepted as it stands: `canAccept` says
  `needs_title`, so no real row is ever called "To-do to review". She names it through the ordinary correction, and the accepted title then syncs.
  A title that equals a neutral label is never a title anyone chose.

**Storage.** Nothing new: no schema change, no migration. The label is a value of the existing `interpretations.title` column (1–200 characters,
satisfied). The device that heard her keeps the reading — and its derived title — in its own household state exactly as before; this contract is
about what crosses the account boundary.

**Serialization / sync.** `title` is an updatable column, so the accepted title replaces the neutral one in the SAME update that records the
decision (`state`, `accepted` ref, `decided_at`); the server's `freeze_decided_interpretation` trigger allows it (proved on PostgreSQL) because the
row is still undecided when the update starts.

**Consumer expectations.** Features present a reading with its own local title on the device that heard it, and a neutral label wherever a
reading arrived from the cloud; the review says so and offers no save until she names it. Nothing may parse the label for meaning.

**Legacy.** Nothing synced before this repair (no coordinator existed), so no cloud row carries a derived title. A row already in a developer's
local database is left as it is.

**Unknown.** A reading with an unrecognised state is treated as undecided: neutral.

**Prohibited interpretations.** sending a derived title "because it is short"; sending it because she corrected it; releasing it on
`rejected` or `superseded`; a label that contains any part of the title or her words; holding the whole undecided reading out of sync to satisfy
the rule; letting a reading that arrived neutral become a real row under its label.

**What this does NOT do (stated, so it is a decision if it changes).** It concerns what crosses the account boundary. The household state on the
device that heard her still holds the reading's derived title (local, never synced before acceptance). If the owner meant the local durable record
too, that is a further, feature-level change.
