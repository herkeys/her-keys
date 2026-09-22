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

M3 checkpoint (after commit): `feature/12-life-admin-documents` @ `c7c72da`, `git status --short` empty.

---

## F12-M4 — Life Admin UI / dates / masking / bounded review

### Files

| File | Role |
|---|---|
| `app/(app)/life/admin.tsx` | the one route, under Life; declares its own header (the Co-Parent pattern), so `app/(app)/life/_layout.tsx` is unchanged |
| `app/(app)/life/index.tsx` | ONE new hub row, "Life Admin / Documents", valued by `lifeAdminHubSummary` (a count only); no hub redesign, no new tab |
| `src/features/lifeAdmin/lifeAdminView.ts` | the pure projection: Needs Review, verdict, Coming Up, ordering, archived list, hub summary, record detail |
| `src/features/lifeAdmin/sensitive.ts` | `maskReference`, `DETAIL_ONLY_FIELDS` |
| `src/features/lifeAdmin/lifeAdminDates.ts` | calendar-date labels from the date's own parts (the year is always said) |
| `src/features/lifeAdmin/lifeAdminCopy.ts` | every word, factual and calm |
| `src/features/lifeAdmin/lifeAdminGate.ts` | loading / recovery / ready; no emptiness claim before the household is read |
| `src/features/lifeAdmin/LifeAdminBody.tsx`, `RecordSheet.tsx`, `RecordDetailSheet.tsx`, `RecordTaskSheet.tsx` | pure views (no store, router, persistence, platform module or clock) |
| `src/features/lifeAdmin/LifeAdminContainer.tsx` | the sheet state machine; one `store.commit` per Save / Archive / Restore; the store is PASSED IN, so tests drive it against a real store |
| `src/features/lifeAdmin/LifeAdminScreen.tsx` | the connected wrapper: reads the store and account hooks, renders the shared persistence/sync notices, hands everything to the container |

### Behaviour as built

- **Home hierarchy:** plain verdict, Add record, Needs Review (at most 3; "See all N" expands inline), Coming up (next 14 days, at
  most 5, records not already in review), Records (all active), Archived (collapsed, "Show archived (N)"). No "Recently updated"
  section was built (optional, AD); no bespoke archive navigation (AC).
- **Empty state:** only when she has no records at all (active or archived): "Add one record you don't want to keep track of in your
  head." with Add record and Skip (Skip goes back). No inventory, no category onboarding.
- **Date rules (addendum G):** `expiresOn == today` reads "Recorded expiration date is today." (Coming up, NOT passed);
  `expiresOn < today` reads "Recorded expiration date passed (date)." Nothing ever says invalid, illegal or unusable, and no stored
  status changes when time passes. `renewBy` / `reviewOn` today or earlier is category 1. `renewBy > expiresOn` is preserved and
  not warned about (addendum H).
- **Needs Review (addendum I):** one item per record under its highest category, carrying its OLDEST applicable date; category 1
  oldest first, category 2 oldest first, id ascending; cap 3.
- **Verdict (addendum J):** exactly one category, count-aware: "One record needs review." / "N records need review." /
  "One record has passed its recorded expiration date." / "N records have passed their recorded expiration dates." /
  "Next: [title] — [date]." / "Nothing needs review."
- **Upcoming (addendum K):** 14 calendar days, a projection constant; stored nowhere; creates no Task and no notification.
  `reviewOn` is surfaced only on the Life Admin home and detail (addendum L): no push, email, system notification or Event.
