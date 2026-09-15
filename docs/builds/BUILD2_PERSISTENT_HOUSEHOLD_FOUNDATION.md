# Her Keys Build 2 — Persistent Household Foundation

| Item | Value |
| --- | --- |
| Authoritative base | `main` at `7f6cf2278ebb5ca4f12294e2b35c9368d0093e52` (Build 1 plus the hostile-audit repairs) |
| Branch | `build/02-persistent-household-foundation` |
| Date | 2026-09-14 |
| Product authority | `HER_KEYS_PRODUCT.md` (unchanged), `docs/audits/BUILD1_HOSTILE_AUDIT.md`, and the Build 2 / 2A owner rulings |

**Build question:** can Her Keys reliably remember the user's life, decisions, household state and operating context across sessions?

Build 2 is an architecture build. The accepted Build 1 screens, navigation, tokens, typography and Talk It Out presentation are unchanged. The only visible changes are the neutral, text-only states that persistence needs (§12).

---

## 1. Scope

1. Canonical household application state.
2. Versioned local persistence.
3. Repository and storage boundary.
4. Startup hydration.
5. Onboarding and app route protection.
6. Persistent user decisions and actions.
7. Safe reset and recovery.

Plus the owner amendment on **customizable household categories**:

> Households define their structure. Her Keys coordinates that structure.

Schema v1 models how a household is organized as configurable data. The eight default Life areas (Kids, Home, Money, Meals, Work, Wellbeing, Relationships, Co-parenting) are *starter categories*, not a closed list of every area a household can have.

**Out of scope, deliberately:** authentication, Supabase or any backend, real AI, external integrations, household switching, invitations, roles and shared accounts.

---

## 2. Architecture

```
Screens and components (unchanged APIs: useSchedule, useOnboarding, useOneMove, useTalkItOut, useHousehold)
        │
Feature contexts — src/store/*Context.tsx
        │   project facts onto today, recompute intelligence, dispatch transitions
        ▼
Household store — src/state/appStore.ts        (single authority: lifecycle, dispatch/commit, day rollover)
        │   pure transitions — src/domain/*    (onboarding, Daily Load decisions, One Move, discovery, categories)
        ▼
AppStateRepository — src/persistence/appStateRepository.ts    loadAppState / saveAppState / resetAppState
        │   envelope, validation, migration — src/persistence/envelope.ts, src/domain/state.ts
        ▼
StorageAdapter — src/persistence/storageAdapter.ts (interface, memory adapter for tests)
        ▼
asyncStorageAdapter — src/persistence/asyncStorageAdapter.ts   (the only file importing AsyncStorage)
```

The contexts were strangled rather than rewritten: every consumer keeps the hook it used in Build 1, and the facts behind each hook now come from the store. A future `SupabaseRepository` implements `AppStateRepository`; nothing above the repository knows whether data is local or remote.

| Layer | Files |
| --- | --- |
| Domain (pure, no React or React Native, runs under `node --test`) | `src/domain/state.ts`, `logicalDay.ts`, `projectDay.ts`, `loadTier.ts`, `categories.ts`, `onboarding.ts`, `dailyLoadDecisions.ts`, `oneMove.ts`, `discovery.ts`, `catalogReferences.ts`, `routeAccess.ts`, `context.ts` |
| Persistence | `src/persistence/envelope.ts`, `appStateRepository.ts`, `writeQueue.ts`, `storageAdapter.ts`, `asyncStorageAdapter.ts`, `damageSimulation.ts` (internal tools only) |
| State | `src/state/appStore.ts`, `src/state/initialState.ts` |
| Configuration | `src/config/dataMode.ts` |
| Content | `src/data/seed/demoHousehold.ts` (fictional demo), `src/data/catalog/onboardingOptions.ts`, `src/data/catalog/oneMoves.ts`, `src/data/seed/talkItOutScript.ts` (unchanged) |
| React binding | `src/store/AppStateProvider.tsx`, `appStoreInstance.ts`, `useHousehold.ts`, the four strangled contexts |
| Routing | `app/_layout.tsx` (root guards), `app/index.tsx` (resume redirect), `app/dev-tools.tsx` (internal) |

