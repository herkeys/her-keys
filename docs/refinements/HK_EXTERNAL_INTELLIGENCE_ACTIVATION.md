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
- No location permission dependency
- No WeatherKit secret or private key in the app bundle
- No percentage-based precipitation copy
- Dormant when provider credentials or the prototype location anchor are absent

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
5. Add the non-secret prototype Weather anchor to the app environment.
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

## Prototype Weather location

Weather is intentionally not tied to device location yet. To activate the prototype Today card, set an explicit, non-secret location anchor in the app build environment:

```text
EXPO_PUBLIC_WEATHER_ANCHOR_LATITUDE
EXPO_PUBLIC_WEATHER_ANCHOR_LONGITUDE
EXPO_PUBLIC_WEATHER_ANCHOR_COUNTRY_CODE
EXPO_PUBLIC_WEATHER_ANCHOR_LABEL
```

Example meaning only:

- latitude / longitude: a user-approved city/home-area anchor
- country code: `US`
- label: `Home`

Do not infer or silently store a device location. Later, the same provider boundary can take a user-approved home area or an explicit trip/event destination.

---

# C. Google Calendar credential activation

Use a Google OAuth **Web application** client for the Calendar server flow. A dedicated Calendar client is preferred so this authorization can never inherit broader scopes from another Her Keys Google workflow. An existing compatible client may be used only if its grant history and redirect configuration are understood.

The Calendar connection is deliberately separate from Her Keys identity authentication.

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

- Weather card does not appear.
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
- Confirm Weather appears only when the explicit anchor is present.
- Confirm current condition and high/low render.
- Confirm precipitation wording contains no percentage.
- Confirm Apple Weather attribution is visible.
- Confirm the Weather source link opens when provided by WeatherKit.
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
- native device location permission
- background location
- persistent Weather history
- weather alerts
- importing Google events into canonical Her Keys `Event` rows
- counting Google events in Capacity
- letting Google events influence One Move
- automatic conflict resolution between external and canonical calendars

Those require separate product/truth decisions. The scaffold deliberately stops before those boundaries.

## Activation definition

Weather is **activated** when WeatherKit server secrets + an explicit app weather anchor are present and `weather-context` is deployed.

Google Calendar is **activated** when the service-only migration exists, Google OAuth redirect/client credentials + encryption secret are present, the two Calendar functions are deployed, and a user explicitly connects Google Calendar.

Until then, both capabilities remain dormant without changing core Her Keys behavior.
