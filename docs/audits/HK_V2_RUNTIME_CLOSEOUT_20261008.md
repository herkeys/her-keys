# Her Keys V2 runtime closeout — 2026-10-08

**Overall: BLOCKED / NOT CERTIFIED. PR #7 remains open and unmerged.**

Authority: [HK_V2_STAGING_PRODUCTION_PARITY_GATE.md](HK_V2_STAGING_PRODUCTION_PARITY_GATE.md).
Application source: `adf740c87c653ca5999d4b35962819981dc36c74` on
`repair/v2-audit-safe-closeouts-20261008`, preserving the original repair commit
`418a03aa8c512460ab46f1d2c1355f7b416e6055`. Base: `integration/welcome-tree-auth-runtime`.
This report distinguishes live catalog/configuration observations, local scripted
regressions, and native runtime evidence. A local PASS never certifies a live feature.

## Evidence matrix

| Gate | Result | Evidence / remaining requirement |
|---|---|---|
| Exact project identities | PASS | Authenticated dashboard: **Her Keys Staging**, `fhhudicklmpofuzkxeqe`; **Her Keys Production**, `npykvnxnehlsdlbumzwk`; both `herkeys's Org`, `qouxjbueadjitgpchwtj`. No K Scan project accessed. |
| Repository validation | PASS | Clean `npm ci`; 3,715/3,715 application tests, 846 suites, zero skips; TypeScript; release identity; Expo compatibility; Doctor 21/21; native config introspection; foundation SQL generator `--check`; CI run linked below. |
| Staging ↔ Production application schema | PASS | Canonical fingerprint: `#GATING=58f82fed660a6b3876b66111251b3b27`, 4,449 facts on both projects. Includes effective privileges and default ACLs. |
| Complete migration-name coverage | PASS | All 13 `FULL_CHAIN` names on both projects; no missing migration name. |
| Exact migration-version/source ledger parity | FAIL | Staging matches 5/13 repository versions, Production 0/13. Stored source matches 8/13 and 12/13 respectively. Historical reconciliation placeholders explain the remaining stored-source differences; they do not independently prove original execution. No ledger rewrite or migration replay. |
| Repository chain → deployed schema reproduction | BLOCKED | Current environments match each other; no fresh disposable replay/fingerprint of the complete chain in this run. Docker's Linux engine was unavailable. Historical 1,592-check certification remains historical local evidence. |
| RLS/RPC/grant definition parity between environments | PASS | Canonical functions, policies, explicit/default/effective privileges match. Initial catalog also compared Storage policies; none were present. |
| Anonymous Staging denial | PASS | Valid public Auth settings control returned 200; tasks, sync pull/push, bootstrap and protected functions returned 401 without a user session. See JSON evidence. |
| Authenticated RLS, claim/bootstrap, push/pull isolation | BLOCKED | Needs dedicated authenticated Staging accounts and live A→B→A/second-device tests. Matching function bodies and anonymous denial are insufficient. |
| Edge source, Staging ↔ Production | PASS | All four downloaded deployed source packages and their included shared modules have matching LF-normalized SHA-256 values. |
| Edge source, deployed ↔ repository | FAIL (comment-only drift) | AI and both Calendar packages match exactly. WeatherKit entry point omits two repository comment blocks; executable source matches by reviewed diff. No deployment performed. |
| Edge JWT settings | PASS | Both projects: AI/data/weather `true`, Calendar OAuth `false`, matching `supabase/config.toml`. Settings inspected without changing them. |
| Google configuration | PASS (configuration only) | Same three client IDs in web/iOS/Android order; enabled; own project callback; skip nonce and allow missing email enabled in both. Provider secrets were not revealed. Native sign-in remains unproven. |
| Apple configuration | PASS for native audience; environment delta | Both enabled with `com.herkeys.app`; Production also allows `com.herkeys.app.auth`. Native iOS proof unavailable. Secrets not revealed or compared. |
| Auth redirects/session configuration | PASS (configuration only) | Both allow `herkeys://auth/callback`; Site URL `http://localhost:3000`; access expiry 3,600s; refresh reuse 10s; replay detection on; single-session enforcement off; session/inactivity limits 0. Canonical release fallback origin still needs owner selection. |
| Email OTP | FAIL / BLOCKED on sender | Staging 6, Production 8 digits; expiry 3,600s. Both custom SMTP disabled; default Magic link/OTP email is link-only and template editing gated on SMTP. No OTP/auth email changes applied. |
| EAS preview target configuration | PASS after repair | Previously targeted Production. Preview now uses Staging URL/key and Google IDs from the authorized Her Keys development environment, backend `staging`, mode `empty`; explicit profile environment selection and build-time target guard added. |
| Android native Staging runtime | BLOCKED (launch PASS) | Finished preview APK installed, cold launch and account-choice screen observed. Provider/session/sync tests await designated account and Terms confirmation. No Android authentication PASS claimed. |
| iOS Google / native Apple runtime | BLOCKED | Owner states no iPhone available. Android cannot provide this proof. |
| F01–F13 live feature certification | BLOCKED | Full local suite passes; live persistence/sync/offline/isolation/cross-feature exercise remains incomplete. Per-feature matrix below. |
| Production promotion | NOT_APPLIED | No Production schema/data/auth/function/EAS change, store submission, or merge. Staging acceptance and owner approval remain required. |

