# Her Keys — Weather + Google Calendar Activation Runbook

Status: **scaffolded, dormant by default**

This document is the activation checklist for External Intelligence Refinement Wave 1. The application and server boundaries already exist. Provider credentials are intentionally absent from source control, so an unconfigured build behaves exactly like Her Keys without Weather or Google Calendar.

## What is already built

### Weather

- Authenticated Supabase Edge Function: `weather-context`
- Apple WeatherKit REST developer-token signing on the server
- Current + hourly + daily forecast normalization
- Today surface with Weather attribution
- Temporary/in-memory app use only; no weather database
- Located by the user's **current device location only** — foreground permission, requested from a Weather action, approximate location is sufficient (see "Weather location" below)
- No fixed city, no fallback city, no stored home-weather coordinate
- No WeatherKit secret or private key in the app bundle
- No percentage-based precipitation copy
- Unavailable (not an error) when the user has not shared location, location services are off, or provider credentials are absent
- `weather-context` is already deployed and ACTIVE (JWT verification on) in both Staging (`fhhudicklmpofuzkxeqe`) and Production (`npykvnxnehlsdlbumzwk`); the deployed code is identical between them

### Google Calendar

- Separate Calendar authorization flow; Google sign-in to Her Keys does **not** grant Calendar access
- Exactly these read-only scopes:
  - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
  - `https://www.googleapis.com/auth/calendar.events.readonly`
- Server-side OAuth code exchange and refresh
- PKCE + single-use expiring OAuth state
- Encrypted refresh-token storage boundary
- Read-only calendar list, selection, and event retrieval
- Reauthorization state
- Disconnect + Google token revocation path
- Calendar UI clearly labels imported events as external/read-only
- Google events remain outside canonical Her Keys `Event` state and do not yet affect Capacity or One Move
- Dormant when the server-side Google Calendar credentials are absent

## Activation order

Use this order in each environment:

