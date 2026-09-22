# HK-FEATURE-12 — Life Admin / Documents OS

Branch `feature/12-life-admin-documents`, worktree `C:\Users\jsmit\Her-Keys-F12`, created from
`WAVE3_BASE = 363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (`integration/wave2-f01-f08`). Built independently of the sibling Wave 3
branches F09 (Money), F10 (Work/Career) and F11 (Me/Rebuild): no sibling branch is an ancestor, no sibling code is imported, and no
sibling branch or worktree was modified.

The build brief and its FINAL MANAGEMENT ADDENDUM (the addendum controls where the two differ) define the doctrine. This ledger
records what was actually found, decided and proven, milestone by milestone, written at each milestone rather than reconstructed.

Status vocabulary for scenarios: PASS, SAFE-UNAVAILABLE, NOT-APPLICABLE, DEFERRED-IN-RUN, FAIL. Anything not executed is not PASS.

---

## F12-M0 — Environment + entity privacy + relationship privacy runtime preflight

### Environment gate (recorded before any change)

```
(Her-Keys-W2I) git fetch origin                                 -> (no output)
(Her-Keys-W2I) git status --short                               -> (clean)
(Her-Keys-W2I) git branch --show-current                        -> integration/wave2-f01-f08
(Her-Keys-W2I) git rev-parse HEAD                               -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf
(Her-Keys-W2I) git remote -v                                    -> origin git@github-herkeys:herkeys/her-keys.git (fetch/push)
(Her-Keys-W2I) git ls-remote origin refs/heads/integration/wave2-f01-f08
                                                                -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf   (MATCH)
git worktree list (before)  Her Keys 0a893ba [feature/01-today-chief-of-staff]; Her-Keys-F09 77e6dd0 [feature/09-money-os];
                            Her-Keys-F10 363e473 [feature/10-work-career-os]; Her-Keys-F11 363e473 [feature/11-me-rebuild-os];
                            Her-Keys-W2I 363e473 [integration/wave2-f01-f08]
