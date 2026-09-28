# Her Keys V1: Pre-Artifact External Service Certification

`PRE_ARTIFACT_SERVICE_GATE=FAIL`

- **Branch/worktree:** `audit/ios-android-platform-parity`, `C:\Users\jsmit\Her-Keys-PP01`.
- **START_SHA / END_SHA:** `3e2811f` (unchanged — no code or doc-only commit landed yet; see "Repairs blocked" below).
- **Scope:** verification only, per the certification addendum. Platform-parity/code work (`HK_IOS_ANDROID_PLATFORM_PARITY.md`) is treated as baseline and was not re-audited.
- **`REMOTE_MUTATIONS=0`.** Two authorized, narrowly-scoped repairs were attempted and both were blocked by this session's own sandbox permission classifier (not by owner policy, not by lack of technical access). See "Repairs blocked".

## FIRST CHECK — artifact target

`APP_TARGET_BACKEND=UNRESOLVED` (not Staging, not Production — **no backend at all**).

- `eas.json` correctly sets `EXPO_PUBLIC_HERKEYS_BACKEND=production` for both the `preview` and `production` build profiles (this literal lives in the repo and is fine).
- But `eas env:list --environment production` and `--environment preview` (run fresh today) both return **"No variables found for this environment."** Neither environment has `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set.
- `src/config/supabase.ts`: `assertBackendMatchesUrl` only throws when both `backend` and `url` are present and disagree. With `url` undefined, it returns silently and `isSupabaseConfigured()` returns `false`. **A `preview` or `production` EAS build today would ship with no Supabase connection at all**, not "pointed at Staging."
- `development` environment is correctly populated (Staging values), confirmed unchanged.

**Repair identified (safely config-local, non-secret, additive — matches the addendum's "wrong public environment selector" example):**
- Set in EAS environments `production` and `preview`:
  - `EXPO_PUBLIC_SUPABASE_URL=https://npykvnxnehlsdlbumzwk.supabase.co`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_refKhz-l7z88FFbScItDvA_SNIjHU6L` (Production's `default` publishable key, confirmed via Supabase MCP `get_publishable_keys`; client-safe by design)
- **Not applied.** `eas env:set --environment production --environment preview --name EXPO_PUBLIC_SUPABASE_URL ...` was refused by this Claude Code session's own auto-mode permission classifier: *"Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Modify Shared Resources]."* This is a harness-level guard, not an owner decision. The exact values above are ready to paste, or the owner can approve the command directly.

Because the artifact target could not be certified as Production, gates below were still checked independently (per the addendum: "move to the next independent gate rather than wasting the entire pass"), but the overall result is FAIL regardless of their individual outcomes.

## GATE 1 — Google identity: `GOOGLE_IDENTITY_GATE=PASS`

Fresh non-consent probe against Production today (`fetch` with `redirect: 'manual'`, no PKCE, no login/consent completed):

```
GOOGLE_IDENTITY_REDIRECT=herkeys://auth/callback   (one constant, both platforms, unchanged in src/platform/googleIdentityOAuth.ts)
PRODUCTION_GOOGLE_WEB_CLIENT=857660202409-109l3gr8jo3…  (Web identity client, confirmed — not the installed/native or Calendar client)
PRODUCTION_GOOGLE_SUPABASE_CALLBACK=https://npykvnxnehlsdlbumzwk.supabase.co/auth/v1/callback (confirmed)
GOOGLE_REDIRECT_URI_MISMATCH=NO  (Google returned 302 to /v3/signin/identifier — the real sign-in page — not /signin/oauth/error)
```

- `PRODUCTION_APP_REDIRECT_ALLOWLIST`: a direct dashboard read is still unavailable (same access gap as the prior parity audit's OA-02 — no Supabase MCP auth-config read, and this session does not sign in to the dashboard with the owner's password). The successful 302 straight to Google's sign-in page is strong operational evidence the redirect is allow-listed (GoTrue would otherwise refuse before contacting Google), so this is certified on that basis, consistent with the prior audit's Production finding. No new contradictory evidence exists.
- No code changes were needed or made here.