1. Generate/apply the Calendar connection migration.
2. Add server-side provider secrets.
3. Configure provider-side redirect/identifier settings.
4. Deploy the Edge Functions.
5. (Weather needs no app-environment configuration: it uses the device's location, once the user allows it.)
6. Run the repository gates.
7. Test on a development build.
8. Only after Staging proof, repeat the environment-specific activation in Production.

Do **not** skip directly to Production.

---

# A. Database activation for Google Calendar

The reviewed schema blueprint is:

`supabase/blueprints/external_calendar_connections.sql`

Do not invent a migration filename by hand.

From the repository checkout, use the installed Supabase CLI to create a real migration:

```text
supabase migration new external_calendar_connections
```

Copy the blueprint SQL into the generated migration file, then run the normal local migration/reset and test gates before applying it remotely.

The migration creates two service-only tables:

- `calendar_oauth_states`
- `external_calendar_connections`

Both have RLS enabled. `anon` and `authenticated` are explicitly revoked. The mobile app never reads these tables directly.

After applying the migration, run Supabase security advisors and verify that neither table is directly readable/writable by an authenticated app user.

---

# B. WeatherKit credential activation

In Apple Developer, prepare the WeatherKit REST credentials for Her Keys:

- **Team ID**
- **WeatherKit Service ID**
- **WeatherKit Key ID**
- **WeatherKit private key (.p8)**

The private key is server-only. Never put it in `.env`, `EXPO_PUBLIC_*`, application source, EAS public environment variables, or AppState.

Set these Supabase Edge Function secrets in the target environment:

```text
WEATHERKIT_TEAM_ID
WEATHERKIT_SERVICE_ID
WEATHERKIT_KEY_ID
WEATHERKIT_PRIVATE_KEY_P8
```

The function accepts the .p8 text either with real line breaks or literal `\n` sequences.

There is no native WeatherKit framework dependency in this implementation. Her Keys calls WeatherKit REST from the server, so this scaffold does not require the mobile app to possess the WeatherKit private key.

## Public-release WeatherKit legal gate

Before a public build exposes WeatherKit data, review the then-current Apple Developer Program License Agreement and WeatherKit attribution requirements. Her Keys' Terms/EULA must include Apple's required real-time-weather guidance notice in the wording Apple requires at release time. Do not copy an old notice from this runbook; verify the current agreement when preparing the release.

Her Keys must not present this Weather context as emergency or life-saving guidance.

## Weather location

The product decision: **Weather uses the user's current device location only.** The former build-time fixed-location variables and their config module were removed; there is no replacement variable, no fixed or fallback city, and no stored home-weather coordinate. If location is unavailable, Weather is unavailable.

```text
Today → Local Weather → "Use my location" → foreground permission
      → current/recent device location → weather-context → Apple WeatherKit → "Weather · Near you"
```

- **Foreground only.** Her Keys requests When-In-Use (iOS) / foreground (Android) location through `expo-location`, and only from a Weather action on the Today card. Nothing is requested at launch, on refresh, or on a timer.
- **Approximate is enough.** Position is requested at low accuracy and rounded to about 1 km before use. iOS Reduced accuracy and Android approximate-only both work. Her Keys does not require precise location.
- **No background location, no tracking.** No Always authorization, no background modes, no Android foreground-service location, no watchers or subscriptions, no geofencing, no reverse geocoding. A single last-known-or-current fix is taken per refresh.
- **No persistence.** The coordinate exists in memory for one authenticated `weather-context` request and is then discarded. It is never written to Postgres, household state, AsyncStorage/SecureStore, the sync queue, analytics, logs, notifications, Life Admin, or any profile.
- **Timezone** stays the household/user timezone; the coordinate only chooses the forecast location. No country code is sent (nothing is reverse-geocoded).
- **Auth boundary unchanged.** Only an account-bound, authenticated user's app calls `weather-context`, which still requires a valid user JWT. WeatherKit credentials remain server-side secrets.
- **The one provider path** is Her Keys → Supabase `weather-context` → Apple WeatherKit REST. No other location, maps, geocoding or weather provider exists.

Permission behavior on the Weather card:

| State | What she sees |
|---|---|
| Not yet asked | A calm optional card with **Use my location**. Nothing is prompted until she taps. |
| Granted | **Weather · Near you** with condition, temperature, high/low, precipitation wording, Apple Weather attribution and the Weather sources link. |
| Denied, OS will ask again | Weather stays off (not an error) with an explicit **Use my location** retry. |
| Denied, cannot ask again | **Open Settings**. Her Keys never re-prompts. |
| Location services off / no fix | Nothing (or, right after she tapped, a quiet "not available right now" with **Try again**). Today is unaffected. |
| Provider failure | Nothing. Today is unaffected; no stale or invented forecast is shown. |

### Native permission surface (declared in `app.json`, verified with `expo config --type introspect`)

- **iOS:** `NSLocationWhenInUseUsageDescription` only ("Her Keys uses your approximate location while you're using the app to show local weather and location-aware planning."). No `NSLocationAlways…` strings, no `NSMotionUsageDescription`, no `UIBackgroundModes` location.
- **Android:** `ACCESS_COARSE_LOCATION` only. `ACCESS_FINE_LOCATION` is blocked through `android.blockedPermissions`; `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION` are absent. `expo-location` accepts coarse-only permission as sufficient for a foreground fix.

`tests/weather/architecture.test.mjs` holds these guarantees in source and resolves the real Expo config on every run.

---

# C. Google Calendar credential activation

Use a Google OAuth **Web application** client for the Calendar server flow. A dedicated Calendar client is preferred so this authorization can never inherit broader scopes from another Her Keys Google workflow. An existing compatible client may be used only if its grant history and redirect configuration are understood.

The Calendar connection is deliberately separate from Her Keys identity authentication.

## Google verification gate

Google classifies some user-data scopes as sensitive or restricted. Before a public production launch, check the Google Cloud Consent Screen for the exact scopes Her Keys uses and complete any verification Google requires for a production app. Testing status/test-user access is not a substitute for production verification.

## Required consent scopes

Verify that the OAuth consent configuration includes only the two intended Calendar scopes for this refinement:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.events.readonly
```

Do not add Calendar write/edit scopes. The scaffold intentionally does not request incremental/inherited grants.

## Authorized Google redirect URIs

For **Staging**:

```text
https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/calendar-oauth
```

For **Production**:

```text
https://npykvnxnehlsdlbumzwk.supabase.co/functions/v1/calendar-oauth
```

If one Google Web OAuth client is intentionally shared by both environments, both exact URIs must be authorized. Environment-specific OAuth clients are also acceptable.

The mobile return URI after the server has completed Google OAuth is fixed in code as:

```text
herkeys://calendar-connected
```

That URI is **not** the Google authorized redirect URI. Google returns to the Supabase Edge Function; the Edge Function then returns control to the app.

## Required Supabase secrets

Set these in the target Supabase environment:

```text
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
EXTERNAL_TOKEN_ENCRYPTION_KEY_B64
```

Optional override:

```text
HERKEYS_CALENDAR_APP_REDIRECT_URI
```

Normally leave the override unset so the built-in `herkeys://calendar-connected` value is used.

### Token-encryption key

`EXTERNAL_TOKEN_ENCRYPTION_KEY_B64` must decode to exactly **32 random bytes**.

Generate a different encryption key for Staging and Production. Treat each as a long-lived server secret. Changing the key after Calendar connections exist will make existing encrypted Google refresh tokens unreadable and require reconnection unless a key-rotation migration is deliberately implemented.

---

# D. Edge Function deployment

Functions:

- `weather-context`
- `calendar-oauth`
- `calendar-data`

Shared code lives under:

- `supabase/functions/_shared/`

Auth policy is committed in `supabase/config.toml`:

- `weather-context`: user JWT required
- `calendar-data`: user JWT required
- `calendar-oauth`: platform JWT precheck off because Google calls the callback directly; the function performs its own user/state validation

Do not weaken these boundaries to solve a deployment/authentication error.

Local function secrets belong in:

`supabase/functions/.env`

That file is gitignored. The committed template is:

`supabase/functions/.env.example`

Hosted secrets belong in the Supabase project’s Edge Function Secrets, not in GitHub.

---

# E. Expected dormant behavior before credentials

Before activation, the expected behavior is:

- Weather card does not appear (or shows only the optional **Use my location** entry point when the user has not shared location).
- Google Calendar connection UI does not appear if the Calendar functions report provider configuration unavailable.
- Canonical Her Keys Calendar continues working normally.
- No external provider request can alter Tasks, Events, Capacity, One Move, or household state.
- No provider secret is required for TypeScript/tests to pass.

A missing provider credential is an **unavailable external capability**, not an application error.

---

# F. Staging proof checklist

After Staging activation:

### Weather

- Sign in to a real Her Keys account.
- Confirm Today loads normally when WeatherKit is unreachable.
- On a development build, confirm no location prompt appears at launch, and that Today shows **Use my location** first.
- Tap **Use my location**, allow While Using (choose Approximate/Reduced accuracy where the OS offers it), and confirm **Weather · Near you** appears.
- Deny once and confirm Weather simply stays off, then confirm a permanent denial offers **Open Settings** and never re-prompts.
- Confirm no Always/background location permission is offered, on either platform.
- Confirm current condition and high/low render.
- Confirm precipitation wording contains no percentage.
- Confirm Apple Weather attribution is visible.
- Confirm the Weather source link opens when provided by WeatherKit.
- Confirm the Apple Weather/provider attribution mark is visibly rendered when the provider supplies it.
- Confirm no Weather rows/tables are written to Postgres.
- Background/foreground the app and confirm refresh is non-blocking.

### Google Calendar

- Sign in to Her Keys with Google, Apple, or another supported identity path; Calendar connection must remain a separate action.
- Tap **Connect Google Calendar**.
- Confirm Google asks only for the two read-only Calendar scopes.
- Complete consent and confirm return to Her Keys.
- Confirm the primary calendar is selected initially.
- Confirm calendar selection can be changed.
- Confirm events appear in the external/read-only section.
- Confirm an external event cannot be edited, deleted, moved, completed, or converted merely by being displayed.
- Confirm Her Keys canonical Calendar remains unchanged.
- Revoke Google Calendar access externally and confirm Her Keys transitions to reconnect/reauth rather than corrupting Calendar state.
- Disconnect inside Her Keys and confirm the provider token is revoked and the server connection row is removed.
- Remember that Google's OAuth token revocation is project-wide for OAuth 2.0 grants. Today, Her Keys' Google API authorization is Calendar-only; before adding another Google API integration under the same Cloud project, revisit this disconnect boundary or isolate that integration in another project. Google ID-token sharing used for sign-in is a separate grant.

### Privacy / account isolation

With two Her Keys accounts:

- Account A must never see Account B’s Calendar connection, selected calendars, or Google events.
- Signing out must not leave Account A external events visible to Account B.
- Switching accounts must re-resolve Calendar status through the authenticated server boundary.
- Google refresh tokens must never appear in app storage, logs, sync payloads, AppState, or client-visible table queries.

---

# G. Repository gates before any EAS build

Run from the Windows checkout:

```text
npm ci
npm run typecheck
npm test
```

For Supabase CLI work, discover the installed command surface first:

```text
supabase --help
supabase functions --help
supabase migration --help
```

Then run the repository’s established local database/function verification process. Do not guess flags from old Supabase CLI versions.

Only after the repository is green should a development build be used for provider OAuth/device testing.

---

# H. Intentionally deferred

These are **not** required to activate this scaffold:

- Calendar write-back
- creating/updating/deleting Google events
- Outlook Calendar
- remote push notifications
- background location or any continuous location tracking (foreground device location for Weather is built; see "Weather location")
- persistent Weather history, or any stored location
- weather alerts
- importing Google events into canonical Her Keys `Event` rows
- counting Google events in Capacity
- letting Google events influence One Move
- automatic conflict resolution between external and canonical calendars

Those require separate product/truth decisions. The scaffold deliberately stops before those boundaries.

## Activation definition

Weather is **activated** when WeatherKit server secrets are present, `weather-context` is deployed (already true in Staging and Production), and a signed-in user chooses to share her device location.

Google Calendar is **activated** when the service-only migration exists, Google OAuth redirect/client credentials + encryption secret are present, the two Calendar functions are deployed, and a user explicitly connects Google Calendar.

Until then, both capabilities remain dormant without changing core Her Keys behavior.
