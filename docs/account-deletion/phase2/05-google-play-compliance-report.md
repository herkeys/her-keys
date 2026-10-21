# Google Play compliance report — account deletion Phase 2 (2026-10-20)

References: [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311). Phase 1: `../google-play-compliance-report.md`.

## Gate results

| Gate | Result | Basis |
|---|---|---|
| `ANDROID_DELETION_SOURCE` | **PASS** | Shared in-app flow and lifecycle (see Apple report); Android-specific source unchanged since Phase 1; full suite green |
| `ANDROID_DELETION_NATIVE` | **NOT_RUN** | Emulator now boots (new evidence), but Expo Go 57.0.9 cannot load the app (DEL-P2-010) |
| `GOOGLE_PROVIDER_CLEANUP` | **NOT_VERIFIED** | Source: Calendar grant revocation; `invalid_token` settles distinctly (DEL-P2-002). Live Google revocation owner-deferred. |
| `WEBSITE_PUBLIC_DELETION` | **NOT_DEPLOYED** | `https://herkeys.app/delete-account` still serves the disabled placeholder (HTTP 200, observed 2026-10-20) |
| `GOOGLE_PLAY_POLICY` | **BLOCKED** | The external web resource is not functional in public, and legal disclosures are unapproved |

## Native Android: what changed in Phase 2

Phase 1 cycled `HerKeys_Runtime_B` twice and it never reached package-manager readiness. Phase 2 used a different supported configuration, as the brief asked:

- AVD `HerKeys_UI02` (Pixel 8 Pro profile, API 37 Play Store x86_64 image, `swiftshader_indirect`), `-memory 2048 -no-snapshot-save -no-window`.
- Result: `sys.boot_completed=1` and `pm path android` ready after ~490 s. **The emulator infrastructure works.**
- Metro started from the Phase 2 worktree (log: "Starting project at C:\Users\jsmit\Her-Keys-DEL2"), with a private Metro cache and a real `expo-router` copy to avoid cross-checkout route resolution.
- Expo Go 57.0.9 opened the bundle and failed: `Cannot find native module 'ExpoTopicSubscriptionModule'` (expo-notifications 57.0.23, Android), then `Cannot read property 'ErrorBoundary' of undefined`.

**Classification:** client-runtime incompatibility, not an application defect. The app's dependencies need a development build. The host had 0.8–1.8 GB free RAM, so a local Gradle build was not attempted. Downloading a newer Expo Go APK needs owner approval. Emulator and Metro were shut down afterwards; no app data was cleared.

## Android test plan (reproducible; not executed)

Build: `npx expo run:android` (debug) on a host with ≥8 GB free RAM, or an EAS **development** profile, of the approved commit against Staging. Use the same 12 steps as the iOS plan, replacing Apple with:

- Google sign-in (disposable Google account) **and** an email-OTP account.
- Connect Google Calendar, then remove Her Keys at myaccount.google.com/permissions **before** the purge. Expect terminal proof, `google_revoked='credential_already_invalid'` in request evidence, and the original calendar events untouched.
- Airplane mode during confirm. Expect an ambiguous-outcome notice, receipt retained, no "deleted" claim.
- Back button / process death during the pending state. Expect the gate to restore after relaunch.
- Google Play subscriptions link opens the store page; deletion does not cancel the subscription.

## External web resource (Play requirement)

The source (PR #9 plus web Phase 2 `c3b2c83`) satisfies the functional requirements when served, verified by local production build checks (22/22):

| Requirement | Evidence |
|---|---|
| Loads without the app; identifies Her Keys | `h1` "Delete your Her Keys account"; plain Next.js page |
| Functional identity verification | Email OTP via the Supabase publishable key, `shouldCreateUser=false`; non-enumerating notice verified with a nonexistent address against live Staging |
| Real request on the same lifecycle | Calls `request-account-deletion` (same function as mobile) with a verified session |
| Truthful status | Strict proof validation; unknown receipt never reads as deleted (live Staging) |
| Recovery-token confidentiality | Fragment token stripped from the address bar; sent only in the POST body; empty Referer; no-referrer/no-store/noindex headers; nothing in web storage; no third-party hosts |
| Mobile browser | 375 px: no horizontal scroll, all buttons ≥44 px |
| No misleading obstacles | One email field, one code, one confirm. Apple Hide My Email guidance added (DEL-P2-009). |

**URL for the Play Console:** `https://herkeys.app/delete-account`. Submit it **only after** the reviewed site is published and the public HTTPS journey is re-verified (owner-approved public release; see `06-website-activation-report.md`).

## Google identity and Calendar

- Deletion revokes only Her Keys' retained Calendar refresh token(s) and deletes `external_calendar_connections` / `calendar_oauth_states`. It never deletes the Google Account or any original calendar event (source review; no write to Calendar in the deletion path).
- Google independently retains its own records of the OAuth grant, sign-in history and account activity. Her Keys cannot erase these and must not claim to.
- Google sign-in to Supabase Auth: Auth user deletion removes the identity link. The Google Account itself is unaffected.

## Data Safety inputs (for the store owner)

| Field | Proposed answer (after publication and verification) |
|---|---|
| Users can request deletion | Yes: in app (Your Account → Privacy & Data → Delete Account) and on the web at the URL above |
| Deletion timing | Access stops immediately; account-owned data is erased after the 30-day recovery period, subject to shared-household review (seven-day target) |
| Data retained after deletion | Minimal five-field deletion proof for 365 days (no identifiers); encrypted completion-email outbox ≤7 days; store transaction records held by Google/Apple; provider security/backup retention as approved by Legal |
| Shared data | Another adult's records in a shared household are not deleted; ambiguous ownership goes to manual review |
| Data encrypted in transit | Yes (HTTPS only; HSTS observed on herkeys.app) |

The store owner must reconcile the shipping sign-in methods and data types with the current declaration; this was not changed here.
