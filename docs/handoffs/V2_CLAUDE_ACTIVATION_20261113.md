# Her Keys V2 — application activation and integration ledger (Claude workstream)

Status: SOURCE REPAIRS COMPLETE AND VERIFIED, INCLUDING THE MANAGEMENT-AUTHORIZED CAL-03 ACCOUNT-BINDING REPAIR; HOSTED DEPLOYMENT AND READBACK BLOCKED (connector). This is a workstream checkpoint, not a shared-system certification.

Continuation pass (management directive "complete Claude integration workstream"): CAL-03 repaired with an authenticated completion handle (§3); read-only live HTTP probes of the deployed functions (§4); Talk It Out promotion packet validated at source level with exact hashes (§5); joint candidate with Codex PR #51 trial-merged and fully regressed (§7). Final verdicts are in §12.

- Repository `herkeys/her-keys`; base `integration/v2-autonomous-upgrade-20261112` at verified `4f17b917ce8c30c6890c9b2819c191636208d6d6` (PR #50 merge).
- Branch `claude/v2-activation-integration-20261113`, isolated worktree `C:/Users/jsmit/Her-Keys-V2ACT`. Codex works in `Her-Keys-RevenueCat-V2` / `Her-Keys-Codex-V2`; neither was touched. The original `C:/Users/jsmit/Her Keys` checkout and its unrelated edits were preserved.
- Ownership respected: no file under `src/monetization/**`, no RevenueCat function, no `supabase/functions/_shared/premium/**`, no RevenueCat/store/paywall/billing configuration was modified. No RLS policy, grant, secret, app identifier, SDK version or package changed. One additive, service-only migration (CAL-03, §3), not applied anywhere. No EAS build, IPA or AAB.
- Read before editing: continuation, backend deployment, execution, account-isolation, recovery and RevenueCat ledgers; the Sonnet handoff. The repairs use no new Expo API (expo-web-browser calls are unchanged), so no SDK 57 surface changed.

## Evidence classes used below

`PASS(src)`: executable source tests (node:test, react-test-renderer, shipping Deno handlers run in a VM). Proves contracts and wiring, not pixels or native behavior.
`PASS(live, <who/date>)`: hosted evidence recorded in the named ledger; not re-run here unless stated.
`BLOCKED(connector)`: this session's Supabase MCP connector was never authorized (OAuth link issued, not completed), so no hosted project, function, secret name or database could be read.
`NOT_RUN`: no device, emulator or simulator was used in this workstream.
`CODEX`: depends on RevenueCat entitlement or commercial state owned by Codex.

## 1. Feature implementation / activation matrix

Baseline full suite at the starting SHA: 5,604 / 5,604 pass, 0 fail, 0 skipped (local, serial). Reachability was checked from the routing table (`src/domain/routeAccess.ts`, `app/_layout.tsx`) and the Today composition; an import-graph scan of `src/` and `app/` found no unreachable feature module (only type/barrel files and two side-effect entry modules are unreferenced by name).

| Feature | Implemented | Enabled | User facing (entry point) | Backend integrated | Functional | Persistent | Secure | Staging | Production |
|---|---|---|---|---|---|---|---|---|---|
| Welcome + authentication | Yes | All EAS profiles | `index` entry guard (welcome tree); Your Account modal | Supabase Auth (email/password, OTP, Apple, Google) | PASS(src) | Session restore PASS(live, Codex 11-13) | Route guards fail closed; enumeration-safe recovery | Restore/renew PASS(live); recovery FAIL (default link template, P1, external) | Numeric recovery, password change, login, replay/expiry refusal PASS(live, PR #49); Apple/Google sign-in NOT_RUN |
| Onboarding + operating profile | Yes | Yes | `onboarding/*`, step-guarded | Local state + sync | PASS(src) incl. "I'm not sure yet" (no invented goal/struggle/fact) | PASS(src) restart | Account-held household only | NOT_RUN device | NOT_RUN device |
| Today | Yes | Yes | Tab 1 | Local projection | PASS(src) | PASS(src) | Renders only account-held data | NOT_RUN device | NOT_RUN device |
| Daily Load (Free) | Yes | Yes | Today `decision` section + Calendar | Local | PASS(src) | PASS(src) | n/a (local) | NOT_RUN | NOT_RUN |
| Daily Load Premium review | Yes | Server manifest: released both envs (Codex observation) | Beneath Free Daily Load when tier ≠ open | premium-gate / ledger | PASS(src) incl. locked states | Receipts PASS(src) | Server-authorized | CODEX (no entitlement path while checkout OFF) | CODEX |
| One Move | Yes | Yes | Today `oneMove` | Local | PASS(src) incl. overload withdrawal, commitments kept | PASS(src) restart | n/a | NOT_RUN | NOT_RUN |
| Talk It Out | Yes | Yes | AI tab, `/talk-it-out` modal, onboarding step | `herkeys-ai` (JWT + server consent) | PASS(src) | Conversation local | Current affirmative consent on client AND server; account-pinned bearer | v22 PASS(live, Codex): 403 before/after consent, schema-valid turns, uncertainty | v13 consent gate PASS(live); uncertainty repair NOT deployed (pending approval, §5) |
| Smart Inbox — capture/Life Inbox (Free) | Yes | Yes | Talk It Out + Life → Life Inbox | Local reader | PASS(src) epoch-fenced writes | PASS(src) | ISO-01 fences | NOT_RUN | NOT_RUN |
| Smart Inbox — Premium extraction | Yes | Released both envs (Codex observation) | Transparent upgrade of capture reading; no Free discovery surface (V2UP-C-P3a, open) | `smart-inbox-extract` | PASS(src) incl. client cancellation | n/a (proposals reviewed before save) | Server entitlement + consent + quota | CODEX | CODEX |
| Momentum weekly review | Yes | Released both envs (Codex observation) | Today card when manifest released or saved reviews exist | premium ledger | PASS(src) household-fenced late answers | Saved reviews PASS(src) | Server-authorized | CODEX | CODEX |
| Calendar (Her Keys) | Yes | Yes | Tab 3, event editor | Local | PASS(src) | PASS(src) | n/a | NOT_RUN | NOT_RUN |
| Google Calendar (read-only) | Yes | **Configured and live in both environments** (probe §4: callback passes the provider-configuration check) | Calendar panel | `calendar-oauth`, `calendar-data` | PASS(src) after CAL-01/02/03/04 repairs | Server row (encrypted refresh token) | Read-only scopes; caller-scoped. Deployed version still has CAL-03 (P2 live exposure) until the repair ships | Deployed: JWT refusal PASS(live probe); repairs not deployed | Deployed: JWT refusal PASS(live probe); repairs not deployed |
| Weather | Yes | Account-bound + device permission | Today card | `weather-context` (JWT) | PASS(src) sequence-fenced | Transient by design | Coordinates never stored | BLOCKED(connector) for secrets | BLOCKED(connector) |
| Household records (Life areas, Systems) | Yes | Yes | Life tab hub, Systems tab | Local + sync | PASS(src) | PASS(src) | Staging policy probe 16/16 PASS(live, Codex) | Partial (database layer only) | Isolation probe NOT_RUN |
| Tasks + reminders | Yes | Yes | Task editor, Life lists, local notifications | Local + OS notifications | PASS(src) | PASS(src) | n/a | NOT_RUN device | NOT_RUN device |
| AI consent | Yes | Gate flag true in every profile | Mandatory consent gate; Your Account AI choice | `account_consents` ledger | PASS(src) | Server receipts | Fail closed | Grant/revoke PASS(live, Codex) | Source-verified gate; live grant/revoke NOT_RUN |
| Privacy, settings, permissions | Yes | Yes | Your Account status section; mandatory consent gate | OS settings, legal PDFs | PASS(src) (consent legal-link failure repaired, CONSENT-01) | OS-owned | Status reads never prompt | NOT_RUN | NOT_RUN |
| Offline persistence + sync | Yes | Yes | Persistence/Sync notices | Sync runtime | PASS(src) | PASS(src) | Namespace per account | NOT_RUN device | NOT_RUN device |
| Premium presentation / locked state | Yes | Premium enabled; checkout OFF both envs | Your Account → Premium home; feature cards | premium-gate (read) | PASS(src) locked/unavailable copy | n/a | Entitlement never trusted from client | CODEX | CODEX |

No implemented feature was found invisible because of a broken route or a missing mount. Google Calendar is configured and live in both environments (§4 probe). Weather goes dormant without its WeatherKit secrets, and those could not be checked. One carried product gap remains (V2UP-C-P3a, no Free discovery of Smart Inbox).

## 2. Functional journeys and evidence

Google Calendar account binding (`tests/claude.v2act.calendarOAuthBinding.test.mjs`, 14 tests, against a simulated Google enforcing PKCE S256, the registered redirect URI and single-use codes):

- The attack (attacker starts consent, victim finishes it). The PREVIOUS handler (807de59) stores the victim's refresh token on the attacker's account; the vulnerability is demonstrated in-suite. The repaired handler stores nothing and exchanges nothing at the callback. The victim's own app redeeming as the victim is refused (`account_mismatch`) and burns the handle, so the attacker later holding the handle gets `invalid_completion`.
- Legitimate flow, reconnect retaining earlier calendar choices, unchanged PKCE and read-only scopes.
- No authorization code, PKCE verifier or Google token in any redirect or JSON response. The pending authorization is stored only as a SHA-256 of a 256-bit handle plus a sealed code.
- Replay of a handle and of a Google callback; concurrent redemption (exactly one succeeds); expired handle (5 min) and expired state (10 min); restarting consent discards an earlier authorization; another account redeeming; cancellation, missing/forged state, never-issued and malformed handles; missing or restricted Her Keys session at redemption; a restricted account at the callback; a failed Google exchange (nothing stored, handle not retryable).

Client side (added to `tests/claude.v2act.calendarConnection.test.mjs`, now 24 tests): the handle parser accepts only the exact app return with `status=authorized`, including the trailing-slash form the deployed callback actually emits, and rejects duplicates, foreign URLs and router path forms. Connect redeems as the same account only. An account change while Google consent is open, a cancel, a dismissal or an error return redeems nothing. A refused redemption shows an error, never "connected".

Earlier in this workstream (same file, first 19 tests):

- Google Calendar disconnect in `connected`, `reauth_required` and `revoked` states removes the caller's row; revocation or decryption failure never keeps it; no connection → idempotent success; another account's row is untouched; a failed delete is reported as failure; unauthenticated → 401 before storage.
- OAuth callback for a restricted account returns to the app (`herkeys://calendar-connected?status=error&detail=account_restricted`) and stores nothing.
- Bridge: a slow answer for the previous day never replaces the new day; a day change clears old events at once; a disconnect supersedes an in-flight load; a different account reloads and drops the previous account's calendars; signed-out → dormant with zero provider calls.
- Panel: re-authorization state offers Reconnect and a confirmed Disconnect; failure is announced; a never-connected account sees Connect only.

Before/after proof: against the unrepaired files, 14 of the 19 fail and the 5 negative controls pass; after the repair, all 19 pass.

Reviewed and found sound (no change): Weather (sequence-fenced), Momentum and Daily Load Premium hooks (household-fenced), Talk It Out client (session-pinned bearer, abort-aware, server consent recheck), herkeys-ai uncertainty path (after JWT, consent and validation; output guards reused).

Not repeated (already evidenced, no new reason): Production numeric recovery (PR #49), Staging AI consent grant/revoke and uncertainty probes, Staging 16-assertion policy probe (PR #50).

## 3. Authentication and account isolation

- Source: the repaired calendar bridge now keys every answer to (account, day, action generation). This closes the last provider-backed Today/Calendar surface not fenced against late answers; Weather, Talk It Out, Smart Inbox, Momentum and Daily Load were already fenced.
- Server: `calendar-data` deletion now filters by `id` AND `user_id`.
- Hosted invalid-session refusal: PASS(live probe, 2026-11-13). The deployed `calendar-data`, `calendar-oauth`, `weather-context` and `herkeys-ai` answer 401 to a missing and to a garbage bearer token in both Staging and Production (§4). Cross-account requests with real sessions and Production database isolation: BLOCKED(connector). Device account switching and offline transitions: NOT_RUN.

### HK-V2ACT-CAL-03 — Google Calendar account-linking CSRF (P2, security): REPAIRED IN SOURCE (management-authorized)

Vulnerability: the OAuth callback is opened by Google in a browser with no Her Keys session. It exchanged the code and stored the refresh token on the account that STARTED the attempt. An attacker could start a connection, get a victim to finish Google consent on that URL, and receive the victim's read-only calendar. The deployed functions in BOTH environments still behave this way, and Calendar is configured in both (§4), so this exposure is live until the repair ships. It requires social engineering and an explicit Google consent screen.

Repair:
1. `begin` is unchanged: random state, PKCE S256 verifier, 10-minute expiry, one outstanding attempt per account.
2. The callback validates the state (format, existence, unused, unexpired, account active). It then records the authorization: Google's code is sealed with the server key and stored on that same state row under SHA-256(handle), where the handle is a fresh 256-bit random value valid for 5 minutes. A conditional update guarantees one callback per state. It redirects to `herkeys://calendar-connected?status=authorized&handle=…`. No Google call is made and nothing is stored on any account.
3. `POST {action:'complete', handle}` requires a valid Her Keys JWT. It deletes the pending row atomically FIRST (single use for every outcome), then requires the JWT subject to equal the initiating `user_id` and the handle to be unexpired. Only then does it exchange the code with PKCE and store the connection on that account.
4. The app redeems only the exact Calendar return and only if the account on screen is still the one that started consent. It never receives the code, the verifier or any Google token.

Storage: one additive migration `20261113191332_calendar_oauth_authenticated_completion.sql`, which adds four nullable columns, a shape CHECK and a partial unique index on the service-only `calendar_oauth_states`. It has fail-closed asserts (no anon/authenticated access, no policy). Account deletion already deletes and guards this table by `user_id`. NOT applied anywhere.

Residual risk, stated honestly: the handle travels in a custom-scheme redirect. A malicious app on the VICTIM's device that claims `herkeys://` could intercept it and pass it to the attacker, who started the attempt and could therefore redeem it. Closing that needs verified App Links / Universal Links for the return, which is a platform change outside this repair. Without such interception, the victim's own Her Keys app (or none) receives the handle and the attack fails.

Deployment constraint: old app builds do not redeem handles, so against the repaired server they cannot complete a NEW connection (existing connections keep working). Staging must be verified with a matching development build and a real Google account first. Production waits for native Google verification, per directive.

## 4. Staging / Production parity (non-RevenueCat functions)

Deployed version numbers, bundle hashes, secrets and migrations could NOT be read: the Supabase MCP connector was offered for authorization twice (once per pass) and not completed, and the only local CLI identity belongs to another organization and was not used. Version and hash values below come from the cited ledgers and were not re-read.

Live, read-only HTTP probes (2026-11-13, this pass; no write, no setting change):

| Probe | Staging fhhudicklmpofuzkxeqe | Production npykvnxnehlsdlbumzwk |
|---|---|---|
| POST calendar-data / calendar-oauth / weather-context / herkeys-ai, no Authorization | 401 ×4 | 401 ×4 |
| Same four, `Authorization: Bearer not-a-valid-jwt` | 401 ×4 | 401 ×4 |
| GET calendar-oauth callback, forged code + unknown state | 302 → `herkeys://calendar-connected/?status=error&detail=invalid_state` | identical |

Reading of the callback probe: `invalid_state` (not `not_configured`) proves both environments hold the three Calendar provider secrets and run code that validates state and fails back to the app. It also shows the deployed callback emits the trailing-slash return form, which the repaired parser now explicitly accepts and tests.

| Function | JWT (config.toml) | Staging | Production | Known intentional difference | Source state on this branch |
|---|---|---|---|---|---|
| herkeys-ai | true (+ in-code) | v22 `3d2181e4…43ee3f0`, uncertainty repair (Codex 11-13); JWT refusal PASS(live probe) | v13 `5f0c8dee…48821ea`, Zod-only patch (Codex 11-13); JWT refusal PASS(live probe) | Uncertainty repair pending authorized promotion | Unchanged; equals v22 source |
| calendar-data | true | version not re-read; configured; JWT refusal PASS(live probe) | same | none recorded | CHANGED (CAL-02); not deployed |
| calendar-oauth | false (validates state in code) | version not re-read; configured; callback fails back to app PASS(live probe) | same | none recorded | CHANGED (CAL-03, CAL-04); not deployed; needs the CAL-03 migration first |
| weather-context | true | version and secrets not re-read; JWT refusal PASS(live probe) | same | none recorded | Unchanged |
| herkeys-welcome-email | true (default) | absent | present, send flag historically off | Production-only by design | Unchanged |
| smart-inbox-extract | true | Codex/Premium lane | Codex/Premium lane | — | Unchanged (not owned) |
| Deletion functions | mixed | disabled/dry-run (Codex 11-13) | disabled/dry-run | Excluded from this scope | Unchanged |

Required secret NAMES (values never read): calendar — `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`, optional `HERKEYS_CALENDAR_APP_REDIRECT_URI`; weather — `WEATHERKIT_TEAM_ID`, `WEATHERKIT_SERVICE_ID`, `WEATHERKIT_KEY_ID`, `WEATHERKIT_PRIVATE_KEY_P8`; AI — `GEMINI_API_KEY`, optional `GEMINI_MODEL`. Migrations: one new additive migration on this branch (CAL-03), applied nowhere. RLS: unchanged.

LF-normalized SHA-256 of deployable sources, for comparison against the bundles a deployer retrieves:

| File | Production source (0a93e9c) | Staging/current source (489cafc = this branch) |
|---|---|---|
| `herkeys-ai/index.ts` | `9e4a3acfd9d3267d53ae4456184be85ae5ecd210bcc20cfddc1a25df497b34df` | `989aedb6cb9755dfdc1c7de438da12a91703cf01e52d174ec76a3b79fecc9706` |
| `_shared/http.ts` | `58f66be6e4f4056ae0637d4abcb71418bf063cd9ce3b5a26789edbbc2162576a` | identical |
| `_shared/supabaseAdmin.ts` | `a985c9ee345c41c92ef0014b06e744ec659db43f63e79d08d09a4a61bb83ef96` | identical |

| File | Base 4f17b91 | This branch |
|---|---|---|
| `calendar-data/index.ts` | `a5479fa1c7128ddf036e2904bb950f6143043453d2216da22bdd7fff2345cc53` (matches the last recorded deployed-source parity entry) | `b569e401627dd0d1246116278a215a8aa6b52d0e276cbc9e03d9ac79f3631cf1` |
| `calendar-oauth/index.ts` | `d1292f9a8d3e3e531d824649b1196c18644c51d9e3d1bac6d98d641538122ad0` | `69fe5b843bbbc7abe16ebc1dc61d8b0eb379ccd0415dfd85a7de1d8666f532af` |

## 5. Backend promotions and pending approvals

| Item | Source | Target | Status |
|---|---|---|---|
| herkeys-ai uncertainty repair | `supabase/functions/herkeys-ai/index.ts` at 489cafc (= this branch), +42/−2 vs Production's 0a93e9c. Shared `_shared/http.ts`, `_shared/supabaseAdmin.ts` and `deno.json` are unchanged since 0a93e9c (hashes above). Source-level validation PASS this pass: the ONLY difference between the Production and Staging sources is this file. The deterministic reply runs after JWT, current affirmative consent, provider configuration and request validation, and reuses the output guards. | Production v13 → v14 | PACKET VALIDATED AT SOURCE; DEPLOYED-BUNDLE CHECK BLOCKED(connector); AWAITING SPECIFIC OWNER AUTHORIZATION. Steps: (1) read Staging v22 and Production v13 bundles and confirm the file hashes above; (2) deploy the three files to Production with verify_jwt=true; (3) read back and compare; (4) repeat the 401 probes (baseline PASS today) and the 403-before-consent probe; (5) one schema-valid uncertainty turn on the marked Production synthetic account, with AI consent granted then restored to its prior value. Rollback: redeploy the three 0a93e9c files (= v13, keeps Zod 4.6.7). No data change either way. |
| calendar-data CAL-02 | this branch | Staging first, then Production | NOT DEPLOYED, BLOCKED(connector). Verify on Staging: disconnect of a `reauth_required` synthetic row; idempotent second disconnect; another account's row untouched; 401 unauthenticated. Rollback: source at 4f17b91 (hash above). Independent of CAL-03; may ship before it. |
| CAL-03 migration + calendar-oauth (CAL-03, CAL-04) + matching app build | this branch | Staging only, after the migration | NOT DEPLOYED, BLOCKED(connector). Order: apply the migration to Staging, read back the columns/asserts, then deploy `calendar-oauth`. Verify with a development build and a real Google account: connect, callback → handle → redemption, replay refused, wrong-account refused, cancel, reconnect, disconnect. Production only after that AND native Google verification, together with an app build that redeems handles. Rollback: redeploy the 4f17b91 `calendar-oauth`. The additive columns may remain (nullable, unused by the old code). |

No hosted change of any kind was made in this workstream.

## 6. Defect ledger

| ID | Sev | Area | Cause | Status |
|---|---|---|---|---|
| HK-V2ACT-CAL-01 | P2 | Calendar bridge | Provider answers applied without checking currency: a late answer for the previous day overwrote the new day's Google events; an in-flight load could reinstate calendars after a disconnect; the hook reloaded on account *kind*, not identity | REPAIRED in source + regression |
| HK-V2ACT-CAL-02 | P2 (privacy) | calendar-data + panel | Server refused `disconnect` unless status was `connected`, and the panel offered no Disconnect in `reauth_required`, so a lapsed connection's encrypted refresh token could not be removed without reconnecting; delete was unscoped by user and its error ignored | REPAIRED in source + regression; deployment pending |
| HK-V2ACT-CAL-04 | P3 | calendar-oauth | A restricted account's callback returned bare JSON 401 inside the auth browser instead of the app redirect | REPAIRED in source + regression; deployment pending |
| HK-V2ACT-CAL-03 | P2 (security) | calendar-oauth | Account-linking CSRF (see §3); live in both deployed environments | REPAIRED IN SOURCE (management-authorized) + adversarial regression; the previous handler is demonstrated vulnerable in-suite; 11/14 fail on it. Deployment pending: migration + Staging + native Google |
| HK-V2ACT-CONSENT-01 | P3 | Consent gate | Mandatory-consent "Read Terms/Privacy" buttons dropped an `openURL` failure (no notice, unhandled rejection), while Welcome and Your Account already report it | REPAIRED in source + regression (`tests/claude.v2act.consentLegalLinks.test.mjs`, 4 tests; 3 fail on the unrepaired code). The gate supplies the opener; the view stays stateless; no locked consent string, receipt or commit condition changed |
| HK-V2ACT-LINK-02 | P4 | Deletion gate, Weather | "Recovery and support" (DeletionGate) and "Weather sources" also drop `openURL` failures | OPEN, noted only: DeletionGate is in the separate deletion lane |
| V2UP-C-P3a | P3 | Smart Inbox | No Free discovery surface | OPEN (product copy decision) |
| V2UP-C-P3b | P3 | Smart Inbox | No durable time-saved record | OPEN (would need a durable record: not in scope without approval) |
| V2UP-B-P2a (server half) | P2 | smart-inbox-extract | Server ignores client abort; quota charged for a cancelled accepted request | HANDOFF to Codex (§9) |

No P0 or P1 was found in this workstream's scope. The carried external P1s (Staging recovery template; published paywall revision 12) are unchanged.

## 7. Tests and results

| Gate | Result |
|---|---|
| New regression `tests/claude.v2act.calendarOAuthBinding.test.mjs` (CAL-03) | 14/14 (11/14 fail on the previous handler; the vulnerability demonstration passes against it by design) |
| Migration chain, account deletion (full chain incl. the new migration), calendar, platform parity, F01–F13, IR01, backend protection | 665/665 |
| New regression `tests/claude.v2act.calendarConnection.test.mjs` | 24/24 (the first 19 were proven against the unrepaired code: 14 failed) |
| New regression `tests/claude.v2act.consentLegalLinks.test.mjs` | 4/4 (3/4 fail on the unrepaired code) |
| Consent-adjacent suites (legal copy lock, design system, consent recovery/governance, AI consent management, welcome shell, onboarding layout) | 306/306 |
| Calendar-adjacent suites (architecture, validation, links, Google parity, registry, F01–F13 Calendar, notifications, premium feedback) | 565/565 |
| Full source suite, serial, this branch | see PR body for the final count at the pushed head |
| Joint candidate (this branch trial-merged with Codex PR #51 head c6f6ce9; conflict-free; not pushed) | see PR body |
| TypeScript, release identity, Expo install check, Expo Doctor, native config, Meals boundary scan | see PR body |
| Exact-head GitHub CI | see PR body |

## 8. PRs and SHA

Recorded in the PR body (a document cannot name the commit that contains it).

## 9. RevenueCat-dependent handoff (Codex)

1. V2UP-B-P2a server half: `supabase/functions/smart-inbox-extract/index.ts` passes no `req.signal` to `_shared/premium/smartInbox/handler.ts`. Proposed interface: `handleExtract(deps, userId, body, { signal })`; when `signal.aborted` after the provider returns, call `failUsage` instead of `completeUsage` and return 499 with no body. The provider call should also receive the signal. The client already aborts (PR #48). Repro: start an extraction, reset the account mid-flight; the quota unit completes.
2. Premium journeys (Daily Load Premium, Smart Inbox extraction, Momentum) cannot be exercised end to end while checkout, test checkout and fixtures stay OFF. Nothing in this workstream bypassed that. Needed from Codex: an authorized synthetic entitlement path in Staging, or native sandbox purchase evidence.
3. Interfaces consumed read-only and unchanged: `usePremiumState`, `usePremiumFeature`, `usePremiumUpgrade`, `PremiumReaderBridge` view (`accountBound`, `householdId`, `entitled`, `appVersion`, `extract`).

## 10. External access blockers

- Supabase MCP connector: an authorization link was issued in each pass and not completed. This blocks deployed version/hash/secret/migration reads, the CAL-02/03/04 Staging deployments, the CAL-03 migration, the authenticated Staging probes and the Production bundle check for the herkeys-ai promotion. Not retried further, per directive. The local Supabase CLI is authenticated to another organization and was deliberately not used.
- Staging Auth SMTP/template management (unchanged, per the recovery report).
- Apple/Google native sign-in and calendar consent need devices.

## 11. Remaining platform-specific testing

iOS and Android: Apple/Google sign-in; Google Calendar connect, reconnect and disconnect through the system auth browser, including the Android deep-link path; Weather permission prompts; local notification delivery; offline/airplane-mode persistence and sync recovery; account switch with work in flight; VoiceOver/TalkBack announcements; mandatory-consent legal links when no browser can be opened.

## 12. Verdict for this workstream

| # | Readiness | Verdict | Evidence / reason |
|---|---|---|---|
| 1 | Application source | PASS | Full suite, TypeScript, Expo compatibility/Doctor, release identity, native config and exact-head CI at the pushed head (PR body). Every repair is proven by a regression that fails on the previous code. |
| 2 | Google Calendar security | FAIL (deployed) / PASS (source) | The repair is complete and adversarially tested in source. Both live environments still run the vulnerable callback with Calendar configured. Readiness becomes PASS only after the migration, Staging deploy and native Google verification. |
| 3 | Staging backend | BLOCKED | Connector unauthorized: no version/secret readback, no deploy, no authenticated probes. Unauthenticated refusal and callback fail-back PASS by live probe. |
| 4 | Production promotion | BLOCKED | herkeys-ai packet validated at source; deployed-bundle comparison needs the connector; specific owner authorization not yet given. Calendar repairs are Staging-first by directive. |
| 5 | Joint RevenueCat/application integration | BLOCKED | Joint tree (this branch + PR #51) merges cleanly and passes the full suite (PR body). PR #51 is still OPEN/unmerged, and entitlement-dependent journeys cannot run while checkout, test checkout and fixtures stay OFF. |
| 6 | Independent platform audit | NOT_RUN | Source candidate is ready for audit (verdict 1). The CAL-03 flow, Apple/Google sign-in, permissions, offline and account-switch journeys need device evidence; no IPA/AAB was created. |

Issues in this workstream still open: CAL-03 deployment (live P2 exposure), V2UP-C-P3a/P3b (product decisions), LINK-02 (P4). Assigned to Codex: V2UP-B-P2a server half, entitlement-dependent journeys, paywall, webhooks.

## 13. Rollout pass (management decisions after the PR #51/#52 merge)

Integration authority: `f7b686b94fd8e577cc269c7302897d6fb00a5059` (PR #52 merge; contains PR #51 merge `632bf55` with head `c6f6ce9` and PR #52 head `204f0b0`). Exact-head push CI 43494631003: **success**. Work continues on `claude/v2-calendar-security-mitigation-20261113` from that SHA. PR #51 is now merged, which supersedes the "unmerged" reason in §12 verdict 5.

### 13.1 Emergency Production mitigation for CAL-03 (management-authorized)

Source: `supabase/functions/_emergency/calendar-oauth-paused/index.ts`, deployed under the existing `calendar-oauth` slug with verify_jwt unchanged (false). The underscore folder is never deployed as a function of its own. It imports only `_shared/http.ts` and is deployed as exactly those two files (entrypoint at its repository path), so the deployed bytes equal the reviewed bytes.

| Requirement | How it is met | Evidence |
|---|---|---|
| Reject new authorization attempts | POST → 503 `{status:'unavailable', reason:'calendar_connect_paused'}`; no state row, no authorization URL | `tests/claude.v2act.calendarMitigation.test.mjs` |
| Outstanding callbacks cannot exchange or write | GET → 302 `…?status=error&detail=connect_paused`; the file has no fetch, storage or Google secret | Same suite: an authorization started under the pinned pre-repair handler and completed under the mitigation writes nothing and makes no token call |
| Preserve existing connections and read-only sync | `calendar-data` is not redeployed | Same suite: the pinned `calendar-data` still reports, lists calendars and reads with the mitigation live |
| Preserve disconnect | Same | Same suite: disconnect removes only the caller's row |
| No schema, credential or unrelated change | One function slug only | File-scan test: single import, no storage, secret or network tokens |
| Shipped builds degrade quietly | The shipped bridge maps an unavailable start to the hidden "dormant" state before opening any browser | Pinned-source assertion in the suite |

Known, accepted consequences:
- **Lapsed connections:** a user whose existing connection needs re-authorization can't reconnect until the permanent repair ships. On builds before PR #52 they also can't remove it in-app, because the deployed `calendar-data` refuses disconnect for `reauth_required` (the CAL-02 fix is not yet in Production).
- **Unauthenticated start:** an unauthenticated POST gets 503 instead of 401. The mitigation reads no account, so nothing is exposed.

Live BEFORE evidence (read-only probes, 2026-11-13T19:49:37Z), identical in Production and Staging:
- `calendar-oauth` POST without auth → 401.
- `calendar-oauth` GET with a forged code and state → `302 herkeys://calendar-connected/?status=error&detail=invalid_state` (the state-lookup and exchange path is live).
- `calendar-data` POST without auth → 401.

Deployment status: **BLOCKED.** After the `/mcp` reconnection request the Supabase MCP tools were still not available to this session. So the deployed bundle could not be retrieved for rollback, the project identities could not be confirmed, and nothing was deployed.

Procedure once tools are available:
1. Confirm the Production project is `npykvnxnehlsdlbumzwk` in the Her Keys organization.
2. Retrieve and save the current `calendar-oauth` bundle and version as the rollback artifact, and compare it with `4f17b91` (expected LF SHA-256 `d1292f9a…22ad0`).
3. Record `select status, count(*) from external_calendar_connections group by status` (counts only).
4. Deploy the two mitigation files: entrypoint `_emergency/calendar-oauth-paused/index.ts`, slug `calendar-oauth`, verify_jwt=false.
5. Read back the bundle and compare.
6. AFTER probes:
   - POST → 503 `calendar_connect_paused`;
   - GET forged → `detail=connect_paused`;
   - `calendar-data` POST without auth → 401, version unchanged;
   - connection counts unchanged.
7. Rollback: redeploy the saved bundle and confirm the BEFORE responses return.

### 13.2 Staging rollout of the permanent repair

Status: **BLOCKED** (same tool unavailability). Ordered plan:
1. Confirm the Staging project is `fhhudicklmpofuzkxeqe`.
2. List migrations and confirm `20261113191332_calendar_oauth_authenticated_completion` is absent.
3. Retrieve and save the current `calendar-oauth` and `calendar-data` bundles.
4. Apply the migration, then read back the four columns, the CHECK, the partial unique index, no anon/authenticated privilege and no policy.
5. Deploy `calendar-data` (CAL-02) and `calendar-oauth` (CAL-03/04) from `f7b686b`. Read back and compare (LF SHA-256 `b569e401…31cf1` and `69fe5b84…f532af`).
6. Backend checks, all with marked synthetic accounts and synthetic rows (no Google account):
   - unauthenticated 401 on both functions;
   - forged callback → `invalid_state` and no handle;
   - SQL-seeded pending authorization redeemed by the wrong account → 403, then by the right account → 409 (already consumed);
   - malformed handle → 400;
   - `calendar-data` disconnect of a synthetic `reauth_required` row owned by the caller → 200 and the row gone; a second disconnect → 200; another account's row untouched;
   - every synthetic row removed afterwards.
7. Restoration: redeploying the saved bundles restores the previous behavior; the additive columns may stay (nullable, unused by the old code).

The genuine "authenticated completion with Google" check needs a real Google consent, which happens only in §13.3. Backend checks are not native certification.

### 13.3 Native compatibility test (Android and iOS development builds)

The `development` EAS profile targets Staging (`EXPO_PUBLIC_HERKEYS_BACKEND=staging`), with identities unchanged (iOS `com.herkeys.app`, Android `com.heykeys.app`, scheme `herkeys`). Any build from `f7b686b` or later contains the completion flow. After §13.2 is deployed, test with a marked synthetic Her Keys account and a test Google account:

1. **Connect:** the consent screen lists only the two read-only scopes; the return lands in the app; the panel shows "Google Calendar connected" with the primary calendar selected; events appear in Day view.
2. **Cancel** on the consent screen: the app returns, nothing is connected, and Connect works again.
3. **Account switch:** start Connect, background the app, sign out and sign in as a second synthetic account, then finish consent. Neither account may be connected.
4. **Old build:** a build older than PR #52 returns from Connect without connecting against Staging (expected; covered by the coordinated rollout).
5. **Reconnect and choices:** reconnect keeps the earlier calendar choice; Disconnect removes the connection; a connection marked `reauth_required` (revoke access in the Google account) can be disconnected.
6. **Android delivery:** the redirect is captured by the auth session, not delivered as a stray deep link. Check with Chrome Custom Tabs and with a non-Chrome default browser.

Production rollout of the permanent repair, all of which must happen first:
- this native pass is green on both platforms;
- a build containing the flow is in testers' hands;
- the Production migration is applied;
- `calendar-oauth` and `calendar-data` are deployed together, replacing the mitigation.

### 13.4 Talk It Out v13 → v14 (separate from the Calendar mitigation)

Packet as in §5, validated at source and unchanged. It is deployed on its own, never combined with a Calendar change. Status: **BLOCKED** (bundle comparison and deployment need the tools).

Evidence to record when it runs:
- the Staging v22 and Production v13 bundle hashes against the source hashes in §4;
- the v14 readback;
- probes: 401 without auth (baseline PASS 2026-11-13); 403 for a synthetic account without current AI consent;
- one schema-valid uncertainty turn with consent granted, then consent restored to its prior value.

Rollback: the 0a93e9c three-file bundle.

### 13.5 Safety controls

Not touched in this pass: checkout, test-store checkout, fixtures and account-deletion controls. Their live state could not be re-read without the tools; the last recorded state is OFF / OFF / OFF and disabled / dry-run (Codex 11-13).

## 14. Guard-permission repair and end-to-end status (pass after PR #53 merge)

Base: integration `2e0bcfb` (PR #53 merged). Branch `claude/v2-calendar-guard-and-e2e-20261113`.

Live observation (read-only probe, 2026-11-13T20:32:40Z):
- **Production:** `calendar-oauth` answers POST with `503 {"status":"unavailable","reason":"calendar_connect_paused"}` and a forged callback with `detail=connect_paused`. **The emergency pause is live.** It was deployed outside this session; the deployed bundle was not read back here.
- **Staging:** still answers like the pre-pause code (401 / `invalid_state`).

### HK-V2ACT-GUARD-01 (P1 for Calendar): pending-deletion guard blocked every legitimate provider write — REPAIRED IN SOURCE

Cause:
- `private.refuse_pending_provider_write()` guards 11 tables and ran with invoker rights.
- It calls `private.account_is_active()`. `service_role` has no USAGE on schema `private`; only `authenticated` does.
- Premium tables are written through SECURITY DEFINER RPCs and were unaffected. Edge Functions write `calendar_oauth_states`, `external_calendar_connections` and `apple_revocation_credentials` directly as `service_role`, so every insert or update there failed with "permission denied for schema private", for active accounts too.

Consequences, inferred from source and the migration chain and not confirmed live (no database access):
- Calendar consent could not start (insert) or complete (update), and no connection could be stored.
- For existing connections, `calendar-data` updates on every event read (`last_sync_at`), calendar selection and lapse marking failed, so read-only sync returned 500 ("needs another try").
- Disconnect (DELETE) is unaffected, because the guard covers INSERT/UPDATE only.

Repair: migration `20261113203431_provider_write_guard_definer.sql` makes only that guard SECURITY DEFINER (owner; empty search_path unchanged) and re-revokes client EXECUTE.
- No grant is added to `service_role` or any client role, and the guard logic is unchanged.
- The migration asserts definer, empty search_path, no `service_role` schema USAGE, and no anon/authenticated EXECUTE.

Evidence: `tests/accountDeletion/providerGuardServiceRole.test.mjs`, under the real `service_role` on the full chain in disposable PostgreSQL:
- before the repair, 0/3: `permission denied for schema private`, even for an active account;
- after, 3/3: an active account can start, complete and store a connection; a pending-deletion account is refused with `account_deactivated` on both Calendar tables; least privilege holds.
- Account-deletion and governance suites pass 117/117.

Scan of every trigger reaching schema `private`: this guard was the only invoker-rights function on a table written directly by `service_role`. The ledger-immutability triggers refuse those writes anyway, and the other private trigger functions are invoked by OID on tables written by `authenticated`.

### End-to-end Google Calendar journey: BLOCKED (not run)

Each prerequisite is unavailable here; none was faked:
1. **Staging backend:** apply `20261113191332` and `20261113203431`, then deploy `calendar-data` and `calendar-oauth` from this branch. The Supabase MCP tools were still unavailable to this session ("requires authentication"), so this could not be done.
2. **A compatible build on a device or emulator:** any build from `f7b686b` or later on the `development` profile (Staging). No EAS build was started; a local `expo run:android` on the existing Pixel_8_Pro AVD is the cheapest route once the backend is ready.
3. **A real test Google account consent**, performed by a person. Credentials are never handled by the agent.

Run order once 1–3 exist: §13.2 backend checks, then §13.3 steps 1–6. Event synchronization is verified by Day view showing a test event created in the Google account; reconnection keeps choices; disconnect removes the row.

**Production:** the security pause stays in place.
- The guard migration is the one Production change this pass recommends next, after Staging: it is what the live read-only sync needs, and it is independent of CAL-03.
- The permanent OAuth flow replaces the pause only after the native pass and a coordinated app build.