## Repository repairs and CI

Commit `adf740c87c653ca5999d4b35962819981dc36c74`:

- Seven SDK 57 patch corrections only: Expo `.26→.27`, AuthSession `.13→.14`,
  Constants `.20→.21`, ImageManipulator `.20→.21`, Linking `.11→.12`,
  Notifications `.21→.22`, Router `.24→.25`; compatible unrelated lock entries retained.
- Existing source-test assertion normalizes CRLF for Windows. The Meals boundary
  registry records the parity authority document and the actual repair scope.
- Fresh-device adoption uses the existing authenticated bootstrap result
  `superseded_by_cloud`. Only an empty, healthy local installation may adopt the
  returned household. Populated local claims remain refused. The binding and empty,
  unhydrated sync namespace are saved before the first cloud pull; failed saves restore
  the prior identity. Storage-recovery fallbacks cannot adopt. Late results after
  logout/account switch cannot bind another account.
- Composition tests cover adoption, initial pull without outbound local content,
  reload/session restoration, different-account quarantine, malformed household
  identity, work created during bootstrap, durable-save failure and retry. These use
  a scripted cloud, not the deployed Supabase service.
- Profiles explicitly select development/preview/production environments and `empty`
  data mode. EAS build hook rejects missing keys, crossed backend refs, unsafe URLs
  and demo mode. Runtime URLs require exact HTTPS Her Keys hosts.

Local complete suite: 3,715 PASS, 0 FAIL, 0 skipped, about 90s. Targeted adoption,
composition, environment and identity regressions: 98 PASS. Expo Doctor: 21/21.
Generator: `node --import ./tests/support/register-ts.mjs supabase/tools/gen-foundation-sql.mjs --check` PASS.
Public/native configuration resolves Android `com.heykeys.app`, iOS `com.herkeys.app`,
EAS project `7b25f8fe-d7de-49c1-ba69-1fd3a065826a`, owner `ams2dad`, version 1.0.0,
Android version code 2, iOS build number 2. The differing Android identifier is existing
canonical release identity and was preserved.

