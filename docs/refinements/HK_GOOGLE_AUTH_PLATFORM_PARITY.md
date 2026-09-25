# Google Auth Platform Parity (P0 pre-build gate)

Branch `refinement/google-auth-platform-parity`, based on `refinement/weather-calendar-scaffold` @ `11c50be`.

## Architecture (iOS == Android)

Google identity sign-in is **Supabase Auth OAuth (PKCE)**, on one code path shared by iOS and Android:

```
supabase.auth.signInWithOAuth({ provider: 'google',
  options: { redirectTo: 'herkeys://auth/callback', skipBrowserRedirect: true } })
→ WebBrowser.openAuthSessionAsync(url, 'herkeys://auth/callback')
→ callback herkeys://auth/callback?code=…  (checked against that exact route)
→ supabase.auth.exchangeCodeForSession(code)   (verifier held in memory)
→ sessionFromSupabase(...)  → ProviderResult → AccountRuntime (unchanged)
```

| File | Role |
|---|---|
| `src/platform/googleIdentityOAuth.ts` | The single flow. Has no `react-native` import and no `Platform`. Also holds the callback parser and the router guard. |
| `src/platform/googleProvider.ts` | A thin adapter that injects `expo-web-browser`. Always available when a provider client exists. |
| `src/platform/supabaseCloud.ts` | `flowType: 'pkce'` added. `persistSession: false` is unchanged, so the verifier and the session live only in memory. |
| `src/store/accountRuntimeInstance.ts` | Registers Google only where `secureStorageAvailable`, so web is excluded at the composition root. |
| `app/+native-intent.tsx` | On Android the auth return also reaches Expo Router through `Linking`. This file tells the router to ignore `herkeys://auth/callback` so no unmatched-route screen appears. iOS's `ASWebAuthenticationSession` never delivers the URL to the router, so both platforms end up behaving the same. |

What was removed:
- `expo-auth-session` `AuthRequest` / `makeRedirectUri` / `ResponseType.IdToken`
- `signInWithIdToken` for Google
- per-platform client IDs (`googleAuthConfig`)
- the web-only `maybeCompleteAuthSession` call

### Why PKCE and not the implicit flow

With PKCE the custom-scheme return carries a single-use code, never a token. Any other app that registers `herkeys://` and intercepts the code can do nothing with it without the verifier held in this process. A callback that carries `access_token`, `refresh_token` or `provider_token` is refused.

With `persistSession: false`, supabase-js 2.116 keeps the verifier in an in-memory adapter, so nothing reaches AsyncStorage or localStorage. `appendPkceFlowIdToRedirects` is off, so the redirect sent to Supabase is exactly `herkeys://auth/callback`, and an exact allow-list entry matches it.

### Calendar is untouched

Calendar still uses `herkeys://calendar-connected`, the `calendar-oauth` Edge Function and its own Web client. No Calendar file changed.

## Tests (`tests/googleAuthParity.test.mjs`, 38 tests)

These run the real `googleProvider.ts` with the native modules stubbed. They also run the real supabase-js client built by `createSupabaseClient()` against a scripted network, which proves:
- the authorize URL
- that `sha256(code_verifier)` equals `code_challenge`
- the in-memory session
- that a replayed code without a verifier never reaches the token endpoint

The 10 required properties each have their own `describe` block.

As a mutation check, adding a `Platform.OS` branch to `googleProvider.ts` fails 4 of these tests.

## Supabase Staging / Google Cloud — must be verified outside this container

The container's egress policy denies `fhhudicklmpofuzkxeqe.supabase.co`, and the Supabase MCP has no Auth-config read. `auth.identities` and `auth.flow_state` on Staging are empty, so no Google sign-in has ever completed there. None of the checks below could be confirmed from here.

1. **Supabase → Authentication → Sign In / Providers → Google**
   - Enabled.
   - Client ID is the **identity Web client**, not the Calendar client (`GOOGLE_CALENDAR_CLIENT_ID`).
   - The client secret is set there, and only there.
   - The callback URL shown is `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → URL Configuration → Redirect URLs**
   - Add exactly `herkeys://auth/callback`.
3. **Google Cloud → Credentials → the identity Web client**
   - Authorized redirect URIs include `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback`.
   - The Calendar client, whose redirect ends in `/functions/v1/calendar-oauth`, must not be the one configured in step 1.

Probes to run from a machine with network access. They use the publishable key only, which is client-safe.

```sh
B=https://fhhudicklmpofuzkxeqe.supabase.co; K=<publishable key>
# 1. provider enabled → "google": true
curl -s "$B/auth/v1/settings" -H "apikey: $K" | jq '.external.google'
# 2 + 3. which client and redirect Supabase actually uses, and whether herkeys://auth/callback is allow-listed
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H "apikey: $K" \
  "$B/auth/v1/authorize?provider=google&redirect_to=herkeys%3A%2F%2Fauth%2Fcallback&code_challenge=Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFy&code_challenge_method=s256")
echo "$LOC" | tr '&?' '\n\n' | grep -E '^(client_id|redirect_uri)='   # client_id must be the identity Web client
echo "$LOC" | tr '&?' '\n\n' | sed -n 's/^state=//p' | cut -d. -f2 | base64 -d 2>/dev/null | jq '.referrer'
#   → "herkeys://auth/callback" when allow-listed; the Site URL when it is not
# Then open $LOC in a browser: Google shows its sign-in page; a redirect_uri_mismatch error means step 3 is wrong.
```

## Obsolete after this repair (not removed yet)

- EAS / `.env`:
  - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

  The app no longer reads any of them.
- Google Cloud: the iOS and Android OAuth client IDs are not used by the identity flow. Supabase's Google provider "Authorized Client IDs" field matters only for `signInWithIdToken`, which is no longer used for Google.
- `package.json`: `expo-auth-session` is no longer imported anywhere in `src/` or `app/`.