---

## 3. State classification

**Persist facts and accepted actions. Recompute intelligence.**

| Persisted facts and accepted actions | Derived intelligence (recomputed, never stored) | Ephemeral UI (session only) |
| --- | --- | --- |
| `origin`; household; user (display name, timezone); children (birth date); household categories; events; tasks (due date, plan); household systems; meal plan; onboarding (choices, furthest step, completion); One Move decisions per day; Talk It Out structure (topic and chosen answers); action records; envelope `writeSeq` | Logical today; the day's projection; Daily Load assessment and candidates; load tier and meter; day-state sentence; life status; operating profile; child age; "due today"; Talk It Out stage, hypothesis, confidence, pending question, result and quick replies; today's Daily Load decision (read from action records); One Move eligibility; route access | Hydration status; recovery and degraded flags; which alternative recommendation is showing; Talk It Out messages (including anything typed), draft and voice note; keyboard offset; scroll; navigation state; pressed and focus states |

**Not persisted, on purpose:**
- **Co-parent person:** nothing reads it yet. The `coparenting` role and `coparent-shared` scope exist.
- **Operating profile:** derived from the onboarding choices.
- **Numeric age:** derived from the birth date.
- **The `dueToday` flag:** derived from the due date.
- **Event `category`:** replaced by `categoryId`.
- **Any analysis result, recommendation copy, confidence label, color, icon or route.**

---

## 4. Canonical model (schema v1)

`src/domain/state.ts` defines every entity as a Zod schema. The TypeScript types are inferred from those schemas.

- **Shared value types:**
  - `Instant`: a UTC ISO-8601 string ending in `Z`.
  - `LocalDate`: `YYYY-MM-DD`, a calendar day in the household's timezone.
  - `SystemRole`: `kids | home | money | meals | work | wellbeing | relationships | coparenting`.
  - `VisibilityScope`: `personal | household | child | coparent-shared | professional`.

| Entity | Fields | Why each field is persisted |
| --- | --- | --- |
| root | `origin: 'demo' \| 'empty'` | A real-user build must never show fictional demo data it finds on the device. |
| `household` | `id`, `displayName`, `scope: 'household'` | The one active household; categories belong to it. |
| `user` | `id`, `displayName`, `timezone`, `scope` | Greeting; `timezone` defines "today". |
| `children[]` | `id`, `displayName`, `birthDate`, `scope: 'child'` | Kids screen. Age is derived. |
| `categories[]` | `id`, `householdId`, `name`, `systemRole`, `status: active \| archived`, `sortOrder`, `scope` | The household's own organization. |
| `events[]` | `id`, `title`, `categoryId`, `subjectMemberId`, `startsAt`, `endsAt`, `location`, `scope` | Daily Load, timeline, Kids and Work. |
| `tasks[]` | `id`, `title`, `categoryId`, `subjectMemberId`, `durationMinutes`, `commitment`, `dueDate`, `plan`, `scope` | Daily Load and life status. `plan` is `unplanned`, `day{date}` or `timed{startsAt}`. |
| `systems[]` | `id`, `name`, `description`, `categoryId`, `scope` | Systems, Home and Money. |
| `meals[]` | `id`, `date`, `title`, `categoryId`, `scope` | Meals screen and life status. |
| `onboarding` | `goalIds`, `strengthIds`, `struggleIds`, `lastStep`, `completedAt`, `scope` | Resume and route protection. Answers are stored by catalog id, never by label. |
| `oneMoves[]` | `id` (`onemove-<date>`), `forDate`, `targetId`, `status: selected \| completed \| withheld`, `decidedAt`, `completedAt`, `scope` | The day's One Move is a stored commitment. |
| `discovery` | `id`, `topicId`, `answers[{questionId, optionId}]`, `scope` | Resume the structured investigation. |
| `actions[]` | typed union, §8 | Audit-trail foundation; the "moved" card after a relaunch. |