[CI for application repair](https://github.com/herkeys/her-keys/actions/runs/37853642633):
`v2-repository-validation` PASS, 1m54s. Original run
`37822694307` failed Expo patch compatibility.
[CI for evidence commit ca09b32](https://github.com/herkeys/her-keys/actions/runs/37856004398)
also PASS. Any subsequent HEAD must pass before a future merge; runtime/OTP gates
still prevent certification.

## Live schema and migrations

Captured through the authorized dashboard SQL editor, with SELECT-only catalog
inspection; canonical fingerprint uses `BEGIN`, pinned empty search path and
`ROLLBACK`. No account/household contents were queried. Saved evidence:

- [Staging canonical schema](v2-closeout-20261008/staging-schema.csv)
- [Production canonical schema](v2-closeout-20261008/production-schema.csv)
- [Staging complete migration ledger](v2-closeout-20261008/staging-migrations.csv)
- [Production complete migration ledger](v2-closeout-20261008/production-migrations.csv)
- [Repository-to-ledger comparison](v2-closeout-20261008/migration-comparison.json)
- [Anonymous Staging control and denials](v2-closeout-20261008/staging-anonymous-smoke.json)

Fingerprint method: `node supabase/tools/schema-fingerprint.mjs print-sql --mode digest`;
`supabase/tools/schema-lines.sql` supplies the catalog facts. The dashboard query
retains its predicates/format strings/wrapper, with comments and layout shortened.
Both CSV captures are identical. Scope is `public`/`private`; platform-managed Auth
and Storage internals are not an application-schema reproduction claim.

Both projects have 43 application tables plus one additional relation (44 relations),
884 columns, 826 constraints, 342 indexes, 129 user triggers, 31 functions,
104 application policies, 892 explicit column grants, 738 relation grants,
59 function grants, 10 schema grants, 7 default ACL entries and 381 effective
privilege facts. No confirmed missing Staging object was found, so no Staging DDL
repair was applied.

| Migration name | Repository version | Staging version | Production version |
|---|---|---|---|
| build4_baseline | 20260919230054 | 20260919230054 | 20260924182148 |
| build4_cloud_schema | 20260919231500 | 20260919231500 | 20260924181956 |
| ir01_duration_source_and_claim_v3 | 20260921120000 | 20260921120000 | 20260924182007 |
| f08_meal_slot_and_status | 20260921160000 | 20260921160000 | 20260924182010 |
| f05_add_child_after_binding | 20260921190000 | 20260921190000 | 20260924182014 |
| f09_task_payment_mechanism | 20260922180000 | 20260924182047 | 20260924182017 |
| f10_career_opportunities | 20260922181000 | 20260924182051 | 20260924182021 |
| f11_rebuild_focus | 20260922182000 | 20260924182055 | 20260924182024 |
| f12_life_records | 20260922183000 | 20260924182059 | 20260924182028 |
| f13_people_os | 20260922200000 | 20260924182113 | 20260924182033 |
| int13_per_owner_uniqueness | 20260922210000 | 20260924182116 | 20260924182038 |
| env_function_alignment | 20260924183000 | 20260924182838 | 20260924182844 |
| external_calendar_connections | 20260925141432 | 20260925142007 | 20260925142013 |

The five early Staging stored statements are reconciliation comments claiming prior
MCP application on September 22; the shipping entry mentions seven sequential chunks.
Production's baseline entry is a reconciliation comment plus `select 1`, stating the
baseline already existed. These are ledger metadata rather than stored original SQL.
Production version ordering places baseline after INT13. The other stored migration
texts match repository LF bytes (12 in Production, 8 in Staging), including the
function alignment and Calendar activation. Treat these facts as historical tracking
drift; never replay the destructive baseline/shipping restructuring to fix timestamps.
A future ordinary `db push` must not interpret unmatched versions as missing objects.

## Deployed functions and Auth

[Per-file SHA-256 evidence](v2-closeout-20261008/function-hashes.json) compares source ZIPs
downloaded independently from each verified project, with CRLF→LF normalization.
All included `_shared/http.ts`, `_shared/supabaseAdmin.ts`, and Calendar `_shared/crypto.ts`
match the repository. Secrets were not downloaded or revealed.

| Function | Both deployed entry-point SHA-256 | JWT verification | Repository |
|---|---|---|---|
| herkeys-ai | `6dafa51385552fcf267abd607751b4b4e54f42e4fdf4ee118ce44c4b2e240606` | true | Exact match |
| calendar-data | `a5479fa1c7128ddf036e2904bb950f6143043453d2216da22bdd7fff2345cc53` | true | Exact match |
| calendar-oauth | `d012bf51fc16c9fd85b9187250c25deb612bf3975a2668b09bf7960bfe2bb43b` | false | Exact match |
| weather-context | `d1091ecc7da5754c190148657a3af09dc607b0a4e628449e0fd68d274fa9fc82` | true | Repository `7533b234810cb9d1d7735ad215631380b02426ba99ad12253657abd55a6eb9e8`; two comments differ |

JWT flags are configuration proof; authenticated Gemini, Calendar consent/refresh
and WeatherKit responses remain unproven. A download-source match does not certify
external provider credentials, quotas or runtime behavior.

Both projects' Edge secret-name lists include `GEMINI_API_KEY`, all four
`WEATHERKIT_*` names (`KEY_ID`, `PRIVATE_KEY_P8`, `TEAM_ID`, `SERVICE_ID`),
`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and
`EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`. Only names were inspected, not values.
Presence does not prove validity, environment separation or provider runtime success.

Google clients, same order in both projects:
`857660202409-109l3gr8jo3pq1si08s7segqat1h6050.apps.googleusercontent.com`,
`857660202409-trj4ec5diqeso3blh322phmld0b5bg8e.apps.googleusercontent.com`,
`857660202409-mrhq08p55ikjlnclm1tkrk971a7ukk68.apps.googleusercontent.com`.
Own Supabase callbacks are shown in each provider panel. New signups and confirmed
email are enabled; anonymous sign-in/manual linking disabled. Observed rate-limit
values match: SMS 30, refresh 150, verification 30, anonymous 30, sign-in/signup 30,
Web3 30; email sending limit was redacted by the browser and is not asserted here.

SMTP is disabled in both projects. Magic link/OTP and Confirm signup previews use
`{{ .ConfirmationURL }}` without a displayed token. Both Confirm signup subjects are
the default "Confirm your email address". A custom sender must be configured before
template editing; the source-edit controls were disabled. No email was sent in this
run. Token-bearing templates and complete delivery testing remain gated on the sender.

## EAS and native evidence

The EAS preview environment originally had the **Production** URL and credential,
despite the profile's `staging` selector. It had no Google clients or empty-data mode.
Seven preview variables were repaired: URL, project public key, three identity Google
client IDs, backend `staging`, data mode `empty`. The values came from the existing
Her Keys development environment; no Production key was copied to Staging. Preview
RevenueCat variables were retained. Development targets Staging; Production targets
Production. Neither Production environment nor credentials were changed.

Android candidate: [EAS preview build 74546d21](https://expo.dev/accounts/ams2dad/projects/her-keys/builds/74546d21-3a6e-40cc-85c7-7be292e0a45b),
source `adf740c87c653ca5999d4b35962819981dc36c74`, internal distribution, SDK 57,
`com.heykeys.app`, explicit `empty` mode. Build accepted on 2026-10-08 22:30:52 UTC.
Build **FINISHED** at 22:45:31 UTC. Build log confirms `RELEASE_IDENTITY=PASS` after
dependency installation. APK: 157,544,192 bytes,
SHA-256 `4f89697674dc24bd043d5a275217790ea4eb6aa86fca51dd810df616ed413a2a`.
ADB installation succeeded on `HerKeys_Runtime`, serial `emulator-5554`, model
`sdk_gphone16k_x86_64`, boot completed. Cold launch rendered the welcome page; tapping
Begin reached the Google/email account choice. No iPhone is available.

[Native build/runtime record](v2-closeout-20261008/android-build-runtime.json),
[launch screenshot](v2-closeout-20261008/android-launch.png),
[account screenshot](v2-closeout-20261008/android-account.png), and
[account UI tree](v2-closeout-20261008/android-account.xml) preserve the observed
installed runtime. No authenticated account or remote feature data appears in these
captures. Runtime logs report RevenueCat `InvalidCredentialsError` and emulator
`BILLING_UNAVAILABLE`; commerce remains a separate deferred gate. The account choice
is still reachable.

Do not interpret a queued/finished build as an installed runtime test, nor a browser
OAuth configuration as a successful native OAuth return. Native outcomes are updated
below when observed; designated Staging Google account sign-in is an owner dependency.
The account screen says continuing accepts Terms and Conditions. Approval or owner
sign-in was requested at this concrete action, as required by the computer-use
confirmation policy for accepting legally binding agreements. No consent/sign-in
was performed by the agent. Session persistence, logout/login, authenticated Gemini,
household isolation and F01–F13 runtime remain NOT TESTED on this candidate.

## F01–F13 runtime acceptance

For every row, acceptance requires real Staging create/edit behavior, restart/local
persistence, authenticated push/pull, offline edit/reconnect, account isolation and
the cross-feature relationships in `HK_F01_F13_INTEGRATION_MAP.md`. Local suite PASS
is shared regression evidence, not individual live certification.

| Feature | Live Staging status | Required live relationships / flow |
|---|---|---|
| F01 Today / Chief of Staff | BLOCKED | Real tasks/Needs Me/One Move state across restart and cloud restore |
| F02 Talk It Out / Life Inbox | BLOCKED | Authenticated Gemini → reviewed canonical records → Today/Calendar |
| F03 Calendar + Capacity | BLOCKED | Task/event dates, OAuth consent/refresh, offline reconnect |
| F04 Systems + Routines | BLOCKED | Shared system with owner-private steps/responsibilities and recurrence |
| F05 Kids OS | BLOCKED | Authenticated child addition and ID-based subjects across features |
| F06 Home OS | BLOCKED | Household task/visit → Today/Calendar, completion/reopen persistence |
| F07 Co-Parent Logistics | BLOCKED | Child handoff/preparation/dependencies and owner-private access |
| F08 Meals OS | BLOCKED | Slot/status edit, persistence, cloud sync and Today/task relationship |
| F09 Money OS | BLOCKED | Exact values/payment mechanism; owner isolation and due-date behavior |
| F10 Work / Career OS | BLOCKED | Opportunity/follow-up/interview → dependencies/Today/Calendar |
| F11 Me / Rebuild OS | BLOCKED | Focus/link persistence, owner-private sync and related tasks |
| F12 Life Admin / Documents | BLOCKED | Record/task/child links, cloud sync, references restored correctly |
| F13 People OS | BLOCKED | Person context/child/task links, uniqueness and owner isolation |

Fresh-device gap: repaired in application composition and regression-tested, but
**cross-device restoration is not certified** until real fresh-device adoption, first
pull, durable reload and A→B→A isolation pass against Staging. Existing unsupported
recovery copy is retained pending that proof.

## Production change log and promotion hold

**Applied Production changes: NONE.** Only catalog SELECTs, source downloads and
read-only configuration inspection. No DDL/DML, migration repair, function deployment,
JWT/auth/SMTP/template change, EAS Production edit, release/store submission or merge.
No data clone, credentials reuse across Supabase environments, reset or force push.

The concrete promotion scope currently supported by evidence is:

1. Schema DDL: **none identified**. Do not replay existing chain or rename history
   to hide version drift. Reproduce the full chain and reconcile provenance first;
   any genuinely missing object needs a separately reviewed additive SQL patch with
   populated-upgrade proof, preconditions and post-change fingerprint.
2. Functions: **no executable behavior change identified**. WeatherKit raw-byte
   comment drift is recorded; any exact-source redeployment must use the reviewed
   repository package and retain the four reviewed JWT flags. No auth weakening.
3. Email, only after Staging delivery/runtime passes: configure a separately scoped
   dedicated Her Keys Production sender through owner-entered credentials; install
   tested token-bearing Confirm signup and Magic link/OTP templates; change OTP
   length **8→6** in the same controlled promotion. Retain 3,600s expiry unless the
   tested plan explicitly revises it. Preserve existing users and sessions.
4. Identity: retain Google clients/order, native Apple audience and project-specific
   callbacks. Choose/test the canonical Her Keys web fallback origin before changing
   Site URL. Do not add/rotate credentials or remove audiences without a reviewed need.
5. EAS: Production already targets its own ref. Future release must pass build guard
   with Production URL/key and `empty`; no staging-secret reuse or automatic submit.
6. After explicit owner approval of the final manifest/settings/templates, take
   pre-change catalog/config evidence, apply only approved non-destructive changes,
   capture post-change fingerprints and controlled authenticated Production smoke
   using an owner-designated test household. Record each applied action and result.

Approval is **not requested yet** because Staging runtime and sender gates are not
green. The final exact sender/template/config manifest must be reviewable before
approval; these conditional steps do not authorize Production changes.

## Outstanding owner/environment dependencies

- Dedicated Her Keys Staging Google test account and interactive sign-in on emulator;
  a second designated account for live isolation. No password/token in chat.
- iPhone/native iOS testing availability for Google and Apple; Android cannot replace it.
- Dedicated Her Keys SMTP sender/domain configuration, separately scoped per environment,
  plus inbox access for expiry/wrong-code/resend/restart delivery tests.
- Canonical Her Keys web fallback origin for Site URL.
- Authorized Supabase CLI/MCP project scope if future DDL/deploy automation is needed:
  exact-project reads/link were denied in the configured sessions; authenticated
  dashboard access worked. Do not broaden access to unrelated projects.
- Disposable database runner availability for independent repository-chain fingerprint;
  no destructive database reset is authorized.

`STAGING_PARITY=BLOCKED`, `PRODUCTION_PARITY=FAIL`, `AUTH_RUNTIME=BLOCKED`,
`FEATURE_BACKEND=BLOCKED`, `PRODUCTION_PROMOTION=NOT_APPLIED`,
`OVERALL_PARITY=BLOCKED`. No V2/environment certification is asserted.
