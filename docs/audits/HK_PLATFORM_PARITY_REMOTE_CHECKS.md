# Her Keys: Platform Parity Remote Checks (V1 Finalization Part 1)

This ledger belongs to [HK_IOS_ANDROID_PLATFORM_PARITY.md](HK_IOS_ANDROID_PLATFORM_PARITY.md).

`REMOTE_MUTATION=NO`: nothing remote was written during this pass.

- **Allowed projects:**
  - Staging: `fhhudicklmpofuzkxeqe`.
  - Production: `npykvnxnehlsdlbumzwk`.
  - Both refs were checked against this allowlist before every call.
  - Both are in organization `qouxjbueadjitgpchwtj`.
- **Not touched:** no K Scan project and no other organization.
  - The local Supabase CLI is logged into the K Scan organization (`dtcbsuytyjpvadcnyymn`).
  - It was only listed, to learn that. It was not used for Her Keys.
- **Secrets:** none were printed.
  - The OAuth client IDs below are truncated. Client IDs are not secret, but they are truncated anyway.
  - The publishable keys used are client-safe by design.

## Method

The probe scripts are `auth-probe.mjs` and `auth-probe2.mjs` in the session scratchpad. They sent these HTTP requests, which do not change state:

1. `GET https://<ref>.supabase.co/auth/v1/settings` with the project's publishable key.
2. `GET https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=herkeys%3A%2F%2Fauth%2Fcallback`, sent without PKCE parameters.
   - Without PKCE, GoTrue writes no `auth.flow_state` row.
   - The `Location` it returns names the Google client and the redirect Supabase actually uses.
3. `GET` of that Google `Location` URL, with redirects not followed.
   - Google answers with either its sign-in page or `/signin/oauth/error?authError=…`.
4. The same `authorize` request with a control `redirect_to` (`herkeys://probe-not-allowlisted`).
   - This was meant to compare the allow-list decision.
   - GoTrue's `state` is now opaque (one segment, not a JWT), so the allow-list decision cannot be observed this way.

Google Cloud has no live access from here. The OAuth client files the owner downloaded on 2026-09-20 and 2026-09-25 (`C:\Users\jsmit\Downloads`) were read for **non-secret** fields only: the client type, a truncated ID and the redirect URIs. These files are a snapshot, not live state.

## Checks

