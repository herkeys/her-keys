# Welcome tree — auth integration and environment record

Branch `integration/welcome-tree-auth-runtime`, from the welcome frontend commit `69af50f` (itself on Build 2 `0cf041a`).
Recorded 2026-10-05.

Repository state and environment state are separate things and are reported separately here. **The repository
integration is complete and green. Neither environment has passed its gate**: Staging has a confirmed Google
configuration defect, most of the auth configuration could not be read from the tooling available to this pass, and no
identity method has been exercised at runtime on a device. Production was inventoried read-only and not changed.

## 1. What the app now does

```
Welcome frontend (src/features/welcome, presentational)
        ↓  WelcomeAuthFlow + welcomeFlowModel (src/features/account)
AccountProvider / AccountRuntime          ← the one authentication state machine
        ↓
Provider adapters (Apple, Google)  ·  EmailOtpPort (email, two-phase)
        ↓
Supabase Auth  →  existing binding / claim / sync
```

There is no second state machine, account store or session authority, and the welcome shell never calls Supabase.

### Routing — `src/domain/routeAccess.ts` is still the one authority

| State | What opens |
| --- | --- |
| Hydration not settled | Nothing (launch splash) |
| Hydrated, stored session still being resolved | No navigator. The shell's `settling` presentation |
| Settled, nobody holds this household under an account (signed out, a flow in flight, a failed attempt, signed in but not yet bound) | The entry route only: Welcome → account choice → authenticate |
| Held (bound, or bound with a lapsed credential) and the audit unfinished | The entry hands her on to the step she had reached; the onboarding steps; Your Account |
| Held and the audit finished | The app; Your Account |
| Another account's household is on the device (`boundOther`) | `account-conflict` and nothing else |

- Whether Welcome shows is derived every launch from hydration, account state and onboarding state. Nothing is persisted
  for it: no `hasSeenWelcome` or equivalent exists, and a test scans for one.
- There is no guest path. In a release build no state opens the audit or the app without a held household.
- A signed-in session that is not yet bound opens nothing account-held. That is deliberate: it is the instant after any
  sign-in, including another account's on a bound device, and opening the app then would show that household for the
  frame before quarantine is declared.
- Signing out returns to the welcome tree. The binding stays, so the same account resumes the same household.
- `authDegraded` keeps the household on screen locally (unchanged doctrine) and reconnects from Your Account.

### Email OTP

Two phases, so a port of its own (`src/domain/account/emailOtp.ts`) rather than a one-step provider adapter.

- Request: `signInWithOtp({ email, options: { shouldCreateUser: true } })`. No redirect is requested.
- Verify: `verifyOtp({ email, token, type: 'email' })`, mapped through the existing `sessionFromSupabase`.
- The account is the Supabase user id. Email is recorded only as session provenance. No code compares addresses, and
  nothing merges households.
- The address and the code are never stored, never bound to, and never reach a diagnostic: results carry a machine code,
  not the service's message (which can quote the address back).
- Resend calls the same request again. The 30-second countdown is presentation only; Supabase's rate limit is the
  authority, and a refusal is shown once and never retried.
- Installed client: `@supabase/supabase-js` and `@supabase/auth-js` 2.116.0. Method shapes were checked against its types.

### Three additions to the frontend shell

The shell was not redesigned. Each of these is one line of presentation that the real backend or an existing product
decision forces. Each is flagged so it can be reversed if unwanted.

1. **"That code didn’t work. Check it, or request a new one."** Supabase answers a mistyped code and an expired code with
   the same response (`403 otp_expired`, confirmed live against Staging). The shell's separate `wrong-code` and
   `expired-code` states are kept for the gallery, but the wired flow cannot honestly claim either, so it shows this.
2. **One quiet line on the account choice when an attempt ends without an account** (provider error, or a binding that
   did not finish). The view state had no slot for it. It reuses the account surface's existing wording. A cancellation
   shows nothing at all.
3. **The EX-01 Apple disclosure** ("Planning to use Her Keys on an Android phone too? Choose Google…"), shown where Apple
   is offered. This is the owner-approved exception recorded in the platform parity registry (PP-D03). It lived on the
   old sign-in panel; with the welcome tree now being where an account is chosen, omitting it would have dropped an
   approved disclosure. Reused word for word, never shown on a reconnect.

## 2. Repository evidence

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Full suite at the unmodified frontend commit, clean tree | 3630 / 3631. The one failure is the Meals boundary scan (section 4) |
| Full suite on this branch | 3706 / 3706 |
| New suites | `tests/emailOtp.test.mjs`, `tests/emailOtpProvider.test.mjs`, `tests/welcomeAuthFlow.test.mjs`; `tests/routeAccess.test.mjs` rewritten |
| Timing-sensitive Talk It Out reader assertions | Did not fail in any run on this branch or at baseline |
| Backend protection, release identity, `expo install --check`, Expo Doctor (21/21), public and introspect config | Pass |
| Android bundle export | Succeeds; the bundle contains the welcome tree's strings |
| Dependencies / lockfile | Unchanged |