**Integrity checks** (`findIntegrityProblems`) run after shape validation:
- **Uniqueness:** unique ids per collection, unique category `sortOrder`, and at most one category per `systemRole`.
- **Categories:** every category belongs to the household, and every `categoryId` exists (archived categories are still valid references).
- **Members:** `subjectMemberId` must name a household member, and any `child`-scoped record must name a child.
- **One Move:** one decision per date.
- **Action records:** every event and task an action names must exist.

### Household categories

`src/domain/categories.ts` supports adding, renaming, reordering, archiving and restoring categories. There is no deletion: archiving keeps historical references valid.

- **Identity:** business logic identifies a category by `categoryId`. Specialized behavior asks for the category with a given `systemRole` (`categoryWithRole`).
- **Names:** a name is presentation only. Renaming "Money" to "Household Finances" keeps `systemRole: 'money'`.
- **No inference:** a new category always starts with `systemRole: null`, so "Money Stuff" never becomes the money category.
- **Generic categories:** Daily Load reasons about time, commitments, flexibility and due dates, never category names, so commitments in a custom category take part naturally. Life status gives a custom category a generic reading (what's due or on today).
- **What Life shows:** Life and Today's "Also checked" render only categories whose role has a Build 1 Life screen (Kids, Home, Money, Meals, Work), in the household's order and under the household's names. Rendering custom categories and the other starter areas needs design work, deferred under the design freeze.

---

## 5. Dates, logical day and timezone

- **Two kinds of value:** a moment is stored as a UTC instant; a day-bound fact as a `LocalDate`. Formatting is presentation only (`src/features/today/formatDay.ts`).
- **Today:** the calendar date of now in `User.timezone`. It's recomputed at launch, when the app returns to the foreground, and once a minute while open. None of these triggers saves anything.
- **Timezone data:** conversions use the platform's `Intl`. `checkTimeZoneSupport()` covers offsets, date boundaries and daylight-saving gaps and overlaps. It passes in Node and on the Android emulator's Hermes engine (logged at every development launch), so no timezone library was added.
- **Daylight-saving days:**
  - A time that never happens (spring forward) moves forward past the gap.
  - A time that happens twice (fall back) uses its first occurrence.
- **Day projection** (`src/domain/projectDay.ts`) turns stored facts into Build 1's minutes-after-midnight shape:
  - Events overlapping the day are clipped at midnight.
  - A task is on the day when it's due or overdue (`dueDate <= day`), planned for that day, or timed on that local date.
- **Demo materialization:** the demo household is a template of day offsets and local times. First launch and reset anchor it to the current logical day and store absolute dates. After that the stored dates are authoritative, so the day after seeding, Today is correctly empty until a reset. Seed ids never change.
- **Rollover:** earlier days' actions and One Move decisions stay as history. Daily Load recomputes for the new day, which starts with no decision, and gets its own One Move decision.
- **Assumptions:**
  - The household timezone is set once, from the device at seeding.
  - Travel and timezone changes are deferred.
  - Wall-clock minutes on a daylight-saving change day aren't adjusted for the missing or repeated hour.

---

## 6. Storage, validation and migration

| Item | Value |
| --- | --- |
| Primary key | `herkeys.appState` |
| Corrupt copy | `herkeys.appState.corrupt` — development and internal builds only: `{ detectedAt, reason, issues, raw }` |
| Newer-version copy | `herkeys.appState.future` — every build; never replaced by a lower version |
| Envelope | `{ schemaVersion, appVersion, savedAt, writeSeq, data }` |
| Current schema | `CURRENT_SCHEMA_VERSION = 1` |

**Decoding** (`decodeStoredState`) treats stored text as untrusted. There is no `JSON.parse(...) as AppState` anywhere. The steps:
1. JSON parse → `malformed_json`.
2. Object check → `not_an_object`.
3. Version present and an integer → `missing_schema_version` / `invalid_schema_version`.
4. **Version above current → `future_version`.** It isn't parsed with older rules.
5. Version below 1 → `unsupported_schema_version`.
6. Strict envelope schema → `invalid_envelope`.
7. Migration chain → `migration_failed`.
8. Strict v1 schema → `invalid_state`.
9. Integrity → `integrity_violation`.

**Security properties:**
- Strict objects reject unknown keys, including a stored `__proto__`.
- Ids must start with a letter or digit.
- Engine lookups keyed by stored ids use own-property checks (HK-AUDIT-039).
- Validation issues name paths and ids, never stored values.
- The encoder validates before every write and refuses to store a state it wouldn't accept back.

**Migration seam** (`migrateStoredState`):
- `migrations.get(n)` turns version-n data into version n+1.
- The plan's validators check each step's input and output.
- A missing, throwing or invalid step fails; nothing is guessed.
- v1 has no migrations yet. The seam is exercised in tests with an injected v1 → v2 plan.

**Catalog drift isn't corruption.** A stored onboarding answer the catalog no longer offers, or a Talk It Out record that no longer fits the script, is dropped on its own and reported (`repairCatalogReferences`). The rest of the household is kept.

**AsyncStorage posture:**
- Build 2 state is local, unencrypted AsyncStorage.
- Credentials, auth tokens, API keys and cryptographic secrets must never be stored there.
- Only `asyncStorageAdapter.ts` imports AsyncStorage (`@react-native-async-storage/async-storage` 2.2.0, the SDK 57 version).

---

## 7. Writes and failures

- **Action time:** a transition updates in-memory state synchronously and hands the snapshot to the write queue. Nothing depends on backgrounding, app termination or process death.
- **Serialized:** one write in flight. Newer snapshots replace the waiting one, so a burst of actions costs at most two writes.
- **Newest wins:**
  - Each write carries the next `writeSeq`, continuing from the stored value.
  - Anything at or below the committed sequence is skipped.
  - A slow older write can't land after a newer one.
- **Failure handling:**
  1. Retry once immediately, with the newest snapshot if one arrived.
  2. Keep memory authoritative.
  3. The next action writes everything again.
  4. After 2 consecutive failed cycles, the ephemeral `persistenceDegraded` flag is set and Today shows "Some recent changes may not be saved yet."
  5. A successful write clears it. Nothing claims a failed write succeeded.
- **Commit:** finishing onboarding uses `commit`, which saves before showing the change and waits through at most one retry.
- **Writes caused by hydration:**

| Launch outcome | Primary writes |
| --- | --- |
| Empty storage (first launch) | 1 (the seeded state) |
| Valid state | 0, or 1 if today's One Move decision is created |
| Catalog repair | 1 |
| Invalid state | 1 (fresh state); the corrupt copy is kept aside in development/internal builds |
| Demo state found by an empty-mode build | 1 (empty state; fictional data isn't kept) |
| Newer schema version | **0 for the whole session**; in-memory defaults, persistence disabled, reset refused |
| Storage read failure | 0 for the session; in-memory defaults, persistence disabled |

Calling hydrate again (a remount, or a StrictMode double effect) returns the same promise: one read, no duplicate writes.

---

## 8. Decisions and the action ledger

**Daily Load.** "Move it to tomorrow" does what it says:
- The task's plan becomes `{ kind: 'day', date: tomorrow }`, and a typed action record is appended:

```ts
{ id, type: 'daily_load.move_task', logicalDate, createdAt,
  actor: 'user', source: 'her_keys_recommendation', approval: 'approved',
  targetId: taskId,
  reason: { code: 'transition_buffer_shortfall', windowBeforeEventId, windowAfterEventId,
            bufferMinutes, projectedBufferMinutes, requiredBufferMinutes },
  before: { plan }, after: { plan }, scope: 'personal' }
```

- **Keeping the plan** records `daily_load.keep_plan` with `approval: 'declined'`, the recommended task, and no fact change.
- **Rules:**
  - One decision per logical day.
  - Only a task the current assessment still recommends can be moved.
  - A due or overdue task is never recommended.
- **After a relaunch:** Daily Load is recomputed from the moved task. The "moved" card shows what Her Keys said at approval time, as recorded in the action.
- **Actor vs approver:** Build 2 records `actor: 'user'` and `source`. Separate actor and approver fields will be needed once other household members or autopilot can act.

**Load tiers** (`src/domain/loadTier.ts`, the only place these thresholds exist), measured on the tightest transition buffer:
- OPEN: 45 minutes or more.
- TIGHT: 23–44 minutes.
- OVERLOADED: 22 minutes or less, including negative buffers.
- The load meter reads the tier. The seeded demo day (35 minutes) is TIGHT.

**One Move.** Each logical day gets one stored decision, made once onboarding is complete:
- **Tight or open day:** the move is `selected`.
- **Overloaded day:** a move that adds work is `withheld` ("No One Move today.").
- **Stability:**
  - The decision isn't replaced when the day changes later.
  - A withheld day stays withheld even after she frees up time.
  - The next day decides afresh.
  - A move already completed isn't offered again.
- **Real households:** an empty-mode household has no catalog, so it's offered none.

---

## 9. Talk It Out privacy

Stored: `{ id, topicId, answers: [{ questionId, optionId }], scope: 'personal' }`.

**RAW_TRANSCRIPT_PERSISTED=NO. AI_MESSAGE_HISTORY_PERSISTED=NO.**
- **Free text:** whatever she types is matched to a scripted option in memory, and only the option id is stored.
- **Not stored:** unmatched text, Her Keys' replies, hypothesis text, confidence and results.
- **On relaunch:** the answers are replayed through the deterministic engine, which rebuilds the reasoning, the pending question and any conclusion. Her earlier answers appear as "Your topic" / "Your answer" with the option she chose, not as a bubble of words she typed.
- **Other rules:** "Start over" clears the record. There's no expiry rule in Build 2.

---

## 10. Hydration and route protection

- **Lifecycle:** `unhydrated → hydrating → ready`, or `recovery` when stored state couldn't be used. Recovery uses the same derive-and-render path as a normal launch.
- **Launch screen:** `app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` (from `expo-router`, so no new dependency) and renders **no navigator** until state has loaded.
- **Deep links wait:** the navigation container keeps the launch URL until a navigator mounts. The link waits through hydration and is then checked against the guards, so nothing protected can flash.
- **Guards:** every root screen is declared inside its own `Stack.Protected`, driven by `ROOT_SCREEN_GUARDS` / `canOpenScreen` in `src/domain/routeAccess.ts`:

| Screen | Opens when |
| --- | --- |
| `index` (Welcome) | onboarding incomplete |
| `onboarding/goals` | onboarding incomplete |
| `onboarding/strengths` | incomplete and a goal is chosen |
| `onboarding/struggles` | incomplete, goals and strengths chosen |
| `onboarding/talk-it-out`, `onboarding/profile` | incomplete, all three chosen |
| `(app)` (Today, Life, Calendar, Systems, Her Keys AI) | onboarding complete |
| `talk-it-out` (modal) | onboarding complete |
| `dev-tools` | internal tools enabled |

- **Settled states:** `ready` and `recovery` route identically; nothing opens before either.
- **Onboarding resume:** Welcome renders a `<Redirect>` to the furthest step reached, decided once per launch. This isn't the protection boundary.
- **Finishing onboarding:** saves completion, then the guards close onboarding (removing it from history) and open the app.
- **Initial route:** the root stack names `index` as its initial route only while Welcome can be opened.
- **Authentication:** future authentication becomes another condition in the guard table, with no screen changes.

---

## 11. Demo and real modes

| | Demo mode | Empty (real) mode |
| --- | --- | --- |
| First launch | Fictional Ellis household, anchored to today | Household and user identity with no names, and the eight starter categories; no people, events, tasks, systems, meals or One Move catalog |
| Internal tools (`herkeys://dev-tools`) | Available in development, or with `EXPO_PUBLIC_HERKEYS_INTERNAL_TOOLS=1` | Never |
| Demo state found in storage | Loaded | Replaced by empty state (`mode_mismatch`) |

- **`EXPO_PUBLIC_HERKEYS_DATA_MODE`:** `demo` or `empty`. When unset, development builds are demo and every other build is empty.
- **Configuration, not secrets:** both variables are safe to ship in the bundle.
- **Guarantee:** a production build with no configuration can never load the fictional household.
- **Internal tools:**
  - Show lifecycle, recovery reason, hydration time, persistence state and the logical day.
  - **Reset demo data** clears stored state (not the newer-version copy), re-anchors the demo to today and restarts onboarding, the same way every time.
  - Rename or add a category.
  - Write a damaged stored state (cleared, malformed JSON, missing version, invalid state, dangling category, newer version); saving pauses for the rest of the session.

---

## 12. Visible changes (all text-only, allowed under the design freeze)

- **Weekday:** "Wednesday" on Today and Calendar is now the formatted logical weekday.
- **Empty-mode states:**
  - The greeting without a name ("Hi there").
  - "Nothing scheduled."
  - "Nothing planned." on Meals.
  - "No One Move today."
- **Withheld One Move:** "No One Move today. Today is already full, so Her Keys isn't adding anything."
- **Persistence notices on Today:**
  - "Some recent changes may not be saved yet."
  - "Her Keys couldn't read what was saved on this device, so it started fresh."
- **Talk It Out:** recalled answers use the existing overline and body text, right-aligned, with no bubble.
- **Category names:** Life rows and Life headers use the household's own names, which are the Build 1 names for the demo.

---

## 13. Hostile audit findings addressed

| Finding | How |
| --- | --- |
| **HK-AUDIT-038** deep-link bypass of onboarding | Root `Stack.Protected` guard table; nothing routes before hydration |
| **HK-AUDIT-047** persistence must persist onboarding completion | `onboarding.completedAt` saved with `commit` before the app opens |
| **HK-AUDIT-031** Life screens reading seed directly | Every screen reads canonical state through the contexts or `useHousehold`; seed modules removed |
| **HK-AUDIT-015** One Move ignoring Daily Load | Semantic load tiers; a stored `withheld` decision on overloaded days. The completion copy itself is unchanged. |
| HK-AUDIT-037 *(dependency)* | Talk It Out handlers read the latest session, the candidate index can't point past the end, and `restartFallback` returns a clean state. Replay and action-time writes depend on all three. |
| HK-AUDIT-039 *(dependency)* | Own-property checks on script lookups, now keyed by stored ids |
| HK-AUDIT-041 *(dependency)* | The move logic is a pure, tested transition (`approveDailyLoadMove`) |
| HK-AUDIT-036 *(partial, dependency)* | Schedule values validated at the data boundary (durations, instants, dates); meal rows keyed by id |

No other deferred finding was changed.

---

## 14. Verification

### Automated tests

`npm test` runs 126 tests in 25 suites, with no added test dependencies (`node:test` plus the type-stripping loader in `tests/support/register-ts.mjs`).

| Suite | Covers |
| --- | --- |
| `logicalDay` | Today in the household timezone, calendar arithmetic, daylight-saving gaps and overlaps, day projection and clipping, due, planned and timed tasks |
| `loadTier` | Boundaries 45 / 44 / 23 / 22 and negative buffers; the meter reads the tier; the demo day is TIGHT |
| `categories` | The owner amendment's 10 required cases: starter categories, custom categories without a schema change, rename keeps references and role, similar names don't gain a role, order survives storage, archived references stay valid, dangling references fail, Daily Load with custom categories, no logic depends on names (including a source scan) |
| `schema` | Shape and relationship rejections, `__proto__` handling, issues never contain stored values |
| `persistence` | Envelope round trip, classification of hostile stored text, the future-version path, the migration seam, repository quarantine, read failure, reset |
| `writeQueue` | Serialization, newest-wins, sequence continuity, immediate retry, degraded after repeated failures |
| `appStore` | Lifecycle, first-launch writes, double hydration, burst write bound, commit-before-publish, recovery through the normal launch path (6 hostile states), newer-version zero primary writes, read failure, demo-in-empty-mode, catalog repair, write-failure degradation and catch-up, deterministic reset, re-anchoring, day rollover |
| `onboarding` | Id-based choices, partial resume, furthest-step behavior, completion survives relaunch |
| `routeAccess` | Nothing opens before hydration; every protected link refused before onboarding and allowed after; recovery routes like ready; step guards; internal tools; every file route guarded in the root layout; no fixed initial route to a guarded screen |
| `dailyLoadPersistence` | Typed move record; the moved task survives relaunch and Daily Load recomputes; no stored analysis; keeping the plan; one decision per day; overdue tasks never moved |
| `oneMove` | Stored daily decision; the 23 / 22 boundary; withheld stays withheld; completion survives relaunch; stability; rollover; catalog drift; no catalog for real households |
| `discoveryPersistence` | Structure only (no typed text, no replies); every path replays exactly; recalled presentation; unmatched and post-conclusion messages store nothing; stale records refused; resume and Start over |
| `designIndependence` | No presentation keys or values in stored state; semantic statuses |
| `dailyLoad`, `talkItOut` (Build 1) | Unchanged assertions; the seeded-day fixtures now come from the materialized demo projection |

### Negative controls

Each mutant was applied, the full suite run, the file restored byte-for-byte, and its git hash compared. After all eight the suite was green (125/125 at that point) and the tree clean.

| Mutant | Target tests failed | Hash restored |
| --- | --- | --- |
| M1 Onboarding completion stripped when stored | yes (resume and commit tests) | yes |
| M2 Approved move doesn't change the task fact | yes (relaunch recompute tests) | yes |
| M3 App routes open during onboarding | yes (route access) | yes |
| M4 Schema validation removed from hydration | yes (hostile-state and recovery tests) | yes |
| M5 One Move offered when overloaded | yes (22-minute boundary, withheld stability) | yes |
| M6 Newer-version session keeps writing | yes (zero primary writes) | yes |
| M7 TIGHT boundary off by one | yes (tier and One Move boundaries) | yes |
| M8 System category looked up by name | yes (rename keeps role) | yes |

### Manual acceptance (Android emulator `Pixel_8_Pro`, API 37, Expo Go 57.0.9, dev bundle)

| Scenario | Result |
| --- | --- |
| 1 Fresh install → Welcome | PASS |
| 2 Partial onboarding → kill → reopen → resumes on the same step with its choice | PASS |
| 3 Complete onboarding → Today; Back leaves the app; kill → reopen → Today | PASS after a fix: the first run found the fixed-initial-route render error on relaunch |
| 4 Accept Daily Load move → kill → reopen → still moved, Daily Load recomputed | PASS |
| 5 Complete One Move → kill → reopen → still completed | PASS (the first attempt was a driver tap outside the button; Metro logged no save) |
| 6 Protected links before onboarding (8 links) → Welcome, with no protected content in continuous sampling | PASS |
| 7 Reset demo data → Welcome; original seed restored | PASS |
| 8 Corrupt stored state (malformed JSON, dangling category) → recovery with a copy kept aside; newer schema version → preserved, never overwritten, reset refused | PASS |
| Protected links after onboarding (7 links) → requested destination survives a cold start | PASS |
| Talk It Out → kill → reopen → structure replayed, answers recalled, typed words absent | PASS |
| Household categories: rename persists across relaunch in Life and headers | PASS |
| Build 1 regression walk: Today, Life and its five screens, Calendar, Systems, AI tab with keyboard, shared modal | PASS |
| Empty (real-user) mode: demo state left on the device is refused (`mode_mismatch`); internal tools unreachable before and after onboarding; Today shows "Hi there", "Nothing scheduled." and "No One Move today" with no fictional names; Meals shows "Nothing planned."; Systems is empty | PASS |
| Day rollover at runtime | NOT_EXECUTED — needs the emulator clock changed; covered by automated rollover tests |

`checkTimeZoneSupport()` passes on the emulator's Hermes engine at every development launch.

### Performance

**Test conditions:**
- Emulator running Expo Go.
- Both builds used Metro development bundles.
- Launch times run from the Android `START` log line to a JS marker, both on the device clock.
- Builds were launched alternately, so drift affected both equally.
- The first launch of each build was discarded.

| Measure | Build 1 | Build 2 |
| --- | --- | --- |
| Cold start to first screen, both on Welcome (6 rounds) | median 3,530 ms (3,080–3,960) | median 3,671 ms (3,204–5,698) |
| Cold start to root layout mounted (bundle loaded, JS running) | — | median 3,350 ms (2,977–5,239) |
| Cold start with Build 2 opening Today (heavier than Welcome), two runs | 3,177 / 3,477 ms | 4,052 / 3,630 ms |
| Hydration, stored state | — | medians 98–135 ms across runs; 81–207 ms overall (read 24–60 ms, decode and validate 52–141 ms) |
| Hydration, empty storage | — | 36–52 ms |
| Action to persisted | — | JS encode 0.5–8 ms; native AsyncStorage write 5–320 ms (one 505–544 ms outlier during a concurrent export); the screen updates immediately |
| Hermes bundle (`expo export`) | 2,770,964 bytes | 3,546,714 bytes (+776 KB) |

**Against the budgets:**
- **Cold start (+200 ms):**
  - Like for like, the difference in medians is +141 ms.
  - Individual launches vary by more than the budget: paired differences ran from −748 ms to +2,090 ms.
  - This environment therefore can't confirm or rule out a regression of that size.
  - The bundle-load marker shows no measurable cost from the larger bundle.
- **Hydration (~100 ms):** met in faster launches, exceeded in slower ones. Zod validation on Hermes (development mode) dominates.
- **Action-to-persist (<50 ms):** the JS side meets it. The native AsyncStorage write on the emulator usually doesn't, and nothing is blocked while it runs.
- **Production build:** release performance (Hermes bytecode) wasn't measured, because no development or standalone build exists yet.

**Bundle attribution:**
- **Zod:** +591 KB of minified JS is mostly Zod (about 805 KB of source). Its entry point pulls in every error-message locale and the JSON-schema tooling, and Metro doesn't drop unused exports.
- **`zod/mini`:** re-exports the same core barrel, so switching to it wouldn't avoid this.
- **Other growth:** app code adds 107 KB of source; AsyncStorage adds 16 KB.

**Loops and duplicate work:**
- **Hydration:** one `hydrated` event per launch; no hydration loops.
- **Write bursts:** a burst of actions is bounded to two writes (automated test).
- **Loading valid state:** writes nothing.

## 15. Known limitations

- **Local only:** no account, cloud backup or cross-device sync, and no production-grade account recovery. Recovery means starting over on this device; in development the unreadable data is kept aside.
- **Unencrypted storage:** AsyncStorage is unencrypted local storage.
- **Timezone:** fixed per household; travel is deferred.
- **No task completion model:** a timed task appears only on its own day.
- **Life screen:** doesn't yet render custom categories, Wellbeing, Relationships or Co-parenting. Their data and summaries exist.
- **Empty-mode copy:** Build 1 copy that assumed a populated household still shows in empty mode:
  - "Her Keys looked across today. Nothing needs moving."
  - "0 systems running"
  - "Nothing due this week"
  - Real-user intake and its empty states need product copy, deferred under the design freeze.
- **Performance:** measured only in Expo Go development mode. Hydration sometimes exceeds the ~100 ms budget, and native AsyncStorage writes on the emulator exceed ~50 ms.
- **One household:** no switching, invitations, roles or co-parent sync.
- **No production AI and no external integrations.**
- **Unverified platforms:** only verified on one Android emulator in Expo Go. Not verified: iOS, a development or standalone build, a small screen, large font, TalkBack.

## 16. Deferred backend work

- **Backend authority:** a `SupabaseRepository` implementing `AppStateRepository`, with server-side authority for decisions and action records.
- **Per-domain storage:** normalized tables in place of the single v1 blob; the in-memory domain boundaries already match.
- **Access control:** row-level security keyed by `VisibilityScope` and household membership, with separate actor and approver in `ActionRecord`.
- **Authentication:** an auth layer added to the route guard table.
- **Secure storage:** for any credential or token, never AsyncStorage.