- **Ordering:** Needs Review order, then upcoming (soonest), then `updatedAt` descending, id ascending. No importance score.
- **Record detail:** the ONE surface with the reference number, location hint and note. The reference is masked (four bullets plus
  the last 4 of the normalised value when it has 8 or more characters, four bullets otherwise); Reveal / Hide lives in component
  state only (reopened means masked again; nothing stored). Copy is SAFE-UNAVAILABLE and said on screen ("Copy isn't available on
  this device."): no clipboard module exists and adding a dependency is out of scope. The detail states what a record is: "What you
  recorded. Her Keys hasn't checked it with anyone, and keeps these details, not the document itself."
- **Task from record (addendum M):** "Add renewal task" / "Add follow-up" / "Add next step" open a sheet with the relationship fixed
  and draft ids allocated; opening and cancelling write nothing; Save creates ONE personal Task and ONE link in one commit; the
  category is her required pick; the record's renew-by date is offered as one explicit chip, never applied on her behalf.
- **Edit and clear (addendum Z):** every optional field is cleared by emptying it; archived records can be corrected and restored.
- **Child subject:** chosen by chip (canonical id); displayed by the child's CURRENT name, resolved by id every time; a missing child
  is said as missing.
- **Life hub (addendum T):** "N records need review." / "N records." / "Nothing needs review." Never a title, number, note, location,
  issuer or child name.
- **Search:** NOT BUILT (DD-12-08).

### Timezone (addendum F)

Proven, not assumed: at 2026-09-16T12:30Z a household whose persisted profile timezone is `Pacific/Auckland` loads (real store,
in-memory repository, device zone `America/New_York`) with logical today `2026-09-17`, so a record expiring `2026-09-16` has passed;
evaluated at the device-zone date it would still be "expires today".

### Tests (M4)

| File | Result | Covers |
|---|---|---|
| `tests/lifeAdmin/view.test.mjs` | 24/24 | expires today vs yesterday; no legal words and no status change; renew/review today and past; no-date record; renewBy > expiresOn; review order, cap and See all; one item per record at its oldest date; archived excluded; a completed renewal Task leaves the record in review; archived/completed Task is not active work; unavailable Task; verdict forms (one category only); 14-day boundary (day 14 in, day 15 out); no repeat of review items in Coming up; home ordering incl. the id tie-break; duplicate titles are two rows; child rename by id and missing child; empty phase; hub forms and hub privacy; the profile-timezone date source |
| `tests/lifeAdmin/screen.test.mjs` | 9/9 | loading/recovery never claim emptiness; empty state and Skip; cap 3 then See all; archived one tap away; REAL STORE: opening/cancelling Add record writes nothing, a title-only save writes one record and no Task; opening/cancelling the task sheet writes nothing; category required; a double-pressed Save is one personal Task and one link, with no due date applied; reference masked, Reveal, reopened masked, nothing stored; archive keeps the record and the SAME Task; presentational files import no store/router/persistence/platform/clock and no F12 file has logging, network or telemetry |
| `tests/lifeAdmin/privacy.test.mjs` | 5/5 | mask rules (8 or more gives the last 4; 7 or fewer gives nothing; normalised); sentinels in reference/location/note (plus type/issuer/child name for the hub) absent from the home view, its rendered text and labels, the hub summary, attention, What Matters, One Move, briefing, the Calendar day and (structurally) the Life areas; refusals and state-validation issues name fields only; store diagnostics and all console output through create, task, edit, archive and relaunch |
| `tests/lifeAdmin/copyAudit.test.mjs` | 6/6 | no shaming words, no legal conclusion, no verification or possession claim, the "not a secret store" guidance, no invented renewal window, the exact verdict forms |
| `tests/lifeAdmin/demo.test.mjs` | 3/3 | at most 5 fictional records, `DEMO-000N` only; no realistic sensitive pattern (each pattern proven to catch its sample); demo state valid and showing one review and one upcoming; `demo-seed` refused by the cloud; a demo household never binds |

F12 app tests so far: 72/72 (20 suites) across `tests/lifeAdmin/*.test.mjs`.

### Telemetry surfaces (addendum O)

| Surface | Status | Evidence |
|---|---|---|
| Life Admin home, Life hub row, Today, verdict | PASS | privacy.test.mjs, view.test.mjs |
| search result rows | NOT-APPLICABLE | search not built |
| notifications | NOT-APPLICABLE | no notification surface exists in the product |
| application logs | PASS | store diagnostics and every console method captured across the lifecycle; F12 source contains no `console.` (static scan) |
| analytics payloads | SAFE-UNAVAILABLE | no analytics SDK or module exists in the codebase (`package.json` and source scan), so there is no payload to inspect |
| error payloads | PASS | refusal results and `validateAppState` issues; sync evidence is checked in M5 |
| crash metadata | SAFE-UNAVAILABLE | no crash-reporting SDK exists in the codebase |

M4 checkpoint (after commit): `feature/12-life-admin-documents` @ `b880589`, `git status --short` empty.

---

## F12-M5 — Backend / sync / RLS / fresh client / account isolation

### Schema: `supabase/migrations/20260922180000_f12_life_records.sql`

Additive, one transaction, ends with `SELECT private.assert_app_schema_secured();`, pinned to LF (`.gitattributes`). No earlier
migration is edited. No shared canonical table (tasks, events, goals, systems, household_members, ...) gains a column, constraint,
index, policy or trigger.

| Object | Shape |
|---|---|
| `public.life_records` | the owner-private foundation pattern: `profile_id NOT NULL`, `scope` CHECK = 'personal', uniqueness `(household_id, profile_id, local_id)` and `(id, household_id, profile_id)`; CHECKs mirroring every local bound (title 1..200, kind taxonomy, type 60, issuer 120, reference 64, location 120, note 500 — each trimmed-non-blank or NULL), `status` active/archived with `archived_at` set exactly when archived (there is no stored "expired"), producer/confidence/artifact provenance rules (demo-seed refused), child subject via the same composite FK + `set_subject_member_type` trigger tasks use; `force_server_owned_id`, `set_row_updated_at`, `log_row_change('household_id','profile_id')` |
| `public.life_record_task_links` | owner-private the same way; record end = composite FK `(life_record_id, household_id, profile_id)` onto the record (an owner can only link her own record); Task end = FK `(task_id, household_id)` ON DELETE CASCADE (a purged Task takes its link with it) PLUS the guard below; one link per (record, Task); immutable (no UPDATE grant or policy) |
| `private.guard_life_record_task_link()` | BEFORE INSERT/UPDATE, SECURITY INVOKER, empty search_path: the caller must be the link owner and the Task must be the owner's `personal` Task in the same household — under the caller's own RLS, so "someone else's Task", "a household-visible Task" and "no such Task" are the SAME refusal (`42501 life_record_task_links: that task cannot be linked to this record`). This closes, for this table, the known-id FK probe M0 found on the foundation relationship tables (MP-12-02). |
| RLS | records: select/insert/update own rows (`auth.uid() = profile_id AND private.is_household_member(household_id)`); links: select/insert own; no DELETE policy on either |
| Grants | the Build 4 posture: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (the baseline's default privileges would otherwise hand anon everything on a new table), `GRANT ALL ... TO service_role`, then SELECT + column-level INSERT (+ UPDATE on records) to `authenticated`; no DELETE, TRUNCATE, REFERENCES or TRIGGER |
| `change_log_entity_table_check` | the Build 4 list plus the two tables (drop + re-add) |
| `public.sync_push` | CREATE OR REPLACE with EXACTLY one difference from the F05 body (verified by a line diff): the two tables join the owner-keyed list, so their collision probe is `(household, OWNER, local_id)` and a member reusing the owner's local id is simply a new row of hers |

### Schema bookkeeping

| Item | Value |
|---|---|
| OLD FINGERPRINT (WAVE3_BASE = IR01 + F08 + F05) | `96f93f3d46dcf5735e7a0b50996944bf`, 3629 facts — DERIVED (no committed baseline existed for the integrated Wave 2 schema) |
| NEW FINGERPRINT (WAVE3_BASE + F12) | `60af45784ddd7373c7a56cd57c51b802`, 3844 facts — DERIVED; written to `supabase/tools/baselines/f12-local-fingerprint.json` |
| Method | `supabase/tools/f12-fingerprint.mjs derive --write`: the shared default database read-only MATCHES the committed F05 baseline (`8bf3c7c6…`, 3621) — which also proves the Node digest reproduces the tool's — then the F08 delta (exactly its certified 2 columns / 2 constraints / 4 column privileges) and the F12 delta are measured on scratch databases `f12_fp_x / f12_fp_w / f12_fp_w12` and applied to the shared database's own rows. The shared database is NEVER migrated (other sessions verify against it). |
| EXACT INTENDED DIMENSIONS (pinned in the tool; anything else moving fails it) | added: columns 45 (29 + 16), constraints 40, functions 2 (the guard, the new sync_push body), indexes 13, policies 5, privileges.columns 52, privileges.effective 16, privileges.functions 1, privileges.relations 34, relations 2, triggers 7; removed: constraints 1 (the replaced change_log entity-list check), functions 1 (the replaced sync_push body). Net per dimension: columns 716→761, constraints 681→720, functions 28→29, indexes 284→297, policies 85→90, privileges.columns 725→777, privileges.effective 310→326, privileges.functions 55→56, privileges.relations 587→621, relations 35→37, triggers 104→111; every other dimension unchanged |
| MIGRATION FILE(S) | `supabase/migrations/20260922180000_f12_life_records.sql` (the only one) |
| FRESH-INSTALL RESULT | PASS — applied while empty after the full shipped sequence in `f12_env` (every `run-f12.mjs` run), in the three fingerprint scratch databases, and in the private journey stack; ENV A of the full harness: see M6 |
| POPULATED-UPGRADE RESULT | ENV D (full harness) gained an F12 step on the populated, IR01+F05-upgraded database: nothing lost (row census and change-log pointer count unchanged), no row rewritten (member and task digests), new tables empty, owner creates a record via sync_push (retry = already_exists, no second row), a stranger is refused; fail-closed assertion passes. Result: see M6 (full harness run) |
| RLS RESULT | `79-f12-life-records.sql` 59/59 (below) |
| SYNC RESULT | `journey-life-admin.mjs` 24/24 over real PostgREST; `tests/lifeAdmin/sync.test.mjs` 12/12 through the production composition |

### RLS attack matrix (`supabase/tests/79-f12-life-records.sql`, 59/59, private `f12_env`)

| Actor / surface | records | links |
|---|---|---|
| unauthenticated (anon) | SELECT, INSERT refused; no table privilege | same |
| owner | SELECT, INSERT, UPDATE (rename, clear, archive) ALLOWED; server-owned and identity columns (revision, owner, household) not writable; no DELETE | INSERT ALLOWED onto her own personal Task only; no UPDATE, no DELETE |
| same-household member | SELECT by id and whole-table: none of the owner's (sees exactly her own); UPDATE/DELETE touch nothing; INSERT in the owner's name refused | sees none; a link to the owner's record is refused exactly like a non-existent record; a link to the owner's private Task is refused exactly like a non-existent Task; forging a link in the owner's name answers the same whether her Task exists or not |
| unrelated household (valid foreign ids) | nothing by crafted id; a record naming the other household's child refused (household-keyed subject FK); a record inside the other household refused | links to the other household's record or Task refused |
| crafted subjectMemberId | an adult member is never a subject; an id naming no child refused; another household's child refused | — |
| crafted link targets | — | household-visible Task, another member's personal Task, another household's Task, a non-existent id: ONE identical refusal; another member's record refused; one link per (record, Task) |
| supersession references | NOT-APPLICABLE (supersession not built; see F12-STRETCH-01) | — |
| relationship inference | no row, no count, no change pointer for the owner's record, link or linked Task; a member's own pointers are only her own | same |
| sync / change log | member: no pointer for the owner's record, link or Task; sync_pull from 0 delivers none; sync_push reusing the owner's local id → her own new row (`created`); pushing a record in the owner's name refused; pushing a link onto the owner's private Task refused by the guard. Stranger: sync_pull / sync_push naming the other household refused (42501); change log shows nothing | same |
| error payloads | refusal message, DETAIL and HINT carry no private value | same |
| lifecycle | archive → no member pointer; purging the Task (server side) cascades the link away (tombstone pointer reaches the owner only); the record survives the purge | same |
| privileges | anon nothing; authenticated only the verbs/columns it uses; RLS on both; 3 + 2 policies, none DELETE; guard and sync_push are SECURITY INVOKER; anon cannot execute the guard | |

### Sync registration (client)

`lifeRecord` (create, update) and `lifeRecordLink` (create only) — registered by hand exactly like the owner-private `needsMe`
(the foundation manifest route would require regenerating into the shipped Build 4 migration): `CORE_SYNC_KINDS`, `CLOUD_TABLE`,
`IDENTITY_COLUMN`, `ALLOWED_OPS`, `UPDATABLE_COLUMNS` (exactly the migration's UPDATE grant), `DEPENDENCY_RANK` (record 2, link 3:
after the child, the artifact and the Task it names), `syncKinds.CORE_COLLECTION`, `projection.toCloudRow` (owner stamped from the
bound account; child subject and both link ends as cloud ids; an unmapped end is a scheduling fact), `apply.applyCloudRow` (arrives as
it left; an unresolvable child keeps the raw uuid so the integrity gate names it), `claimSeam.kindOfLocalId`. The claim does NOT carry
records (they reach the cloud as ordinary creates after binding); `describeLocalHousehold` counts them as content (M1).
`tests/hk-ir01/changeBridge.test.mjs` inventory updated 29/27 → 31/29 kinds (the one pinned count; explained in the test).

### Repair found in M5: refused-row values in durable sync evidence

`src/platform/supabaseSyncTransport.ts` copied PostgreSQL's DETAIL into sync evidence. For a CHECK or NOT NULL refusal that DETAIL
is "Failing row contains (…)" — the whole row, i.e. a note, a reference number, a location hint — and evidence is durable. Repaired
generically (every kind benefits): the row values are withheld ("Failing row contains (values withheld)"), the message still names
the constraint, and key-only details (unique / FK: ids) are kept. `failureFrom` is exported so the rule is unit-tested
(`sync.test.mjs` error-payload test). Shared-file change, recorded as `HK-INT-F12-TRANSPORT-01`.

### Fresh client, archive, stale revision, isolation — over REAL HTTP (`supabase/tests/journey-life-admin.mjs`, 24/24)

Run by `node supabase/tests/run-f12.mjs journey` on a private stack with F12-only names (`f12_stack` database, `f12_postgrest`
container, ports 54397/54398; `private-stack.mjs` gained env overrides for the database and container names, defaults unchanged) and
also registered in `run.mjs`'s combined journeys block. Every device is built by `composeAccountApp` with the real Supabase clients.

- a record made BEFORE binding + records, a record → Task link and a household Task made after binding reach PostgreSQL:
  records owner-private, the Task `personal` and hers, the link by cloud ids, every Life Admin change pointer stamped with her profile;
  the claim carried no record; the queue drained.
- a FRESH second device of hers hydrates and shows an IDENTICAL Life Admin home; its link resolves to its own record and its own
  personal Task; the reference survived; its state is valid; hydration produced no outbound work.
- archive on A reaches PostgreSQL as an ordinary update (revision 2, nothing deleted); B receives it; an edit from an editor opened
  before it is refused as STALE; a restarted device keeps it archived and creates no duplicate (no resurrection).
- a SECOND ADULT MEMBER of the SAME household, bound to that household on her own device, hydrates it and receives NO record, NO link,
  NOT the owner's personal Task — but DOES receive the household Task; none of the private values is anywhere in her persisted state;
  through PostgREST she reads no record, no link and no Life Admin change pointer, and cannot edit the owner's record.
- a stranger reads nothing and cannot plant a record; anon is refused; the attacks changed nothing.

Observed and handled honestly: `sync_pull` hands out only changes committed below the CLUSTER-WIDE snapshot barrier (SD4-012), and
sibling sessions' harnesses share the container, so on a busy host a change can arrive a pull or two later. The journey pulls until
the change arrives (bounded: 20 pulls, 0.5 s apart) — the property tested is that nothing is LOST or overwritten, never that it is
instant. Two earlier journey failures were my own sequencing (a device checked before its scheduled sync ran); fixed in the journey,
not in product code.

### Client sync through the production composition (`tests/lifeAdmin/sync.test.mjs`, 12/12, the Meals two-device harness, reused)

offline create (record, Task and link durable and queued in one envelope; nothing sent) then online (all three in the cloud,
owner-private, link by cloud ids); lost acknowledgement settles with one row; a refused row stays local as `validation-failure`
evidence; fresh device reconstructs identical fields, link and personal Task; rename + clear reach B as the same record and the
cleared value is null in the cloud; archive propagates and survives relaunch + another pull; STALE REVISION: B's queued edit cannot
overwrite A's newer archive, B keeps the cloud's truth and her edit as `cas-conflict` evidence; the claim payload carries no record;
ACCOUNT SWITCH: a device holding A's private (unsent) record and Task meets account B → quarantined (`boundOther`), zero requests on
B's behalf, nothing of A in any table; an interrupted claim by A over a household holding ONLY records is quarantined from B (records
count as content; control: a truly empty household bootstraps); DEMO: never queues or syncs, `sync` namespace null; the transport
withholds refused-row values.

### Account-switch isolation (brief section)

| Surface | Status | Evidence |
|---|---|---|
| canonical records | PASS | sync.test ACCOUNT SWITCH (no upload under B; quarantine) |
| link rows | PASS | same (link queued offline under A never reaches B's cloud) |
| Needs Review projection | PASS | the projection reads only the device's state; a quarantined device renders no account data (`canRenderAccountData` false for `boundOther`, foundation) — nothing of A is shown to B |
| cached/store state | PASS | quarantine keeps A's state on disk without rendering it for B (foundation behaviour, exercised) |
| masked identifiers | PASS | same, plus privacy.test (no identifier anywhere outside the detail) |


### Test-the-test (`scripts-dev/life-admin-mutation-check.cjs`; mutant code never committed; every file restored byte for byte)

Run at `f773587` (source mutants, serially, 17/17) and in F12's private `f12_env` (SQL mutants, 3/3): **20 / 20 CAUGHT**, each by a
genuine assertion failure (a crash or an unparseable run would be BROKEN, not caught). Plus the three M0 policy mutants (3/3).

| Brief # | Required mutant | Implemented as | Verdict |
|---|---|---|---|
| 1 | expiresOn passage marks record archived/superseded/invalid | LA1 — a record whose recorded expiration date passed is dropped from her active records | CAUGHT (view) |
| 2 | a date creates a Task without acceptance | LA2 — saving a dated record also creates a Task | CAUGHT (commands, today) |
| 3 | completing a linked renewal Task marks the record renewed | LA3 — a record with a completed linked Task stops needing review | CAUGHT (view) |
| 4 | matching title auto-supersedes | LA4 — a new same-title record retires (archives) the older one. Supersession is NOT BUILT, so the INFERENCE itself is the mutant | CAUGHT (commands) |
| 5 | superseding deletes the old record | LA5 — archiving, V1's only history-retiring action, deletes the record (supersession NOT BUILT) | CAUGHT (commands, screen) |
| 6 | same-household member reads a private LifeRecord | LA6 (SQL) — record SELECT policy opened to the household | CAUGHT (79) |
| 7 | a private link reveals LifeRecord existence | LA7 (SQL) — link SELECT policy opened; LA7b (SQL) — the guard answers "someone else's Task" differently from "no such Task" | CAUGHT (79), CAUGHT (79, 8 checks) |
| 8 | child display-name change breaks the subject relationship | LA8 — the subject is resolved by display name instead of id | CAUGHT (commands) |
| 9 | archived record reappears active after hydration | LA9 — a pulled record always arrives active | CAUGHT (sync) |
| 10 | archived/deleted linked Task counts as active admin work | LA10 — any non-completed Task (archived included) counts as open work | CAUGHT (commands, view) |
| 11 | duplicate titles are one canonical record | LA11 — a matching title is treated as a repeat save | CAUGHT (commands) |
| 12 | referenceNumber / locationHint / userNote leak into home / verdict / log | LA12a home row; LA12b console log; LA12c durable sync evidence; LA12d Life hub | CAUGHT (privacy); CAUGHT (privacy); CAUGHT (sync); CAUGHT (view, privacy) |
| W | a dangling/unavailable linked target crashes | LA13 — a link whose Task is gone throws | CAUGHT (commands, view) |
| (extra) | expires today is treated as passed (addendum G) | LA14 | CAUGHT (view) |
| (extra) | Needs Review is not bounded at three (addendum I) | LA15 | CAUGHT (view, screen) |
| (extra) | a Task created from a private record is household-visible (addendum D) | LA16 | CAUGHT (commands, screen) |

Telemetry surfaces for mutant 12 (addendum O): home, Life hub, Today and verdict, logs and error evidence are tested; analytics and
crash metadata are SAFE-UNAVAILABLE (no such module exists in the codebase to inspect); notifications and search NOT-APPLICABLE.
