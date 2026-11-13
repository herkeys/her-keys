# Her Keys V2 — application activation and integration ledger (Claude workstream)

Status: SOURCE REPAIRS COMPLETE AND VERIFIED; HOSTED VERIFICATION BLOCKED. This is a workstream checkpoint, not a shared-system certification.

- Repository `herkeys/her-keys`; base `integration/v2-autonomous-upgrade-20261112` at verified `4f17b917ce8c30c6890c9b2819c191636208d6d6` (PR #50 merge).
- Branch `claude/v2-activation-integration-20261113`, isolated worktree `C:/Users/jsmit/Her-Keys-V2ACT`. Codex works in `Her-Keys-RevenueCat-V2` / `Her-Keys-Codex-V2`; neither was touched. The original `C:/Users/jsmit/Her Keys` checkout and its unrelated edits were preserved.
- Ownership respected: no file under `src/monetization/**`, no RevenueCat function, no `supabase/functions/_shared/premium/**`, no RevenueCat/store/paywall/billing configuration was modified. No migration, schema, RLS, grant, secret, app identifier, SDK version or package changed. No EAS build, IPA or AAB.
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
| Google Calendar (read-only) | Yes | Dormant unless provider secrets present | Calendar panel (hidden while dormant/unavailable) | `calendar-oauth`, `calendar-data` | PASS(src) after CAL-01/02/04 repairs | Server row (encrypted refresh token) | Read-only scopes; caller-scoped; CAL-03 open (P2) | BLOCKED(connector); repairs not deployed | BLOCKED(connector); repairs not deployed |
| Weather | Yes | Account-bound + device permission | Today card | `weather-context` (JWT) | PASS(src) sequence-fenced | Transient by design | Coordinates never stored | BLOCKED(connector) for secrets | BLOCKED(connector) |
| Household records (Life areas, Systems) | Yes | Yes | Life tab hub, Systems tab | Local + sync | PASS(src) | PASS(src) | Staging policy probe 16/16 PASS(live, Codex) | Partial (database layer only) | Isolation probe NOT_RUN |
| Tasks + reminders | Yes | Yes | Task editor, Life lists, local notifications | Local + OS notifications | PASS(src) | PASS(src) | n/a | NOT_RUN device | NOT_RUN device |
| AI consent | Yes | Gate flag true in every profile | Mandatory consent gate; Your Account AI choice | `account_consents` ledger | PASS(src) | Server receipts | Fail closed | Grant/revoke PASS(live, Codex) | Source-verified gate; live grant/revoke NOT_RUN |
| Privacy, settings, permissions | Yes | Yes | Your Account status section; mandatory consent gate | OS settings, legal PDFs | PASS(src) (consent legal-link failure repaired, CONSENT-01) | OS-owned | Status reads never prompt | NOT_RUN | NOT_RUN |
| Offline persistence + sync | Yes | Yes | Persistence/Sync notices | Sync runtime | PASS(src) | PASS(src) | Namespace per account | NOT_RUN device | NOT_RUN device |
| Premium presentation / locked state | Yes | Premium enabled; checkout OFF both envs | Your Account → Premium home; feature cards | premium-gate (read) | PASS(src) locked/unavailable copy | n/a | Entitlement never trusted from client | CODEX | CODEX |

No implemented feature was found invisible because of a broken route or a missing mount. The two activation gaps are deliberate gates (Google Calendar and Weather go dormant without hosted provider secrets) and one carried product gap (V2UP-C-P3a, no Free discovery of Smart Inbox). The hosted secret state could not be read this session.

## 2. Functional journeys and evidence

Exercised in this workstream (new executable regressions, `tests/claude.v2act.calendarConnection.test.mjs`, 19 tests):

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
- Hosted (HTTP JWT, cross-account requests against deployed functions, Production database isolation): BLOCKED(connector). Device account switching and offline transitions: NOT_RUN.
- Open finding HK-V2ACT-CAL-03 (P2, security): the Google Calendar OAuth `state` binds the consent to the account that STARTED it, but the callback completes it without proving the browser belongs to that account. An attacker can start a connection, send the authorization URL to a victim, and if the victim consents, the victim's read-only calendar is stored on the attacker's account (account-linking CSRF). It needs social engineering and an explicit Google consent screen. Proposed repair: the callback stores the exchange result under a one-time completion handle and redirects to the app; the app then completes it with its own JWT, and the server requires that JWT subject to equal the state's `user_id`. That changes the OAuth flow and needs live Google verification plus owner approval to deploy, so it is NOT implemented here.

## 4. Staging / Production parity (non-RevenueCat functions)

This session could not read hosted state (BLOCKED(connector)). The values below come from the cited ledgers and were not re-read.

| Function | JWT (config.toml) | Staging | Production | Known intentional difference | Source state on this branch |
|---|---|---|---|---|---|
| herkeys-ai | true (+ in-code) | v22 `3d2181e4…43ee3f0`, uncertainty repair (Codex 11-13) | v13 `5f0c8dee…48821ea`, Zod-only patch (Codex 11-13) | Uncertainty repair pending authorized promotion | Unchanged; equals v22 source |
| calendar-data | true | not re-read | not re-read | none recorded | CHANGED (CAL-02); not deployed |
| calendar-oauth | false (validates state in code) | not re-read | not re-read | none recorded | CHANGED (CAL-04); not deployed |
| weather-context | true | not re-read | not re-read | none recorded | Unchanged |
| herkeys-welcome-email | true (default) | absent | present, send flag historically off | Production-only by design | Unchanged |
| smart-inbox-extract | true | Codex/Premium lane | Codex/Premium lane | — | Unchanged (not owned) |
| Deletion functions | mixed | disabled/dry-run (Codex 11-13) | disabled/dry-run | Excluded from this scope | Unchanged |

Required secret NAMES (values never read): calendar — `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`, optional `HERKEYS_CALENDAR_APP_REDIRECT_URI`; weather — `WEATHERKIT_TEAM_ID`, `WEATHERKIT_SERVICE_ID`, `WEATHERKIT_KEY_ID`, `WEATHERKIT_PRIVATE_KEY_P8`; AI — `GEMINI_API_KEY`, optional `GEMINI_MODEL`. Migrations/RLS: none changed by this workstream.

## 5. Backend promotions and pending approvals

| Item | Source | Target | Status |
|---|---|---|---|
| herkeys-ai uncertainty repair | `supabase/functions/herkeys-ai/index.ts` at 489cafc (= this branch), +42/−2 vs Production's 0a93e9c; shared `_shared/http.ts`, `_shared/supabaseAdmin.ts`, `deno.json` unchanged since 0a93e9c | Production v13 → v14 | PREPARED, AWAITING OWNER APPROVAL. Preconditions: re-read Staging v22 and confirm byte equality with this source; confirm Production v13 still equals 0a93e9c; deploy all three files with verify_jwt=true; retrieve and compare; repeat the 401 / 403-before-consent probes; one schema-valid uncertainty turn on the marked Production synthetic account with AI consent granted then restored. Rollback: redeploy the three 0a93e9c files (equals v13, keeps Zod 4.6.7). No data change either way. |
| calendar-data CAL-02 | this branch | Staging first, then Production | NOT DEPLOYED. Needs connector access. Verify: disconnect of a `reauth_required` synthetic row, idempotent second disconnect, 401 unauthenticated. Rollback: previous function source at 4f17b91. |
| calendar-oauth CAL-04 | this branch | Staging first, then Production | NOT DEPLOYED, same gate. Rollback: source at 4f17b91. |

No hosted change of any kind was made in this workstream.

## 6. Defect ledger

| ID | Sev | Area | Cause | Status |
|---|---|---|---|---|
| HK-V2ACT-CAL-01 | P2 | Calendar bridge | Provider answers applied without checking currency: a late answer for the previous day overwrote the new day's Google events; an in-flight load could reinstate calendars after a disconnect; the hook reloaded on account *kind*, not identity | REPAIRED in source + regression |
| HK-V2ACT-CAL-02 | P2 (privacy) | calendar-data + panel | Server refused `disconnect` unless status was `connected`, and the panel offered no Disconnect in `reauth_required`, so a lapsed connection's encrypted refresh token could not be removed without reconnecting; delete was unscoped by user and its error ignored | REPAIRED in source + regression; deployment pending |
| HK-V2ACT-CAL-04 | P3 | calendar-oauth | A restricted account's callback returned bare JSON 401 inside the auth browser instead of the app redirect | REPAIRED in source + regression; deployment pending |
| HK-V2ACT-CAL-03 | P2 (security) | calendar-oauth | Account-linking CSRF (see §3) | OPEN, repair designed, owner + live Google verification required |
| HK-V2ACT-CONSENT-01 | P3 | Consent gate | Mandatory-consent "Read Terms/Privacy" buttons dropped an `openURL` failure (no notice, unhandled rejection), while Welcome and Your Account already report it | REPAIRED in source + regression (`tests/claude.v2act.consentLegalLinks.test.mjs`, 4 tests; 3 fail on the unrepaired code). The gate supplies the opener; the view stays stateless; no locked consent string, receipt or commit condition changed |
| HK-V2ACT-LINK-02 | P4 | Deletion gate, Weather | "Recovery and support" (DeletionGate) and "Weather sources" also drop `openURL` failures | OPEN, noted only: DeletionGate is in the separate deletion lane |
| V2UP-C-P3a | P3 | Smart Inbox | No Free discovery surface | OPEN (product copy decision) |
| V2UP-C-P3b | P3 | Smart Inbox | No durable time-saved record | OPEN (would need a durable record: not in scope without approval) |
| V2UP-B-P2a (server half) | P2 | smart-inbox-extract | Server ignores client abort; quota charged for a cancelled accepted request | HANDOFF to Codex (§9) |

No P0 or P1 was found in this workstream's scope. The carried external P1s (Staging recovery template; published paywall revision 12) are unchanged.

## 7. Tests and results

| Gate | Result |
|---|---|
| New regression `tests/claude.v2act.calendarConnection.test.mjs` | 19/19 (14/19 fail on the unrepaired code) |
| New regression `tests/claude.v2act.consentLegalLinks.test.mjs` | 4/4 (3/4 fail on the unrepaired code) |
| Consent-adjacent suites (legal copy lock, design system, consent recovery/governance, AI consent management, welcome shell, onboarding layout) | 306/306 |
| Calendar-adjacent suites (architecture, validation, links, Google parity, registry, F01–F13 Calendar, notifications, premium feedback) | 565/565 |
| Full source suite, serial | see PR body for the final count at the pushed head |
| TypeScript, release identity, Expo install check, Expo Doctor, Meals boundary scan | see PR body |
| Exact-head GitHub CI | see PR body |

## 8. PRs and SHA

Recorded in the PR body (a document cannot name the commit that contains it).

## 9. RevenueCat-dependent handoff (Codex)

1. V2UP-B-P2a server half: `supabase/functions/smart-inbox-extract/index.ts` passes no `req.signal` to `_shared/premium/smartInbox/handler.ts`. Proposed interface: `handleExtract(deps, userId, body, { signal })`; when `signal.aborted` after the provider returns, call `failUsage` instead of `completeUsage` and return 499 with no body. The provider call should also receive the signal. The client already aborts (PR #48). Repro: start an extraction, reset the account mid-flight; the quota unit completes.
2. Premium journeys (Daily Load Premium, Smart Inbox extraction, Momentum) cannot be exercised end to end while checkout, test checkout and fixtures stay OFF. Nothing in this workstream bypassed that. Needed from Codex: an authorized synthetic entitlement path in Staging, or native sandbox purchase evidence.
3. Interfaces consumed read-only and unchanged: `usePremiumState`, `usePremiumFeature`, `usePremiumUpgrade`, `PremiumReaderBridge` view (`accountBound`, `householdId`, `entitled`, `appVersion`, `extract`).

## 10. External access blockers

- The Supabase MCP connector is unauthorized in this session, which blocks every hosted read, deploy and probe listed above.
- Staging Auth SMTP/template management (unchanged, per the recovery report).
- Apple/Google native sign-in and calendar consent need devices.

## 11. Remaining platform-specific testing

iOS and Android: Apple/Google sign-in; Google Calendar connect, reconnect and disconnect through the system auth browser, including the Android deep-link path; Weather permission prompts; local notification delivery; offline/airplane-mode persistence and sync recovery; account switch with work in flight; VoiceOver/TalkBack announcements; mandatory-consent legal links when no browser can be opened.

## 12. Verdict for this workstream

BLOCKED. Source repairs are complete and verified. Hosted parity, promotions and live journeys cannot be verified without connector access, and the Premium journeys depend on Codex. Issues in this workstream: CAL-03 (P2, open) and two P3s. Issues assigned to Codex: V2UP-B-P2a server half, entitlement-dependent journeys, paywall, webhooks.