## GATE 2 — WeatherKit: `WEATHERKIT_GATE=FAIL (BLOCKED_UNVERIFIED)`

- `WEATHER_CONTEXT_DEPLOYED_SOURCE_MATCH=PASS`: pulled the live Production function source via Supabase MCP today; it is byte-identical to `supabase/functions/weather-context/index.ts` at `3e2811f` (only a stripped doc-comment differs). Function status `ACTIVE`, version 2.
- `WEATHERKIT_PRODUCTION_AUTH`, `WEATHERKIT_REAL_RESPONSE`, `WEATHERKIT_DIFFERENTIAL_PROBE`: **cannot be performed.** `weather-context` calls `requireUser(req)` before anything else — it needs a real Supabase-authenticated user access token, not the anon/publishable key. This pass is expressly forbidden from creating a Production test user or using an owner's token, and no other authorized credential class is available (no service-role bypass exists in the function; it deliberately requires a real user). There is also no Supabase MCP tool to list Edge Function secret names, so even config-presence (`WEATHERKIT_CONFIG_PRODUCTION`) cannot be checked without the same authenticated call.
- **Exact owner action needed:** either (a) run the app signed in as any Production account, trigger the Weather card at two different locations, and share the sanitized JSON (no auth header, no location beyond what's already in the response) back for structural review, or (b) explicitly authorize and hand this session a short-lived Production test-user session token created and destroyed by the owner (outside this session), scoped to exactly one weather-context call.

## GATE 3 — Google Calendar server config: `GOOGLE_CALENDAR_SERVER_GATE=FAIL (BLOCKED_UNVERIFIED)`

- `CALENDAR_OAUTH_PRODUCTION=ACTIVE`, `CALENDAR_DATA_PRODUCTION=ACTIVE`: confirmed today via Supabase MCP `list_edge_functions` (both `status:"ACTIVE"`).
- `CALENDAR_CLIENT_SEPARATE_FROM_IDENTITY=PASS`: unchanged by code inspection — `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET` are referenced only in `calendar-oauth`/`calendar-data`, never in `googleIdentityOAuth.ts`, and vice versa for the identity client.
- `CALENDAR_REDIRECT_URI_MISMATCH=NO`: certified by code proof alone, no probe needed — `redirectUriFor(req)` in `calendar-oauth/index.ts` derives the redirect URI from the incoming request's own origin+pathname, so it is structurally always `https://npykvnxnehlsdlbumzwk.supabase.co/functions/v1/calendar-oauth` and cannot drift from the deployed Production URL.
- `CALENDAR_CLIENT_CONFIG` (client ID/secret presence) and `CALENDAR_ENCRYPTION_CONFIG` (`EXTERNAL_TOKEN_ENCRYPTION_KEY_B64` presence): **could not be checked.** The one safe, read-only, unauthenticated route identified — an anonymous `GET` to `calendar-oauth` with no `code`/`state`, whose 302 `detail` param (`not_configured` vs `missing_code_or_state`) reveals `configured()` without touching any user data or making any write — was blocked by this session's own permission classifier before it could run: *"Reason: [Traffic Redirection]."* This is a harness restriction on this session, not a missing credential; it was not retried in any modified form per the harness's own instruction not to route around a denial.
- `CALENDAR_USER_CONSENT_ROUNDTRIP=UNVERIFIED_RUNTIME` (expected; reserved for artifact QA).

## GATE 4 — Apple Sign-In: `APPLE_AUTH_GATE=PASS`

- `APPLE_AUTH_IMPLEMENTATION=PASS`: unchanged — native `expo-apple-authentication` + `signInWithIdToken` (`src/platform/appleProvider.ts`), no web OAuth.
- `APPLE_NATIVE_CONFIG=PASS`: unchanged — `usesAppleSignIn: true`, `bundleIdentifier: com.herkeys.app` in `app.json`.
- `APPLE_SUPABASE_PRODUCTION_PROVIDER=PASS`: freshly reconfirmed today via `GET /auth/v1/settings` on Production — `external.apple = true`. Identifier/secret-level matching against Apple Developer portal remains outside any tool available in this session (no Apple Developer MCP/connector), unchanged from every prior pass; no contradictory evidence exists.
- `APPLE_ANDROID_EXCLUSION=PASS`: unchanged (`Platform.OS !== 'ios'` gate; EX-01 owner-approved exception, not reopened).

## GATE 5 — RevenueCat: `REVENUECAT_GATE=FAIL`

- `REVENUECAT_SURFACE_IN_ARTIFACT=YES`: `src/monetization/revenueCatClient.ts` is live, wired into `onboarding/plus` and Systems (registry PC-04).
- `REVENUECAT_PRODUCTION_KEYS=MISSING` — **not blocked, directly confirmed absent.** `eas env:list` for `production`, `preview`, and `development` were all read today; none contain `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` or `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. These have never been configured in any EAS environment.
- No RevenueCat dashboard/API connector is attached to this session, so the entitlement ID and offering config also cannot be checked even if keys existed.
- **Exact owner action needed:** obtain the Production iOS and Android public SDK keys from the RevenueCat dashboard and set them in the EAS `production` (and `preview`, since it also targets Production) environments, plus confirm the `her_keys_plus` entitlement and its offering exist in the Production RevenueCat project.

## Repairs blocked (harness permission, not owner policy)

| # | Repair | Values ready | Blocked by |
|---|---|---|---|
| 1 | Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in EAS `production`+`preview` | Yes, both non-secret, listed above | Auto-mode classifier: "Modify Shared Resources" |
| 2 | Read-only unauthenticated GET probe of `calendar-oauth` (config-presence check, no mutation) | N/A (read-only) | Auto-mode classifier: "Traffic Redirection" |

Neither was retried in a modified form, per the harness's own instruction after a denial. The owner can run `eas env:set` directly, or grant a Bash permission rule for these calls, whichever is preferred.

## Regression

- `npm run typecheck`: **PASS**, exit 0.
- `npm test`: **3574 / 3574 pass, 0 fail**, 817 suites (unchanged from the P0–P3 repair-pass gate — no code was touched this pass).

## CODE_CHANGES_REQUIRED=NO

Everything found this pass is an environment/config gap or an access-scope limit, not a code defect.

## Artifact-runtime QA checklist (unchanged, reserved for device pass)

Google identity real login/session/relaunch · Apple identity real login/session/relaunch · Weather foreground grant/denial + real device coordinates · Calendar consent/callback/list/select/load/disconnect · RevenueCat offering render/sandbox purchase/restore/unknown-entitlement fallback.

## Final status block

```
PRE_ARTIFACT_SERVICE_GATE=FAIL

APP_TARGET_BACKEND=UNRESOLVED

GOOGLE_IDENTITY_GATE=PASS
GOOGLE_IDENTITY_REDIRECT=herkeys://auth/callback
GOOGLE_REDIRECT_URI_MISMATCH=NO

WEATHERKIT_GATE=FAIL
WEATHERKIT_PRODUCTION_AUTH=BLOCKED_UNVERIFIED
WEATHERKIT_REAL_RESPONSE=BLOCKED_UNVERIFIED

GOOGLE_CALENDAR_SERVER_GATE=FAIL
CALENDAR_REDIRECT_URI_MISMATCH=NO
CALENDAR_CLIENT_CONFIG=BLOCKED_UNVERIFIED
CALENDAR_ENCRYPTION_CONFIG=BLOCKED_UNVERIFIED
CALENDAR_USER_CONSENT_ROUNDTRIP=UNVERIFIED_RUNTIME

APPLE_AUTH_GATE=PASS

REVENUECAT_GATE=FAIL

CODE_CHANGES_REQUIRED=NO
REPAIRS_MADE=0
REPAIRS_BLOCKED=2

TYPESCRIPT=PASS
TESTS=3574
FAILURES=0

BLOCKED_UNVERIFIED=2 (WeatherKit runtime proof, Calendar client/encryption config presence)

EAS_BUILD_RUN=NO
READY_FOR_ARTIFACT_PREPARATION=NO
```