`tests/welcomeAuthFlow.test.mjs` renders the real shell and the real controller against a real `AccountRuntime`, with
only the provider adapters, the email port, the cloud RPCs and the keychain scripted. It presses the controls and types
into the fields.

What these tests do **not** prove: anything on a device, anything against a live provider, or that an email arrives.

## 3. Auth configuration inventory

### How it was read

- Each project's public `/auth/v1/settings` and `/auth/v1/authorize` endpoints, with the project's own publishable key.
- Google's own response to each project's authorize URL.
- Aggregate, read-only counts from `auth.users` / `auth.identities`.
- On Staging only: two failed-by-construction requests for an address under the reserved `.invalid` TLD. No user was
  created, no email was sent, no session was issued.

### What could not be read, and why

The Supabase dashboard is not signed in in the tooling this pass had, the Supabase connector exposes no auth
configuration, and the local Supabase CLI is logged into a different organization. So these are **unknown for both
environments**: Site URL, the redirect allow-list, email templates, SMTP, rate limits, OTP length and expiry, session
and JWT settings, and the full list of Apple client IDs. Google Cloud was not inspected directly either.

### Inventory

| Setting | Expected | Staging `fhhudicklmpofuzkxeqe` | Production `npykvnxnehlsdlbumzwk` | Action |
| --- | --- | --- | --- | --- |
| Auth service | — | GoTrue v2.197.0 | GoTrue v2.197.0 | None |
| Email provider | Enabled | Enabled | Enabled | None |
| Google provider | Enabled | Enabled | Enabled | None |
| Apple provider | Enabled | Enabled | Enabled | None |
| Sign-ups | Allowed | Allowed | Allowed | None |
| Confirm email (`mailer_autoconfirm`) | Either | On (`false`) | On (`false`) | See email templates |
| Google identity client | The original Web identity client `857660202409-109l3…` | **`857660202409-mrhq0…` — an installed (native) client** | `857660202409-109l3…` | **Staging: owner must set the Web identity client** |
| Google callback sent to Google | `https://<ref>.supabase.co/auth/v1/callback` | Correct URL | Correct URL | None |
| Google's verdict on client + callback | Sign-in page | **`redirect_uri_mismatch`** | Sign-in page (`/v3/signin/identifier`) | Staging: follows from the client fix |
| Calendar client used for sign-in | No | No | No | None |
| Apple client id used for the web flow | — | `com.herkeys.app` (the app id) | `com.herkeys.app.auth` (a services id) | Verify the full list in both |
| Apple accepts the native token audience `com.herkeys.app` | Yes | Likely (it is the primary id) | **Unknown** | Owner to confirm it is in Production's client ID list |
| Mobile redirect `herkeys://auth/callback` allowed | Yes | Unknown | Unknown | Owner to confirm in both |
| Email templates carry `{{ .Token }}` (Confirm signup **and** Magic Link) | Yes | Unknown | Unknown | Owner to confirm or add in both |
| OTP length | 6 (the shell's field is 6 digits) | Unknown | Unknown | Owner to confirm |
| Mail delivery (custom SMTP) | A Her Keys sender | Unknown | Unknown | Owner to confirm |
| Users / identities / households | — | 0 / 0 / 0 | 0 / 0 / 0 | None |
| `herkeys-ai` Edge Function | Deployed | **Not deployed** | Deployed v1, `verify_jwt` true | Staging drift; outside this pass |

Live confirmations on Staging: verifying a bad code returns `403 otp_expired`; requesting a code with sign-up disallowed
for an unknown address returns `422 otp_disabled` (the email OTP endpoint is live).

### Parity

| Setting / path | Staging | Production | Class |
| --- | --- | --- | --- |
| Google provider enabled | Yes | Yes | Expected |
| Google identity client | Installed client `…mrhq0…` | Web identity client `…109l3…` | **Drift — requires change on Staging** |
| Google → Supabase callback | Own project URL | Own project URL | Expected |
| Google accepts client + callback | No (`redirect_uri_mismatch`) | Yes | **Drift — requires change on Staging** |
| Mobile redirect allow-list / `herkeys://auth/callback` | Unknown | Unknown | Unverified |
| Google OAuth consent access for test users | Unknown | Unknown | Unverified |
| Apple provider enabled | Yes | Yes | Expected |
| Apple provider identity | `com.herkeys.app` | `com.herkeys.app.auth` | Unclassified until the full client ID lists are seen |
| Email auth enabled | Yes | Yes | Expected |
| Email OTP behavior (template, length, expiry, sender) | Unknown | Unknown | Unverified |
| Session behavior | Unknown | Unknown | Unverified |
| `herkeys-ai` deployed | No | Yes | Drift (not auth; noted) |

No difference was changed. Only the Google client is verified drift, and correcting it needs the dashboard and the
client's secret, which this pass could not and should not enter.

### Cross-provider identity

Not observable yet: neither environment has a single user. What Supabase does when one verified address arrives through
two methods (link them to one user, or create two) must be observed on Staging during device testing and recorded here
before Production is promoted. The app's position does not depend on the answer — the account is the user id, and no
code merges on email — but two users for one person would mean two households, which is a product question for the
owner, not something to paper over in the client.

## 4. Meals boundary scanner

The welcome frontend commit changed check H in `scripts-dev/meals-boundary-scan.cjs`. Audited, found too broad, repaired.

- **Finding 1.** The change skipped every lane branch already in HEAD's history when asking whether someone else holds
  an integration-claimed version. That fixes its false positive, but every *merged* feature lane is also in HEAD's
  history, so they all stopped being witnesses and the check lost the case it exists for.
- **Finding 2.** The same commit registered the `HK-AI-02` lane with none of that lane's files, so a clean checkout
  failed check H. It passed only in a shared checkout that held those files uncommitted.
- **Repair.** A lane may declare a stacked `base`; the scanner proves it from git and only then lets that lane inherit.
  Every parallel lane is a witness again. A stacked lane's own claims are measured from its base. The rule is extracted
  as `laneRegister()` and its known-invalid cases are pinned in `tests/meals/boundary.test.mjs` (`[BV7]`). The unbuilt
  `HK-AI-02` entry is removed; that lane registers with its own files.
- Checks A–G (migrations, schemas, tables, sync kinds, shared-file accounting, secret scan, sibling ancestry) are
  untouched.

## 5. What the owner needs to do before device testing can pass

1. **Staging Google client.** In Staging's Supabase Google provider, set the client ID and secret of the original Web
   identity client (`857660202409-109l3…`), the same one Production uses. Confirm that client's authorized redirect URIs
   in Google Cloud include `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback`.
2. **Redirect allow-list, both projects.** Confirm `herkeys://auth/callback` is in Authentication → URL Configuration.
   Leave `herkeys://calendar-connected` and everything else as it is.
3. **Email templates, both projects.** The **Confirm signup** and **Magic Link** templates must each include
   `{{ .Token }}`. A new address receives Confirm signup (Confirm email is on); a returning one receives Magic Link. A
   template with only `{{ .ConfirmationURL }}` sends a link and no code, and the app's code step cannot be completed.
   Keep the existing branding; add the token line.
4. **OTP length.** Confirm it is 6.
5. **Mail delivery.** Supabase's built-in sender delivers only to the organization's own team addresses and is rate
   limited, so real users need a custom SMTP sender for Her Keys. None was visible to this pass.
6. **Apple, Production.** Confirm `com.herkeys.app` is among the Apple provider's client IDs. The native sheet's token
   is issued to the app id, and the primary id configured there is the services id.

After that, on a device against Staging: Google sign-in end to end, email OTP end to end (new address, wrong code,
resend, same address again), sign out and back in, a second account for quarantine, and the cross-provider observation
above. Apple needs an iOS device.

## 6. Rollback

- **Repository.** The integration is four commits on its own branch, on top of `69af50f`. Nothing was merged anywhere.
  Dropping the branch, or building from `69af50f` / `0cf041a`, restores the previous behavior exactly.
- **Environments.** Nothing was changed in Staging or Production, so there is nothing to roll back. No migration, no
  Edge Function deployment, no credential created or rotated.

## 7. Known items

- **P1 (environment).** Staging Google sign-in cannot work until the client is corrected (owner action 1).
- **P1 (environment, unverified).** Email OTP delivery of a typed code depends on templates and a sender nobody has yet
  confirmed (owner actions 3–5).
- **P2, open decision OD-WA-01 — demo data mode.** A development build defaults to demo data mode
  (`src/config/dataMode.ts`): the fictional Ellis household. That household can never be claimed by an account (existing
  rule, `refuseDemo`), so under the identity gate a default development build now stops at the welcome tree, and a
  sign-in on it ends in "That did not go through" — which looks like an authentication failure and is not one.
  **Test sign-in on a build with `EXPO_PUBLIC_HERKEYS_DATA_MODE=empty`** (preview and production builds already are).
  Whether the fictional household should open without an account in internal builds is the owner's call: it is the only
  thing that would be a guest path, it would exist only where the data is fictional, and it is one line in
  `routeAccess.ts`. It is not implemented.
- **P2.** A build with no `EXPO_PUBLIC_SUPABASE_*` configuration now stops at Welcome, because nobody can sign in.
  Before, it ran locally. Release profiles must carry their backend configuration.
- **P2.** `herkeys-ai` is not deployed on Staging, so Talk It Out's server path cannot be exercised there.
- **P3.** Launch shows the settling presentation for as long as the session restore takes (one network round trip).
  Holding the native splash through it instead is a polish option.
- **P3.** Existing local-only households from before this change must sign in once; their household is then claimed by
  the existing claim path.
- **P3.** No Terms or Privacy destinations exist in the app, so the account choice shows no legal links.
- **P4.** The shell's `wrong-code` and `expired-code` states are unreachable from the live flow (see section 1).
