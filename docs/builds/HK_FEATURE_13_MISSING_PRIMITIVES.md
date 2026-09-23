# HK-FEATURE-13 — People OS — missing primitives and integration candidates

Built on WAVE3_BASE `363e473` as a Wave 4 PREBUILD. Nothing below was solved by editing a sibling (F09–F12) or by rewriting a shared
identity table. Each row says what the foundation lacks, what F13 did about it, and who should own it.

Fields: **ID · CAPABILITY · ACTUAL STATE · WHAT F13 DID · NEW DURABLE SEMANTIC NEEDED? · OWNER · TIMING**

### MP-13-01 · Other adult household members on the device
- **State:** cloud `household_members` can hold several adults; local `AppState` holds only `user` and `children`. No pull path maps
  another adult into local state.
- **F13:** People projects children and non-account people only. Adult co-members are **SAFE-UNAVAILABLE**. The PersonContext child FK
  is child-only by construction (the account holder can never be named).
- **New semantic?** YES (a local collection for co-members + a pull mapping). **Owner:** foundation / multi-adult households. **Timing:**
  whenever a second adult becomes a product feature.

### MP-13-02 · Child lifecycle (archive / tombstone / rename)
- **State:** a child has no status column, no archive and no rename path (F05: create only).
- **F13:** "canonical target archived" can only happen for a non-account person; for a child it is **NOT-APPLICABLE** today. The
  projection code already treats a context whose target is missing as INERT (never counted, never crashing).
- **Owner:** Kids OS. **Timing:** with any child-removal feature.

### MP-13-03 · Person identity reconciliation / merge — PENDING WAVE 4
- **State:** no merge primitive. F13 V1 never merges (not by name, email, phone, organization or label).
- **F13:** duplicates are allowed; a `household_people` person who later becomes a child/member stays a separate identity; the user may
  archive it. **New semantic?** YES (explicit, user-initiated merge with context migration). **Owner:** People OS + integration.

### MP-13-04 · Linking a PRE-EXISTING Task to a person — PENDING WAVE 4
- **State:** out of V1 scope by decision (addendum T): an existing Task may be household-visible, and a private link to it recreates the
  mixed-scope inference problem. The database enforces it: `guard_follow_up_task` accepts only the caller's own personal task.
- **New semantic?** YES (scope selection rules). **Owner:** People OS + Tasks.

### MP-13-05 · Household-wide uniqueness and FK existence probes on owner-private rows (SHARED FOUNDATION)
- **State (M0 characterisation, runtime):** (a) FK checks bypass RLS, so a caller who already holds another owner's private Task uuid can
  detect that it exists by referencing it from her own row; (b) `responsibilities_one_live_owner_uq` is HOUSEHOLD-wide, so the same
  probe even reveals that another owner holds a live responsibility on that Task; (c) scoped tables (`tasks`, …) are unique on
  `(household_id, local_id)` across owners, so a GUESSED local id of a private Task collides (23505). No read path hands a
  same-household member any of these ids. F12's M0 found (a) and (c) independently.
- **F13:** its own tables are closed against all three (per-owner uniqueness, pre-key guard, high-entropy follow-up local ids).
- **New semantic?** Possibly (owner-scoped uniqueness on `responsibilities`; opaque local ids). **Owner:** foundation security.
  **Timing:** before multi-adult households ship.

### MP-13-06 · Person ↔ Event relationship — PENDING-INTEGRATION
- **State:** no typed relation between a person/context and an Event. F13 did not mutate Event. The follow-up link's typed ref is
  `follow_up_type` + one FK column per kind, so adding `event` is additive (a column + a CHECK value).

### MP-13-07 · Person ↔ Child relationship (teacher/coach/doctor of a child) — PENDING-INTEGRATION
- **State:** no typed person↔child relation exists. F13 does not create one and does not duplicate any child.

### MP-13-08 · Life hub registration / information architecture — PENDING INTEGRATION
- **State:** `app/(app)/life/index.tsx` is one hand-written list (no decentralized registration). F13 ships the `/life/people` routes and
  a pure Life-tile model (`src/features/people/lifeTile.ts`) but does NOT edit the hub. Integration decides registration mechanism,
  ordering, grouping, primary vs nested.

### MP-13-09 · Permanent person / context delete — PENDING PRODUCT DECISION
- **State:** V1 has archive only (no client DELETE grant on either F13 table; account deletion is foundation behaviour).

