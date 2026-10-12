# Build 2A — Staging / Production backend parity and security evidence (2026-10-12)

Scope: read-only inspection of Her Keys **Staging** `fhhudicklmpofuzkxeqe` and **Production** `npykvnxnehlsdlbumzwk`
(organization `qouxjbueadjitgpchwtj`, both `ACTIVE_HEALTHY`, Postgres 17.6.1.166, us-west-2). K Scan projects were not touched.
Source under test: `integration/build2a-candidate`, stacked on PR #8 head `f57aaee`.

**Nothing was changed in Production.** No migration, RLS change, Edge Function deployment, secret, SMTP, Site URL, redirect,
RevenueCat or customer-data change was made. Staging received **no persistent write**: the only write-shaped statements were the
negative controls in section 5, each designed to fail (random non-existent UUIDs behind a foreign key) plus a `ON COMMIT DROP`
temp table; row counts were re-read afterwards and unchanged (0 receipts).

Evidence is labelled **METHOD / RAW RESULT / INTERPRETATION**. Anything that could not be observed is **NOT RUN** or **BLOCKED**
with the access it needs, never inferred from a UI state, a timestamp or a function version number.

## 1. Classification summary

| # | Item | Staging | Production | Class | Basis |
|---|---|---|---|---|---|
| 1 | Application schema: 44 shared tables, 890 columns, 31 functions, 344 indexes, 830 constraints | identical | identical | **SAME** | §2 fingerprint with the welcome ledger excluded |
| 2 | RLS policies (106), table/column/function grants, triggers (234) | identical | identical | **SAME** | §2 |
| 3 | `herkeys_welcome_email_receipts` table, `herkeys_claim_welcome_email()` function, migration `herkeys_welcome_email_receipts`, Edge Function `herkeys-welcome-email` | absent | present | **INTENTIONAL** | Production-only welcome delivery; documented in the migration header, `HK_V2_PRODUCTION_EMAIL_INTEGRATION.md` and the `V2-EMAIL-PASSWORD` boundary lane |
| 4 | Migration ledger **version stamps and order** | 14 entries; first five carry the repository versions | 15 entries; none carry repository versions; `build4_baseline` is recorded *after* `build4_cloud_schema` | **DRIFT (history only)** | Names match the repository chain exactly (Staging lacks only #3). No functional effect: §2 proves equal schema. Do not rewrite either ledger |
| 5 | Edge Functions `weather-context`, `calendar-oauth`, `calendar-data`, `herkeys-ai` | same bundle hash, same `verify_jwt` | same | **SAME** | §3. Function *version numbers* differ (e.g. `herkeys-ai` v3 vs v4) and are **not** authority |
| 6 | Public Auth settings (providers, signups, confirm-email, anonymous) | identical | identical | **SAME** | §4 |
| 7 | Security advisors | INFO: RLS-no-policy on 2 tables; WARN lints: definer RPCs (2 functions), leaked-password protection off | INFO: RLS-no-policy on 3 tables; the same two WARN lints | **SAME + INTENTIONAL** | the extra INFO table is the service-role-only welcome ledger (#3); the other two are the Calendar OAuth tables on both |
| 8 | Consent ledger `account_consents` structure and privileges | identical | identical | **SAME** | §2, §5 |
| 9 | Email OTP length | 6 (per 2026-10-08 record) | 8 (per 2026-10-08 record) | **DRIFT (unverified today)** | dashboard-only; see §6 and the P0 note below |
| 10 | Site URL, redirect allow-list, SMTP, email templates, Apple/Google client-ID lists, secret names | not readable | not readable | **BLOCKED** | needs a signed-in dashboard session (§6) |
| 11 | `HER_KEYS_AI_REQUIRE_CONSENT` (server AI refusal switch) | unknown | unknown | **BLOCKED / NOT RUN** | secret/flag state is not readable; a direct refusal test needs a user credential (§7) |
| 12 | `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED` (welcome delivery switch) | n/a | **off** (observed) | **expected** | §5 probe returned `503 {"status":"disabled"}`; 0 welcome receipts |

**No item is classed AUTHORITATIVE or STALE.** Function version numbers and timestamps were deliberately not used to infer authority.

**P0 note (item 9).** The app's one-time-code field and the recovery flow are six digits. The 2026-10-08 closeout recorded Production's
OTP length as **8**. If that is still true, a Production password-recovery code cannot be typed into the six-digit field. This could
not be re-read today (dashboard sign-in required). It is the first thing to verify before any Production recovery test.

## 2. Schema, policy and grant parity — METHOD / RAW / INTERPRETATION

**METHOD.** The same read-only catalog query on both projects (Supabase MCP `execute_sql`; `pg_class`, `information_schema`,
`pg_policies`, `pg_proc`, `pg_indexes`, `pg_constraint`; each class reduced to a count and an md5 of an ordered, canonical string).

**RAW (as run, before exclusion).**

| Class | Staging n / md5 | Production n / md5 |
|---|---|---|
| tables | 44 / `904bb819…` | 45 / `5a6b9d86…` |
| columns | 890 / `c1f5a31b…` | 897 / `ea2e8d56…` |
| constraints | 830 / `be15407d…` | 835 / `3b2d1dc1…` |
| functions (`public`,`private`) | 31 / `de4bfbf4…` | 32 / `a85344ce…` |
| indexes | 344 / `a2708e89…` | 345 / `c993a546…` |
| policies | 106 / `f92f3080…` | 106 / `f92f3080…` |
| table grants (anon/authenticated/PUBLIC) | 45 / `0e6e1cec…` | 45 / `0e6e1cec…` |
| column grants | 1776 / `35e05f99…` | 1776 / `35e05f99…` |
| function grants | 9 / `a01108c4…` | 9 / `a01108c4…` |
| triggers | 234 / `a3563bd4…` | 234 / `a3563bd4…` |

**RAW (re-run excluding `herkeys_welcome_email_receipts` and `herkeys_claim_welcome_email`).** tables 44 / `904bb819…`, columns 890 /
`c1f5a31b…`, constraints 830 / `be15407d…`, functions 31 / `de4bfbf4…`, indexes 344 / `a2708e89…` — **identical on both projects**.

**INTERPRETATION.** The only structural difference is the Production-only welcome ledger (+1 table, +7 columns, +5 constraints, +1
index, +1 function), which is intentional. Policies, grants and triggers match even without exclusion (the ledger has RLS and no
client grants). This is a catalog comparison, **not** the repository's canonical fingerprint tool and **not** a replay of the
migration chain.

**`account_consents` (both projects, identical).** Columns `id, account_id, consent_type, policy_version, granted, recorded_at`;
RLS enabled **and forced**; policies `account_consents_select_own` (SELECT, `authenticated`) and `account_consents_insert_own`
(INSERT, `authenticated`); `authenticated` has column-level INSERT on `account_id, consent_type, granted, policy_version` only and
SELECT; `anon` and `PUBLIC` have nothing; no UPDATE/DELETE grant to any client role; no triggers. `service_role` has full table
rights, as expected for the server-side Edge Function.

## 3. Edge Functions — METHOD / RAW / INTERPRETATION

**METHOD.** `list_edge_functions` on both projects; `get_edge_function` for Production `herkeys-ai`.

| Function | Staging (version, JWT, bundle sha256) | Production (version, JWT, bundle sha256) |
|---|---|---|
| `weather-context` | v3, true, `0c89c034…` | v4, true, `0c89c034…` |
| `calendar-oauth` | v2, **false**, `91907303…` | v3, **false**, `91907303…` |
| `calendar-data` | v2, true, `0dd36b9c…` | v3, true, `0dd36b9c…` |
| `herkeys-ai` | v3, true, `1e43c8c9…` | v4, true, `1e43c8c9…` |
| `herkeys-welcome-email` | — | v2, true, `cac0f222…` |

**INTERPRETATION.** The four shared functions have identical bundles and JWT settings; `calendar-oauth` is public by design (an OAuth
redirect target, matching `supabase/config.toml`). The deployed Production `herkeys-ai` source contains the consent guard as written
in the repository (`HER_KEYS_AI_REQUIRE_CONSENT === 'true'` → read the caller's newest `ai_processing` receipt with the service role →
refuse with `403 ai_processing_consent_required` unless it is the current version and `granted === true`). **Not done:** a byte-level
comparison of deployed source against the repository for `herkeys-ai` v3/v4 and `herkeys-welcome-email` v2 (the tool returns source as
text; I could not hash it independently). The 2026-10-08 closeout did compare earlier versions byte-for-byte.

## 4. Public Auth settings — METHOD / RAW / INTERPRETATION

**METHOD.** `GET /auth/v1/settings` on each project with its own publishable key (public by design).

**RAW.** Identical on both: `disable_signup=false`, `mailer_autoconfirm=false` (email confirmation **required**),
`phone_autoconfirm=false`, `external.email=true`, `google=true`, `apple=true`, `anonymous_users=false`, `phone=false`, every other
provider false, `saml_enabled=false`, `passkeys_enabled=false`.

**INTERPRETATION.** Anonymous sign-ins are off in both (an earlier session turned them off on Staging). Confirm-email is on in both,
so a password sign-up that returns no session must show the "confirmation required" state — which the client does and tests.

## 5. Negative controls actually executed

| # | Control | Method | Raw result | Verdict |
|---|---|---|---|---|
| N1 | `anon` reads the consent ledger | Staging, `SET LOCAL ROLE anon` | `42501 permission denied for table account_consents` | PASS |
| N2 | `anon` inserts a receipt | same | `42501 permission denied` | PASS |
| N3 | An `authenticated` user (random uid) reads receipts | Staging, simulated claims | 0 rows visible | PASS (ledger is empty, so **isolation of real rows is shown by policy text only**) |
| N4 | Insert a receipt for **another** account | same | `42501 new row violates row-level security policy` | PASS |
| N5 | Insert for **own** id (user does not exist) | same | `23503` foreign-key violation, i.e. RLS admitted it and only the FK stopped it | PASS |
| N6 | Client supplies `recorded_at` | same | `42501 permission denied` (column not granted) | PASS — no client-controlled receipt time |
| N7 | Client supplies `id` | same | `42501 permission denied` | PASS |
| N8 | UPDATE a receipt | same | `42501 permission denied` | PASS — append-only |
| N9 | DELETE a receipt | same | `42501 permission denied` | PASS — append-only |
| N10 | Invalid `consent_type` | same | `23514 check violation` | PASS |
| N11 | Empty `policy_version` | same | `23514 check violation` | PASS |
| N12 | `herkeys-ai`, no token / garbage / anon-role JWT | HTTP POST, both projects | `401` ×3 per project (gateway or function) | PASS |
| N13 | `herkeys-welcome-email`, no token / garbage | HTTP POST, Production | `401` ×2 | PASS |
| N14 | `herkeys-welcome-email`, anon-role JWT | HTTP POST, Production | `503 {"status":"disabled"}` | Observed: welcome delivery is **not switched on** |

Production consent data (counts and the authorized identity only): **4 receipts, all for `4efe7570-8ed0-4408-93ad-cc76cb5444aa`, none
for anyone else.** Recorded 2026-10-09 16:15:04 UTC with distinct microsecond server timestamps: `terms`, `privacy`, `age18` granted at
the current versions, and `ai_processing` **`granted=false`** at `ai-data-processing-initial-v1`. That is a current declined
AI choice with the other three accepted, which is the exact shape needed for the server-refusal test below.

## 6. What could not be inspected (BLOCKED) and the access needed

The built-in browser was **not signed in** to supabase.com (sign-in page); no credentials were entered. Dashboard-only items are
therefore unverified by this pass. The last recorded observation (2026-10-08, another agent; **not independent**) was: redirect
allow-list contains `herkeys://auth/callback`; Site URL `http://localhost:3000`; custom SMTP off and link-only default templates;
email OTP length Staging 6 / Production 8; Apple client IDs Staging `com.herkeys.app`, Production also `com.herkeys.app.auth`. Later
handoffs (2026-10-09) describe SMTP/template/redirect work as still to be done.

Access needed: a signed-in Supabase dashboard session (read) for Site URL, redirect allow-list, SMTP, templates, OTP length and
expiry, password policy, provider client-ID lists, and Edge-Function **secret names**.

## 7. Server-side AI consent refusal — **NOT RUN**

The enforcement exists in code and in the deployed Production function, but it is conditional on the function environment variable
`HER_KEYS_AI_REQUIRE_CONSENT === 'true'`, whose state cannot be read from here, and its refusal cannot be observed without a signed-in
user. A disabled UI button proves nothing about it, and no log evidence exists: a validated Production log query for the 24 hours before this pass's own probes returned no `/functions/v1/` requests at all (that account's receipts date from 2026-10-09, which is outside the 24-hour log window, so nothing about any earlier call can be seen).

To run it: a short-lived access token for `4efe7570-…` (Production) — or a Staging account that has recorded `ai_processing=false` —
then `POST /functions/v1/herkeys-ai` with a valid minimal body and check for `403 ai_processing_consent_required` **and** no
`[herkeys-ai]` provider log line (i.e. Gemini not called); repeat with a granted receipt to confirm it proceeds; also confirm the secret
**name and flag** are present without printing the value.

## 8. Findings

| ID | Sev | Finding |
|---|---|---|
| B2A-BE-01 | P1 | Server AI refusal is opt-in (`HER_KEYS_AI_REQUIRE_CONSENT`) and unverified in both environments. Until it is set and tested, a declined account can call `herkeys-ai` directly. |
| B2A-BE-02 | P1 | Production OTP length recorded as 8 vs a six-digit app field and recovery flow (unverified today). |
| B2A-BE-03 | P2 | Leaked-password protection is **disabled** in both projects (advisor `auth_leaked_password_protection`) while email/password signup now exists. Client enforces only 8 characters; the server-side minimum is unread. May be plan-gated (the org was on the free plan on 2026-10-05). |
| B2A-BE-04 | P2 | The server hard-codes the AI policy version string; it is now pinned to the client constant by `tests/productionConsentBuildProfile.test.mjs` (added in Build 2A). A future bump still needs a coordinated redeploy. |
| B2A-BE-05 | P2 | After a password reset, the recovery client ends only its **own** (local) session (`signOut({scope:'local'})`). Whether Supabase revokes the user's other sessions on a password change was not observed; if not, a stolen session survives a reset. Needs a live A/B test. |
| B2A-BE-06 | P3 | No replayable SQL behavior test for `account_consents` RLS or the welcome claim exists in `supabase/tests/`; the repository only registers the migrations and asserts migration text. The controls in §5 are a one-off. |
| B2A-BE-07 | info | `bootstrap_account` and `claim_local_household` are `SECURITY DEFINER` and executable by `authenticated` (advisor WARN, both projects, identical): intended, they are the account-scoped claim RPCs. |
| B2A-BE-08 | info | Welcome delivery is off in Production (0 receipts, `disabled`). A `sent` row is never re-claimable by the atomic claim function; duplicate delivery was reviewed statically, **not exercised** (no Docker, and Staging has no ledger). |

## 9. Proposed Production changes (none made — each needs separate, named owner approval)

The exact per-item proposals (change, risk, what to capture before, verification evidence, rollback, access) are in
[`HK_BUILD2A_PRODUCTION_CHANGE_PROPOSALS.md`](HK_BUILD2A_PRODUCTION_CHANGE_PROPOSALS.md). The table below is the summary and the proposals document governs if they ever differ.

| # | Exact change | Reason | Risk | Verification | Rollback |
|---|---|---|---|---|---|
| P-1 | Set Edge secret `HER_KEYS_AI_REQUIRE_CONSENT=true` on Production `herkeys-ai` (and Staging first) | B2A-BE-01: make declined AI choices binding on the server | Accounts with no current receipt get `403`; the client already treats that as "AI unavailable". Gate must be on in the build or users see AI fail closed | Direct call as `4efe7570-…` returns `403` and no Gemini log line; a granted account proceeds | Unset or set to anything but `true`; no redeploy needed |
| P-2 | Production Auth: verify email OTP length is 6; if 8, set 6 | B2A-BE-02 | Changes all email codes; existing unexpired codes keep their length | Request a recovery code to the controlled mailbox and read its length | Set back to 8 |
| P-3 | Production Auth: custom SMTP sender, branded templates, redirect/Site URL, per `HK_V2_SMOKE_P0_P1_CLOSEOUT_20261009.md` P0-A and P1-A | Confirmation and recovery email cannot be delivered or rendered correctly otherwise | Wrong redirect breaks confirmation links; wrong sender bounces | Real signup and recovery email to the controlled mailbox; inspect From and the link | Restore previous SMTP/URL/template values (record them first) |
| P-4 | Production: set `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true` **after** P-3 | Activate the one-time welcome email | A misconfigured sender emails real users | One receipt row, exactly one email, to the authorized mailbox | Unset the switch |
| P-5 | Enable leaked-password protection and a server minimum password length (if the plan allows) | B2A-BE-03 | Existing weak passwords are unaffected until change | Auth settings read-back | Disable |

## 10. NOT RUN in this pass

| Item | Why | Needs |
|---|---|---|
| Repository migration chain **replay** and the 1,592-check SQL harness (`supabase/tests/run.mjs`) | Docker Desktop's Linux engine is not running (`dockerDesktopLinuxEngine` pipe missing); the shared container also serves other sessions | Docker running and no concurrent harness runs; owner go-ahead to start it |
| Direct server AI refusal (§7) | no credential for a declined account | token for `4efe7570-…` or a Staging account |
| Cross-account RLS on household data, A→B→A sync, second device | needs two real authenticated accounts | two designated Staging accounts |
| Provider transitions (email → Google, Apple private relay), existing/non-existent email response parity, reset-vs-sessions | needs live accounts and a controlled mailbox | designated Staging accounts and mailbox |
| Dashboard-only configuration (§6) | not signed in | dashboard session |