| # | Timestamp (UTC) | Environment | Project ref | System | Field category | Result | Evidence | Mutation |
|---|---|---|---|---|---|---|---|---|
| R1 | 2026-09-28 16:3x | Staging | fhhudicklmpofuzkxeqe | Supabase Management (MCP `get_project`) | project identity | `Her Keys Staging`, ACTIVE_HEALTHY, us-west-2 | MCP response | NO |
| R2 | 2026-09-28 16:3x | Production | npykvnxnehlsdlbumzwk | Supabase Management (MCP `get_project`) | project identity | `Her Keys Production`, ACTIVE_HEALTHY, us-west-2 | MCP response | NO |
| R3 | 2026-09-28 16:33:31 | Staging | fhhudicklmpofuzkxeqe | Supabase Auth `/settings` | provider enabled | `external.google = true`, `external.apple = true`, `disable_signup = false` | auth-probe.out | NO |
| R4 | 2026-09-28 16:33:31 | Staging | fhhudicklmpofuzkxeqe | Supabase Auth `/authorize` | identity client in use | `client_id = 857660202409-mrhq0…`. This is the Google **installed** (native) client: no redirect URIs, no secret. `redirect_uri = https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback` (correct). `scope = email profile`. | auth-probe.out | NO |
| R5 | 2026-09-28 16:33:3x | Staging | fhhudicklmpofuzkxeqe | Google OAuth (accounts.google.com) | redirect acceptance | **FAIL.** 302 to `/signin/oauth/error`, and `authError` decodes to `redirect_uri_mismatch`. | auth-probe2.out | NO |
| R6 | 2026-09-28 16:33:33 | Production | npykvnxnehlsdlbumzwk | Supabase Auth `/settings` | provider enabled | `external.google = true`, `external.apple = true`, `disable_signup = false` | auth-probe.out | NO |
| R7 | 2026-09-28 16:33:33 | Production | npykvnxnehlsdlbumzwk | Supabase Auth `/authorize` | identity client in use | `client_id = 857660202409-109l3…`. This is the Google **Web** identity client. `redirect_uri = https://npykvnxnehlsdlbumzwk.supabase.co/auth/v1/callback` (correct). `scope = email profile`. | auth-probe.out | NO |
| R8 | 2026-09-28 16:33:3x | Production | npykvnxnehlsdlbumzwk | Google OAuth | redirect acceptance | **PASS.** 302 to `/v3/signin/identifier` (Google's sign-in page) with no error. | auth-probe.out | NO |
| R9 | 2026-09-28 | Staging and Production | both | Supabase Auth URL configuration | `herkeys://auth/callback` in the Redirect URLs allow-list | **UNVERIFIED.** GoTrue `state` is opaque, the Supabase MCP has no auth-config read, and the Management API token available locally belongs to another organization. | auth-probe2.out (`state_claims = {undecodable, segments: 1}`) | NO |
| R10 | 2026-09-28 | Google Cloud `her-keys` (857660202409) | n/a | downloaded client file (snapshot 2026-09-20) | Web identity client redirects | `109l3…` (web, has secret) authorizes **both** `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback` and `https://npykvnxnehlsdlbumzwk.supabase.co/auth/v1/callback`. | gclients.cjs output | NO |
| R11 | 2026-09-28 | Google Cloud | n/a | downloaded client file (snapshot 2026-09-20) | client used by Staging | `mrhq0…` is `installed`, with no redirect URIs and no secret. The file name records no platform. It is inferred to be the Android client, by elimination. | gclients.cjs output | NO |
| R12 | 2026-09-28 | Google Cloud | n/a | downloaded client file (snapshot 2026-09-25) | Calendar client separation | `s63d2…` (web) redirects only to `/functions/v1/calendar-oauth` in both environments. Neither environment's identity provider uses it (R4, R7). | gclients.cjs output | NO |
| R13 | 2026-09-28 | Google Cloud | n/a | iOS client plist (snapshot 2026-09-20) | iOS client | `trj4e…`, bundle `com.herkeys.app`. The identity flow does not use it since PR #6. | gclients.cjs output | NO |
| R14 | 2026-09-28 | Google Cloud | n/a | OAuth consent screen, test users, Calendar verification | consent state | **UNVERIFIED.** There is no Google Cloud console or API access in this session. The runbook says Calendar consent is in Testing, with test users only. | docs/refinements/HK_EXTERNAL_INTELLIGENCE_ACTIVATION.md | NO |

## Configuration defects (owner action)

### CONFIG_DEFECT_ID: CFG-01 (P1, blocks Part 1 and Part 2)

- **Environment:** Staging (`fhhudicklmpofuzkxeqe`).
- **Current value:** Supabase → Authentication → Sign In / Providers → Google → Client ID. The client Supabase uses for the web OAuth flow is `857660202409-mrhq0…apps.googleusercontent.com`, an `installed` (native) client. When the field holds a comma-separated list, Supabase uses the **first** ID for the OAuth redirect flow.
- **Expected value:** the first (or only) Client ID must be the Web identity client `857660202409-109l3…apps.googleusercontent.com`, with **that** client's secret in Client Secret. This matches Production (R7).
- **Why it is wrong:** an installed client has no authorized redirect URIs. Google therefore rejects `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback` with `redirect_uri_mismatch` (R5).
- **Impact:** Google identity sign-in cannot complete on Staging on **either** platform. Staging is the backend for development builds (`eas.json` development profile → `EXPO_PUBLIC_HERKEYS_BACKEND=staging`) and for Part 2 device certification. Every Google identity scenario in Part 2 is therefore impossible.
- **Minimum correction:** in Staging only, set the Google provider's Client IDs so `109l3…` comes first. Keep any other IDs after it if they are wanted; they matter only for `signInWithIdToken`, which Google sign-in no longer uses. Paste the `109l3…` client secret. Save.
  - Verify by rerunning R4 and R5: `client_id` should read `109l3…`, and Google should return `/v3/signin/identifier`.
- **Rollback value:** the current Client ID list, with `mrhq0…` first, and the current secret. The owner should copy both from the dashboard before editing.
- **Blocks:** Part 1 (a device test is impossible) and Part 2.
- **Why the agent did not repair it:**
  - The brief forbids remote auth mutation in this pass.
  - The owner later authorized making Staging match Production. No tool available here can reach Staging's auth settings: the Chrome extension was not connected, the Supabase MCP has no auth-config write, and the local CLI belongs to another organization.
  - The client secret must be entered by the owner in any case.

### OWNER VERIFICATION: OA-02 (redirect allow-list, UNVERIFIED)

- **Environment:** Staging and Production.
- **What to verify:** Supabase → Authentication → URL Configuration → Redirect URLs must contain exactly `herkeys://auth/callback`.
- **Why:** if the entry is missing, Supabase sends the browser to the Site URL instead of the app. On both platforms the auth session then never returns with a code, and sign-in ends as `cancelled`/`dismiss`.
- **Blocks:** Part 2 Google scenarios if missing. It is not counted as a defect, because its state is unknown.