### MP-13-10 · Owner-private search primitive
- **State:** none exists (no search index, no private search RPC). **F13:** People search is NOT built (optional for CORE). The pure
  projection orders rows deterministically; a later search may cover display name, relationship label and organization label only,
  never the context note.

### MP-13-11 · Contact information
- **State:** `household_people` holds no phone/email/address by design ("a preference, never an address"). **F13:** no contact storage,
  no Contacts permission, no import, no messaging. **New semantic?** YES if ever wanted — out of V1.

### MP-13-12 · `household_people.relationship` is a mandatory closed enum
- **State:** the canonical person carries a required category (`co-parent`, `partner`, …, `other`). **F13:** writes `other` (the value
  that says nothing more) for people it creates and keeps HER words in the private `relationshipLabel`; it never edits the enum.
  Integration question: should a People-created person's canonical relationship ever be set, and by whom?

---

## Integration candidate ledger

| ID | Item | Current Owner | Needed Capability | Depends On | Target Integration | Blocking? | Notes |
|---|---|---|---|---|---|---|---|
| IC-13-01 | F10 free-text professional contact → F13 identity | F10 (`contactName`, `organizationLabel` on CareerOpportunity) | explicit link from an opportunity to a `household_people` person | F10 merged; MP-13-03 | Wave 4 | No | NO automatic name matching; F10 untouched here |
| IC-13-02 | F12 issuer/contact → F13 identity | F12 | typed link LifeRecord ↔ person | F12 merged | Wave 4 | No | PERSON ↔ LIFERECORD |
| IC-13-03 | F09 person-related money semantics → F13 identity | F09 (Money) | counterparty = a person id | F09 merged | Wave 4 | No | Money owns amounts/obligations; People owns identity only |
| IC-13-04 | F11 social / rebuild links → F13 identity | F11 | explicit RebuildFocus ↔ person link | F11 merged | Wave 4 | No | never inferred |
| IC-13-05 | Kids external contacts (teacher, coach, provider) → F13 identity | Kids (F05) | person ↔ child relation (MP-13-07) | new typed relation | Wave 4 | No | no duplicate child |
| IC-13-06 | Home service provider → F13 identity | Home (F06) | home work ↔ person link | new typed relation | Wave 4 | No | Home keeps service history |
| IC-13-07 | Person ↔ Event relationship | Calendar | `event` kind on the follow-up ref or a new relation | MP-13-06 | Wave 4 | No | Event schema untouched |
| IC-13-08 | Talk It Out → People capture | Talk It Out (F02) | interpreter routes "call Mom" to a context + follow-up | People + interpreter | Wave 4 | No | interpreter untouched |
| IC-13-09 | Co-parent counterparty ↔ PersonContext | F07 + F13 | F07 surfaces may show the user's own private context | both merged | Wave 4 | No | F07 workflow state stays F07's (HK-INT-COPARENT-PEOPLE-01) |
| IC-13-10 | Life hub People registration | Life hub | registration/IA decision | MP-13-08 | Wave 3/4 integration | No | route + tile model ready |
| IC-13-11 | `sync_push` union | every migration that re-issues it | one definition including every feature's tables | all Wave 3/4 migrations | Wave 4 | **Yes (mechanical)** | take the union; F13 adds `person_contexts`, `person_task_links` |
| IC-13-13 | F08 boundary scan `LATER_FEATURES` register | F13 introduced | every later feature registers its lane; checkpoints advance with each integration | all Wave 3/4 branches | Wave 3/4 | Yes (mechanical) | take the union of entries; add WAVE4_BASE to INTEGRATION_CHECKPOINTS |
| IC-13-14 | Default privileges on tables created by ADDITIVE migrations | foundation | every additive migration must strip the baseline's stock ALTER DEFAULT PRIVILEGES grants for its own new tables (F13 found this by test) — or the generator's additive path should emit the REVOKE itself | any feature adding a table | Wave 3/4 | No (F13 does it) | candidate: move the REVOKE into `generateAdditive` |
| IC-13-12 | Manifest `migration` field | F13 introduced | siblings adding foundation kinds should generate into their own additive migration | F10 (edits the shipping migration) | Wave 3/4 | Yes (mechanical) | see HK_FEATURE_13_PEOPLE.md D9 |