```

`feature/12-*` did not exist locally or on origin, and `C:\Users\jsmit\Her-Keys-F12` did not exist. Created with
`git worktree add -b feature/12-life-admin-documents C:\Users\jsmit\Her-Keys-F12 363e473fdf053547a21a41a67b7f62bd9aa2bcdf`.

### Worktree / dependency safety

- `Her-Keys-W2I`, `Her-Keys-F09` and `Her-Keys-F10` each hold a REAL `node_modules` (352 entries).
- **Anomaly observed, not touched:** the main checkout's `C:\Users\jsmit\Her Keys\node_modules` is an EMPTY real directory
  (last written 2026-09-21 22:13), and `Her-Keys-F11\node_modules` is a junction to it, so F11 currently has no dependencies through
  that link. Neither belongs to F12; nothing was deleted, relinked or reinstalled there. Reported for the owner.
- F12 was given its own real install: `npm ci --no-audit --no-fund` from the base lockfile (583 packages, 352 top-level entries,
  peer-dependency warnings only). No junction into another checkout, so the F05–F07 export trap (route context resolving into another
  tree's `app/`) does not apply. The tree stayed clean (`package-lock.json` unchanged).
- Docker Desktop restarted underneath this session at 18:12 (another session's action; not F12's). F12 waited for the engine and for
  `supabase_db_Her_Keys` to report healthy and did not restart anything.
- A sibling session was running `node supabase/tests/run.mjs 20` (fixed-name `b4_env_*` databases) during M0. F12 therefore runs its
  backend suites in its OWN scratch database, `f12_env`, through `supabase/tests/run-f12.mjs` (same sequence as ENV C: auth stub,
  helpers, baseline, Build 4, IR01, F08, F05, then any `*_f12_*.sql` migration, then test defaults and identity fixtures, migrated
  while empty). The runner refuses any database not named `f12_*`, never touches the default `postgres` database, and drops `f12_env`
  when it finishes.

### Addendum A — prior Wave 3 privacy evidence

Inspected before treating M0 as unknown:

| Sibling | Ledger | Owner-private finding |
|---|---|---|
| F09 Money | `docs/builds/HK_FEATURE_09_MONEY.md` (M1 committed at 77e6dd0) | Row 13: `VISIBILITY_SCOPES = personal, household, child, coparent-shared, professional`; `private.can_access_scoped_row` makes personal/professional/coparent-shared OWNER-ONLY; coparent-shared is the household's most private scope, never a co-parent grant. F09 chose `household` for its own rows and ran NO owner-private runtime proof. |
| F10 Work/Career | none committed | — |
| F11 Me/Rebuild | none committed | — |

So no prior Wave 3 run had PROVEN (at runtime) that WAVE3_BASE has or lacks an owner-private scope. F09's code-level reading is
consistent with what F12 then proved at runtime below (cross-check: AGREES). M0 was therefore executed, not assumed.

### ENTRY test accounting (captured on the clean base, before any F12 file existed)

Command: `npm test` in `Her-Keys-F12` at `363e473`, working tree clean (the two M0 files were parked outside the tree for this run so
the Meals boundary scan, which also reads untracked files, saw the true base).

```
ℹ tests 2814
ℹ suites 614
ℹ pass 2810
ℹ fail 4
ℹ duration_ms 96230
```

The four ENTRY failures, none caused by base code:

| Test | Cause |
|---|---|
| `tests/hk-ir01/syncComposition.test.mjs:842` HA-001 cost | timing budget: one edit in a 5,000-row collection cost 7.991 ms against a 5 ms budget, under host contention (Docker restart + a sibling `run.mjs`). Known flake class ([parallel-worktree-gotchas]). |
| `tests/talkItOutCapture.reader.test.mjs:510` cost | timing ratio: 4x input cost 10.7x (threshold is a quadratic ~16x-class guard), same contention. |
| `tests/meals/boundary.test.mjs:19` [BV1..BV5] | the scan's check G: `feature/09-money-os: shares history with HEAD above the baseline (363e473)`. Wave 3 structure, not code: every Wave 3 sibling forks from the same base. F09 reproduced it on the untouched W2I checkout. |
| `tests/meals/boundary.test.mjs:30` [BM1..BM3] | same finding through the ancestry assertion. |

Backend ENTRY (the known 1028/1028 of the brief) is recorded with the M5 run, where the full harness is executed alone.

### M0 — foundation facts

| Question | Answer (runtime-proven where marked) |
|---|---|
| SCOPE NAME | `personal` (one of `VISIBILITY_SCOPES`, `src/domain/schemaPrimitives.ts:32`). Two server patterns carry it: (1) SCOPED tables (`tasks`, `events`, ...): `scope` + `owner_profile_id`, `tasks_owner_scope_check` makes a personal row carry an owner and a household row carry none; RLS `private.can_access_scoped_row(household_id, scope, owner_profile_id)`. (2) OWNER-PRIVATE foundation tables (`goals`, `dependencies`, `recurrence_rules`, ...): `profile_id NOT NULL`, `scope CHECK = 'personal'`, RLS `auth.uid() = profile_id AND private.is_household_member(household_id)`, uniqueness `(household_id, profile_id, local_id)`. |
| LOCAL REPRESENTATION | A device holds ONE account's state; local rows carry no owner id. Personal scope is explicit on scoped rows (`TaskSchema.scope`, e.g. Systems' `saveDraft` writes `'personal'`) and is the literal type of owner-private core kinds (`NeedsMeItemSchema.scope: z.literal('personal')`). |
| CLOUD REPRESENTATION | as above; the owner is stamped at PUSH time from the bound account (`projection.ts ownerFor(scope, ctx.profileId)` for scoped kinds; `profile_id: ctx.profileId` for owner-private kinds). |
| SYNC BEHAVIOR | `change_log` is a pointer log whose writer (`log_row_change`) stamps `owner_profile_id` from the owner column; its SELECT policy shows a pointer only when `owner_profile_id IS NULL OR = auth.uid()`. `sync_pull` is SECURITY INVOKER, so it returns only the caller's visible pointers; the device re-reads rows under RLS. `sync_push` is SECURITY INVOKER and probes collisions on the table's own uniqueness boundary. RUNTIME-PROVEN. |
| RLS BEHAVIOR | owner: read/write; same-household member: no read, no write, no insert in the owner's name; stranger: nothing, and sync_pull/sync_push naming the other household refused (42501); anon: refused. RUNTIME-PROVEN. |
| SAME-HOUSEHOLD VISIBILITY | none — not the content, not the existence (no row, no count, no change pointer, no pull pointer, including for later edits, removals and purge tombstones). RUNTIME-PROVEN. |

### M0 — synthetic fixture methodology (addendum B/C)

`supabase/tests/78-f12-m0-privacy-preflight.sql`, run by `node supabase/tests/run-f12.mjs 78` in `f12_env`. Built ONLY from existing
primitives, because no F12 table exists yet, in exactly the shape F12 needs:

- owner-private parent record: a `goals` row of USER A (the foundation owner-private pattern F12's LifeRecord will copy);
- owner-private canonical Task: a `tasks` row of USER A with scope `personal`;
- owner-private relationship: a `dependencies` row of USER A (the foundation's ENFORCED typed relationship: one FK column per target
  kind, no `targetKind + targetId`), Task `part_of` record; plus a second private relationship from a HOUSEHOLD-visible Task to the
  same private record, to prove the Task side reveals nothing;
- actors from `helpers/10-fixtures.sql`: USER A (owner of household A), USER B (second adult of household A), USER C (owner of an
  unrelated household), anon.
- All fixture text is synthetic (`M0 PRIVATE PARENT FIXTURE`, ...). The file deletes its own rows at the end so it stays
  self-contained when the whole ENV C set runs.

Result: **36 passed, 0 failed.** Covered: direct table reads (by id, by local id, whole-table counts), direct UPDATE/DELETE (zero rows,
the same answer an absent id gets), INSERT in the owner's name (42501), crafted relationship targets (a link to A's private record is
refused exactly like a link to a non-existent id — same SQLSTATE, same constraint — and the refusal's message/DETAIL/HINT carries no
private title), `sync_push` (owner-keyed uniqueness: B reusing A's local id for an owner-private row gets a fresh row of her own,
`created`, no collision oracle; a relationship pushed in A's name is refused), `sync_pull` from cursor 0 (= fresh-client hydration):
owner receives every pointer, member receives none of the private ones and still receives the household Task, stranger refused,
anon refused; change log for edits, a status removal and a server-side purge tombstone: the owner sees the tombstone, the member sees
nothing.

Test-the-test for M0 (each mutant applied through `HERKEYS_F12_MUTANT_SQL`, never committed):

| Mutant | Result |
|---|---|
| M0-a change_log SELECT shows every household pointer | CAUGHT — 5 checks fail (change_log, per-table count, sync_pull, lifecycle pointers) |
| M0-b relationship rows readable by the whole household | CAUGHT — 2 checks fail |
| M0-c `personal` treated as household-visible in `can_access_scoped_row` | CAUGHT — 3 checks fail |

### M0 — two pre-existing foundation properties, characterised (NOTE lines, not checks)

1. **Known-id FK existence probe.** FK checks bypass RLS. USER B, holding the server uuid of A's PRIVATE Task, can create a
   `dependencies` row of HER OWN pointing at it (ACCEPTED), while a non-existent uuid is refused (23503). This confirms existence of a
   uuid B already holds; it reveals no content and no relationship of A's. B cannot obtain the uuid: it is server-generated
   (`gen_random_uuid`) and never reaches B — no change pointer, no pull pointer (proven above). Pre-existing, Build 4 foundation.
   **F12 closes it for its own link table** (M5: a BEFORE trigger makes "not yours" and "does not exist" the same refusal).
2. **Scoped-table local-id probe.** `tasks` (and every scoped table) is unique on `(household_id, local_id)` across owners, and the
   `sync_push` probe runs under RLS, so B pushing a Task that reuses A's private Task local id gets 23505; a fresh local id is accepted.
   This confirms existence of a guessed local id only. Local ids are `prefix-<epoch-ms base36>-<counter><4 random base36>`, so a
   guess must hit the millisecond, the counter and ~1.7M random values. Pre-existing, Build 4 foundation; applies to every personal
   Task the product already creates. **F12 mitigation:** F12 mints the local ids of the Tasks (and records) it creates with a long
   random component (M3), so an F12-created Task is not practically guessable. Foundation repair (owner-keyed uniqueness for personal
   rows on scoped tables) is registered as `MP-12-01` for Wave 3 integration.

Neither property discloses record content, record existence without a secret identifier, relationship existence, or identifying
metadata through change log / sync projections, which is what addendum B/E require.

### M0 PASS requirements (addendum E)

| Requirement | Result |
|---|---|
| owner-private canonical entity scope exists | PASS — `personal`, both server patterns, runtime-proven |
| canonical Tasks can carry a compatible private scope | PASS — `tasks.scope = 'personal'` with `owner_profile_id`, runtime-proven owner-only |
| private relationship rows can be enforced | PASS — owner-private `dependencies` rows, runtime-proven; F12's link table copies this pattern |
| unauthorized same-household identity cannot infer relationship existence | PASS — no row, no count, no pointer, including from the household-visible Task side |
| sync/change-log does not expose private identifying metadata | PASS — pointers only, owner-stamped, filtered; titles never in a refusal payload |

**F12-M0: PASS.** Proceed to M1.

M0 checkpoint (after commit): `feature/12-life-admin-documents` @ `204b7d9`, `git status --short` empty.

---

## F12-M1 — Existing-primitive audit + LifeRecord contract/model + sensitive-field rules

### Prior implementation audit (WAVE3_BASE)

Two read-only surveys (client sync architecture; domain/UI primitives) plus direct reading. Classification:

| Capability | Found | Classification for F12 |
|---|---|---|
| Documents / Life Admin implementation | none: "Documents" only in `HER_KEYS_PRODUCT.md` §13's intelligence list; "life admin" only as Life Inbox copy; `HK-INT-HOME-LIFEADMIN-01` (F06) defers warranty/manual/document relationships to Life Admin | **NOT PRESENT** — F12 builds the first one; no second records system exists to collide with |
| Generic records / asset models | none | NOT PRESENT |
| Owner-private entity scope | `personal`, two server patterns (M0) | **PRESERVE / REUSE** — LifeRecord uses the owner-private foundation pattern (`profile_id`, scope pinned `personal`) |
| Typed relationship primitive | `dependencies` / `evidence_links` / `external_references`: enforced typed FKs, one column per target kind, closed kind lists (`TYPED_REF_KINDS`, SQL CHECKs) | **PRESERVE, NOT EXTENDED** — expressing LifeRecord in them needs a new kind + new columns on SHARED foundation tables (a shared-schema change, forbidden by the stop rule). F12 adds its own owner-private typed link table instead (brief's fallback) |
| External-reference primitive | `ExternalReference`: provider/account/objectId/version; **no URL field anywhere** | PRESERVE, NOT USED — it models objects in connected external systems, not a place she keeps a paper; F12 stores NO document URL (see external references below) |
| File / storage / upload | none in app code (`supabase/config.toml` enables local storage, no buckets, no client code); `SourceArtifact.contentRef` is "a pointer into a content store that does not exist yet" | **NOT PRESENT** — F12 V1 is metadata-first; no vault, no upload, no signed URL, no OCR |
| Expiry / date primitives | `logicalDay.ts` (`LocalDate`, `isLocalDate`, `addDays`, `daysBetween`, `logicalDateAt`), `LocalDateSchema` | PRESERVE / REUSE |
| Reminder / deadline primitives | Task `dueDate` + attention `deadline` reason; no reminder/notification system | PRESERVE — a renewal becomes a canonical Task only when she creates one; no notification is built |
| Tasks | `addTask(state, ctx, input)` pure transition, explicit `scope`, `personal` allowed; `completeTask` / `archiveTask`; no delete | **PRESERVE / REUSE** — the only way F12 creates work |
| Events / Goals / Systems | canonical, unchanged | PRESERVE — no F12 link (Event: `PENDING-INTEGRATION`) |
| Categories | data, `SYSTEM_ROLES` closed; no admin role | PRESERVE — the Task she creates is filed in a category SHE picks; F12 adds no role and no category |
| Member / child identity | `Child {id, displayName, birthDate}`; rename and archive of a child are NOT supported by the foundation (MP-K-04 / B4-P0-066); cloud subject = composite FK to `household_members` child row | PRESERVE — LifeRecord names a child by id, like a System |
| Home references | Home tasks are canonical Tasks; F06 defers document relationships to Life Admin | PRESERVE — F12 holds the record; Home work stays Task truth |
| Archival / tombstone | status columns everywhere; only `discovery` tombstones | PRESERVE — LifeRecord archives by status |
| Provenance | `ProvenanceSchema` + `provenanceFor(origin, …)` (demo forces `demo-seed`) | PRESERVE / REUSE |
| Sync | owner-private core kinds registered by hand (`needsMe` precedent); foundation manifest route requires generating into the SHIPPED Build 4 migration (`gen-foundation-sql.mjs --check`), which may not be edited | **REUSE the hand-registered route** — two new kinds, `lifeRecord` and `lifeRecordLink`, in their own additive migration (M5) |
| Search | none (no `search` / `matchesQuery` / index in `src`) | NOT PRESENT → **F12 search NOT BUILT** (addendum S): `PENDING-INTEGRATION — PRIVATE RECORD SEARCH` |
| Sensitive-display / masking | none (no mask / redact / last-4 helper) | NOT PRESENT → F12 adds its own `maskReference` (M4), local to the feature |
| Logging / analytics / crash reporting | no logger, analytics or crash SDK in `package.json`; dev-only `console.info('[herkeys] …')` diagnostics that carry "codes, counts, timings and ids only"; `validateAppState` issues name paths and ids, never values | PRESERVE — F12 writes no log line at all; its refusal codes carry no field values |
| Demo mode | `resolveDataMode` (demo in dev, empty otherwise); demo never syncs or claims (five layers) | PRESERVE — F12 adds three fictional demo records (addendum V) |
| Clipboard | no clipboard module in dependencies | NOT PRESENT → "Copy" is **SAFE-UNAVAILABLE** (adding a dependency is out of scope; `package.json` unchanged) |
| Life hub | `app/(app)/life/index.tsx` hard-codes rows for destinations without a `SystemRole` (Other open tasks, Life Inbox, Needs Me) | PRESERVE — Life Admin is one more such row; no hub redesign; route declares its own header (the Co-Parent pattern) so the protected `life/_layout.tsx` is untouched |

### LifeRecord semantic contract

A LifeRecord MEANS: "this is durable administrative information she wants Her Keys to remember". It does NOT mean: the document was
authenticated; the issuer confirms the data; Her Keys has inspected or holds the original; the record is legally sufficient; a date
is legally controlling; an expired date proves invalidity; a renewal occurred; the record is a Task. It is never a Today object and
never a One Move.

### LifeRecord V1 model (as built in `src/domain/state.ts`)

Names follow repository conventions: the brief's `typeLabel` / `issuerLabel` are stored as `typeName` / `issuerName`, because the
repository forbids stored field names that describe presentation (`tests/designIndependence.test.mjs` refuses any stored key matching
`label`, `badge`, `tone`, ...; the first draft tripped it and was renamed), and the brief's `userNote` is `note`.

| Field | Type / bound | Notes |
|---|---|---|
| `id` | `Id` | canonical identity; title and reference never identify |
| `title` | non-blank, ≤ 200 | display only; duplicates allowed; rename keeps `id` |
| `kind` | `document \| credential \| policy \| registration \| reference \| other` | bounded; specifics go in `typeName` |
| `typeName` | non-blank ≤ 60 or null | e.g. "Passport"; potentially identifying; list + detail only |
| `issuerName` | non-blank ≤ 120 or null | free text; no People/contact model |
| `referenceNumber` | non-blank ≤ 64 or null | SENSITIVE: masked outside detail, never on home/hub/Today/verdict/log |
| `issuedOn`, `expiresOn`, `renewBy`, `reviewOn` | `LocalDate` or null | calendar dates; not related to each other |
| `locationHint` | non-blank ≤ 120 or null | SENSITIVE: detail only; never parsed, fetched or logged |
| `note` (the brief's `userNote`) | non-blank ≤ 500 or null | SENSITIVE: detail/edit only; never searched |
| `subjectMemberId` | child `Id` or null | canonical child identity; never a name |
| `status` | `active \| archived` | no `expired`, no `superseded` in the core |
| `archivedAt` | instant or null | set exactly when archived |
| `createdAt`, `updatedAt` | instants | |
| `provenance` | `ProvenanceSchema` | |
| `scope` | literal `personal` | owner-private by construction |

`LifeRecordTaskLink`: `id`, `lifeRecordId`, `taskId`, `relation` (`renewal \| follow_up \| next_step`, a label only), `createdAt`,
`provenance`, `scope: 'personal'`. Written once, with its Task, in one transition; immutable afterwards (no status: V1 exposes no
unlink). Integrity (`findIntegrityProblems`): unique ids; one link per (record, Task); a link names an existing record and an
existing Task whose scope is `personal`; a record's subject is an existing child.

Collections: `lifeRecords` (≤ 2000) and `lifeRecordLinks` (≤ 5000) on `AppState`, both `.default([])`, so every v4 blob written
before F12 loads unchanged and reads as "no records yet" (the truth). `CURRENT_SCHEMA_VERSION` stays 4; `src/persistence/**` is
untouched.

Minimum content: trimmed non-blank title + kind + (owner/scope, provenance, createdAt set by the action). Nothing else is required.

### Decisions (inside existing semantics; product-WHY tie-breakers where a choice was needed)

| ID | Decision | Why |
|---|---|---|
| DD-12-01 | Lifecycle `active \| archived` only; supersession is NOT in the core (addendum AA); expiration is derived, never stored | addendum AA/AB; "expiration date passed ≠ invalid" |
| DD-12-02 | Owner-private pattern (`profile_id`, scope pinned) rather than a scoped table with a selectable scope | nothing in V1 shares a record; a household- or co-parent-visible record is future integration work, never a default |
| DD-12-03 | Links are F12-owned rows, not a new kind in `dependencies` | the shared-primitive stop rule; `dependencies`' kind lists and columns are shared foundation schema |
| DD-12-04 | A Task created from a record is `personal`, and a link may only name a `personal` Task (local integrity now; server trigger in M5) | addendum D: private record → private Task → private link, never a cross-scope link |
| DD-12-05 | The Task she creates carries NO subject and NO due date unless she sets one; the category is her explicit pick | a record's subject or dates are not the Task's facts until she says so; no inference |
| DD-12-06 | A record's subject is a CHILD only | the cloud's subject FK is a child row; a record about herself needs no subject (she is the owner) |
| DD-12-07 | Archived records stay editable (fields can be corrected and sensitive fields cleared) and can be restored | addendum Z (clear mistakenly entered data); archive destroys nothing |
| DD-12-08 | Search NOT BUILT | addendum S: no existing primitive that proves private isolation |
| DD-12-09 | Copy-to-clipboard SAFE-UNAVAILABLE | addendum N "where existing platform interaction supports it": none exists |
| DD-12-10 | Linked-Task overdue is NOT a Needs Review signal; the verdict uses exactly addendum J's four categories | the overdue Task already reaches Today through normal Task semantics; counting it again would build a second attention system |
| DD-12-11 | No hard delete of a record | addendum Z; `USER-INITIATED PERMANENT RECORD DELETION` is a future product decision |

### Date source (addendum F)

WAVE3_BASE has NO household timezone. The durable product timezone is the PROFILE timezone: `state.user.timezone` locally
(`profiles.timezone` in the cloud, set by `bootstrap_account`). The store derives logical today from it
(`appStore.ts`: `todayFor = logicalDateAt(now(), state.user.timezone)`) and hands it to screens (`useHouseholdState().today`) and
transitions (`ctx.today`). F12 uses that value and nothing else; the device zone is only the seed of a brand-new state. No F12
timezone field is invented, and no device-local fallback is needed (so no KNOWN V1 LIMITATION on this point). Tests pin a device
zone that differs from the persisted zone (M4).

Test accounting at M1 (full `npm test`, then targeted re-runs): the model change surfaced four new failures, all repaired in M1 —
`designIndependence` (stored `*Label` names → renamed), `legacyCatalogRemediation` ×3 and `persistence` v1 (legacy fixtures built by
stripping `V4_ROOTS` still carried the two new roots, which the frozen v1–v3 validators rightly refuse → the roots were added to
`V4_ROOTS`). Re-runs: designIndependence 3/3, legacyCatalogRemediation 11/11, persistence 14/14, migrationV3ToV4 54/54,
claimPayload 22/22, appStore 27/27. The remaining failures are the ENTRY four (the Meals scan now also lists F12's own files; see
`HK-INT-W3-MEALS-SCAN-01`).

M1 checkpoint (after commit): `feature/12-life-admin-documents` @ `23ba320`, `git status --short` empty.

---

## F12-M2 — Local commands / persistence / editing / archive (and M3's domain half)

`src/domain/lifeRecords.ts` — pure `(state, ctx, …) → result` commands in the `tasks.ts` / `meals.ts` style. A refusal returns the
SAME state reference (nothing to persist, nothing for the change bridge to send) and names the FIELD at fault, never the value.

| Command | Behaviour |
|---|---|
| `addLifeRecord` | title + kind required; every optional field normalised (single-line fields collapse line breaks and trim; blank → `null`; dates must be real calendar dates; subject must be an existing child id); draft id makes a repeat save `exists` (success, no second record); capacity refusal at 2000 |
| `updateLifeRecord` | field present = replace, `null`/blank = clear, title cannot be cleared; rename keeps the id; allowed on an archived record (addendum Z); unchanged save is a no-op; `expected` snapshot → `stale` instead of an overwrite |
| `archiveLifeRecord` / `restoreLifeRecord` | status + `archivedAt` only; no Task, link or other row changes |
| `addLifeRecordTask` (M3) | ONE transition: canonical `addTask` with `scope: 'personal'`, her explicit category, no subject, a due date only if she set one, then ONE owner-private link. Draft ids for both allocated when the sheet opens; a repeat save is `exists` (still one Task, one link); a draft id already naming something else is `conflict` |
| `linkedTasksOf` / `openLinkedTaskCount` | a link whose Task is missing resolves to `task: null` (never a throw, never a re-link); only OPEN Tasks count as admin work |

Atomicity (addendum M): the store's `commit` validates the WHOLE next state and persists it as one envelope, so the Task and its
link are persisted together or not at all; there is no partial state to roll back.

Draft ids: `src/features/lifeAdmin/draftId.ts` mints `prefix-<time36>-<32 hex>` (≈128 random bits via `crypto.randomUUID` /
`getRandomValues`, with a multi-draw fallback), the MP-12-01 mitigation for the Tasks F12 creates.

Tests: `tests/lifeAdmin/commands.test.mjs` — **23/23**. Title-only record (valid, owner-private, identical after save + reload);
normalisation and field-named refusals; renewBy > expiresOn preserved; duplicate titles are two records; repeat save; zero Tasks /
links / Needs Me / One Moves / Events from any date; rename keeps id and links; every sensitive field cleared (the cleared reference
is absent from the stored state); stale edit refused; child display-name change keeps the subject id and another child taking the
old name does not take the record; archive keeps record, fields, link and the SAME Task object; archived record corrected and
restored; one save → one personal Task (no subject, no inferred due date, default duration recorded as default) + one link; repeat
and conflict; eight refusal cases create nothing; completing or archiving the linked Task leaves the record the SAME object and
drops open admin work to 0; a missing Task resolves to `null` while the stored-state gate still refuses the dangling link;
integrity refuses a link to a non-personal Task; **store relaunch** (in-memory repository, three launches) keeps the same record,
link and personal Task through create → relaunch → rename → archive → relaunch; a pre-F12 v4 blob loads with empty collections.

M2 checkpoint (after commit): `feature/12-life-admin-documents` @ `75dab17`, `git status --short` empty.

---

## F12-M3 — Private canonical Task creation + private typed relationship

The domain half landed with M2 (`addLifeRecordTask`, `linkedTasksOf`, `openLinkedTaskCount`, local integrity: a link names an
existing record and an existing `personal` Task, once per pair). The cloud half (owner-private link table, same-owner/personal
trigger, RLS, sync registration) is M5.

Record → Task architecture: canonical `Task` is the ONLY administrative work object. No AdminTask / DocumentTask / RenewalTask entity
exists. No shared Task/Event/Goal/System schema gained a `lifeRecordId`. The relationship is an F12-owned, owner-private, typed row
(`LifeRecordTaskLink`: exactly one record id and one Task id, both enforced), never `targetKind + targetId`.

Today behaviour (`tests/lifeAdmin/today.test.mjs`, **2/2**):
- records with a passed expiration date, a renew-by and a review date of today, and an expiration date of today leave
  `attentionFor`, What Matters Today (`mattersSection`) and `oneMoveForDay` IDENTICAL to the same household without them; the One
  Move never targets a record; no reference number appears.
- a Task created from a record with a due date of today appears as exactly one `deadline` attention item about that Task, and in
  What Matters Today under the Task's title; the record's own title never appears there.

M3 checkpoint: recorded with the M3 commit below.
