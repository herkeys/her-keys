# Build 2A — Production service closeout (P-1 … P-5)

Date: 2026-10-13. Owner authorization: given in chat for P-1…P-5 (changes listed per item). Baseline SHA `f965055`.
Projects: Production `npykvnxnehlsdlbumzwk` ("Her Keys Production"), Staging `fhhudicklmpofuzkxeqe` ("Her Keys Staging"), both in "herkeys's Org".
Method: Supabase dashboard in the in-app browser (owner signed in; credentials never typed by the agent). No migration, RLS change, Edge Function redeploy or new Production identity.
No secret value, API key, JWT, recovery code or SMTP password appears here or was printed; secrets are compared only by the dashboard's SHA-256 digest.

## Summary

| Item | Verdict | Change made |
|---|---|---|
| P-1 AI consent enforcement | **Configuration PASS; authenticated server-side refusal test NOT RUN** (runtime enforcement is NOT claimed from the secret digest alone) | Staging secret created; Production already correct |
| P-2 Email OTP length | **PASS** | Production 8 → 6 |
| P-3 SMTP, templates, redirects | **Configuration + SMTP delivery PASS; app-side recovery (code entry, password reset) NOT RUN** | Two templates replaced; SMTP/Site URL/redirects already correct |
| P-4 Welcome email | **Prerequisites verified; activation PENDING the owner's six-digit confirmation; all runtime verification NOT RUN** | none yet |
| P-5 Password security | **PASS (min length) / leaked-password protection BLOCKED_PLAN_REQUIREMENT** | Min length 6 → 8 on both |

## P-1 — `HER_KEYS_AI_REQUIRE_CONSENT`

| | Production | Staging |
|---|---|---|
| Before | present, updated 2026-10-09 15:47:38Z; digest `b5bea41b…e12b` = SHA-256 of `true` | **absent** |
| Change | none (already correct) | secret created, value `true` (2026-10-13 20:26:29Z) |
| Read-back | digest `b5bea41b…e12b` | digest `b5bea41b…e12b` |
| Rollback | delete or set `false` | delete the secret |

`herkeys-ai` was not redeployed (secrets are read at invocation). Runtime refusal (declined/missing consent → `403 ai_processing_consent_required`, Gemini not called) and the consenting-fixture control were **not executed**: they need a user session token for a declined account (Production `4efe7570-…` holds a current declined `ai_processing` receipt) and a Staging fixture with a granted receipt. No artificial receipt was written. Open for the owner (a session token must not be pasted in chat).

## P-2 — Production email OTP length

Before: 8 digits, expiry 3600 s. Change: length → 6. After (dashboard reload): length 6, expiry 3600 s unchanged.
Staging was already 6 / 3600 s; not touched. Rollback: set Email OTP length back to 8.
Evidence of a real code: the Production recovery email (below) was sent and delivered; the digit count is to be read from the mailbox by the owner (the agent deliberately did not open the message body, which contains the code).

## P-5 — Password security

| | Production | Staging |
|---|---|---|
| Min length before → after | 6 → **8** | 6 → **8** |
| Leaked-password protection | off → **unchanged**: the save was refused, "Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up" → `BLOCKED_PLAN_REQUIREMENT` | not attempted (same organization/plan) |
| Password requirements | none (unchanged) | none (unchanged) |

Verification: Staging `POST /auth/v1/signup` with a 7-character password and a `.invalid` address → `422 weak_password "Password should be at least 8 characters."`, no user created. Production was verified by dashboard read-back after reload only: a signup probe against Production was deliberately not run because a mistaken acceptance would create a Production identity. Existing accounts and sessions are untouched (no user data was written). Rollback: set min length back to 6.

## P-3 — Production SMTP, templates, redirects

| Setting | Before | After |
|---|---|---|
| Custom SMTP | enabled; `smtp.resend.com`:465, user `resend`, sender `accounts@herkeys.app`, name "Her Keys", min interval 60 s; password stored (hidden) | unchanged (already correct) |
| Confirm sign up subject | `Confirm your email address` | `Confirm your Her Keys email` |
| Confirm sign up body | default: `<h2>Confirm your email address</h2>` + plain `{{ .ConfirmationURL }}` link (184 chars) | `supabase/email-templates/herkeys-confirm-signup.html` (link variable kept) |
| Reset password subject | `Reset your password` | `Your Her Keys password reset code` |
| Reset password body | default link template using `{{ .ConfirmationURL }}` (no code) | `supabase/email-templates/herkeys-recovery.html`, renders `{{ .Token }}`, no Resend variables |
| Site URL | `https://herkeys.app` | unchanged (already correct; site returns HTTP 200) |
| Redirect allow-list | exactly `herkeys://auth/callback`, no wildcards | unchanged |

Both templates read back after reload with the new subject and body. Rollback: re-enter the previous subject/body above (the original default bodies are recorded verbatim in the session transcript and are Supabase's stock templates) or choose "Reset to default" in the template editor.

Real delivery test (authorized Production test account `4efe7570-…` only, address masked here): one `POST /auth/v1/recover` → HTTP 200 at 20:36:37Z. Resend shows **one** message to that recipient, subject "Your Her Keys password reset code", status **delivered**, sent 20:36:38Z, provider message id present (Amazon SES id). This proves the stored SMTP credential works.
Resend protection: an immediate second request → `429 over_email_send_rate_limit` ("only after 41 seconds"), no second message. Expiry: 3600 s.
**Pending (owner):** read the code in the mailbox, confirm it is **6 digits**, and complete a password reset in the app with the authorized account. Until then P-3 functional recovery is unproven.

## P-4 — Welcome email

Not yet activated. Owner direction (2026-10-13): P-4 is not blocked on the whole password-reset journey; activate once the six-digit email format is confirmed by the owner, Resend credentials are valid, the welcome template is published and the eligible-recipient scope is confirmed.

Preconditions as read:
- `RESEND_API_KEY` present in Production (updated 2026-10-09). Presence is not validity; it is first exercised by the real welcome send.
- Function `herkeys-welcome-email` v2 ACTIVE, `verify_jwt` true; answers `503 {"status":"disabled"}` while the flag is off. Source read: requires `SUPABASE_URL` = the Production URL, a **valid user bearer token** (the recipient is the token's own confirmed email, never a request body), a non-anonymous account created within the last 30 days, then an atomic `herkeys_claim_welcome_email` claim, then a Resend send with idempotency key `herkeys-welcome-v1-<user id>`, then the receipt is updated to `sent` with `provider_message_id`.
- Resend template `herkeys-welcome-v1` ("Her Keys | Welcome Email"): **published** (read 2026-10-13).
- Eligible population (read-only SQL, 2026-10-13): `auth.users` = 1 row, **1 eligible** (confirmed, non-anonymous, created 2026-10-09, inside the 30-day window) = the authorized test account; `herkeys_welcome_email_receipts` = **0** rows. No other account can receive a welcome email.
- Trigger: the app calls the function itself after an account binds (`requestWelcomeEmailAfterBinding`, `src/store/AccountProvider.tsx`). The single welcome send therefore happens when the authorized account signs in on a device running this code; an agent cannot trigger it without that user's session, and no JWT is requested or shared in chat.
- Pending: owner confirmation of the six-digit format; then set `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true` (rollback: delete the secret or set it to anything but `true`).

## Rollback references

Dashboard "before" values are recorded in the tables above. No setting outside P-1…P-5 was changed.

## Runtime test ledger (executed evidence only)

| Test | Result | Evidence / reason |
|---|---|---|
| Supabase SMTP → Resend delivery of the recovery email to the authorized account | **PASS** | HTTP 200 at 20:36:37Z; Resend: one message, subject "Your Her Keys password reset code", status delivered, provider message id present |
| Recovery resend protection | **PASS** | immediate repeat → `429 over_email_send_rate_limit` (60 s interval), no second message |
| Recovery email shows a six-digit code | **NOT RUN** (owner will confirm from the mailbox) | the agent deliberately did not open the message body, which contains the code. Configuration evidence only: Production OTP length reads 6 after reload and the template renders `{{ .Token }}` |
| App password-recovery journey (code entry → new password) | **NOT RUN** | the currently installable app does not contain the Build 2A authentication frontend |
| Direct authenticated `herkeys-ai` call returns `403 ai_processing_consent_required` | **NOT RUN** | needs an authenticated session from the legitimate sign-in flow. Executed control only: unauthenticated request → **401** (owner terminal run of `ai-denial-probe`, before the password prompt). The authorized account's current `ai_processing` receipt is `granted=false` (SQL read), so the expected result is 403 |
| Consenting-fixture control (Staging) | **NOT RUN** | needs a session with a granted receipt |
| Welcome function sends once; receipt with provider message id; Resend delivery; second sign-in sends nothing | **NOT RUN** | flag not yet on; the app invokes the function after account binding in a build with backend = production, and the installable app lacks the frontend; the separate `RESEND_API_KEY` is runtime-unverified until the function sends |
| Weak password rejected | **PASS (Staging, executed)** / Production read-back only | Staging 7-char signup → `422 weak_password`; Production deliberately not probed (a mistaken acceptance would create a Production identity) |
| Welcome email: other recipients | **PASS (scope)** | Production has 1 user, the authorized account; 0 receipts |

## Final P-1…P-5 verdicts (2026-10-13)

| Return | Verdict | Basis |
|---|---|---|
| `P1_AI_CONSENT_ENFORCEMENT` | **PASS (configuration); runtime refusal NOT RUN** | secret `true` in both projects; no claim of runtime enforcement |
| `P2_EMAIL_OTP_LENGTH` | **PASS** (configuration read back); six-digit email format NOT RUN | 8 → 6 |
| `P3_AUTH_SMTP_TEMPLATES_REDIRECTS` | **PASS** (config + real SMTP delivery); app recovery NOT RUN | templates replaced, SMTP/Site URL/redirects verified |
| `P4_WELCOME_EMAIL_DELIVERY` | **BLOCKED** | activation waits on the owner's six-digit confirmation; delivery verification needs the Build 2A frontend on a Production-targeting build |
| `P5_PASSWORD_SECURITY` | **PASS (min length 8, both projects); leaked-password protection `BLOCKED_PLAN_REQUIREMENT`** | no plan change |
| `PRODUCTION_SERVICES_VERIFIED` | **BLOCKED** | until P-4 activation and the NOT RUN runtime tests execute |

## Handoff to Build 2B

Owner priority list, recorded as received: (1) verify the certified Build 2A SHA and release identity; (2) produce a new internal Android APK with the complete Welcome Tree and authentication frontend; (3) target Her Keys Production with consent enforcement enabled; (4) install on the test device or emulator; (5) test signup, login, email confirmation and recovery through the real frontend; (6) use a session from the app's legitimate sign-in to verify AI consent refusal and one-time welcome delivery; (7) full Android device certification. The APK is not conditioned on those runtime tests passing; every unexecuted test stays NOT RUN. No store submission or external tester distribution.

Facts Build 2B needs from this closeout:
- Use EAS profile **`smoke-production-android`** (internal APK, `EXPO_PUBLIC_HERKEYS_BACKEND=production`, `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true`). The `development` and `preview` profiles target **Staging**, and the app only calls `herkeys-welcome-email` when backend = production and the URL is the Production project.
- The welcome call fires on every bound startup (`src/store/AccountProvider.tsx`); the server dedupes by user (`herkeys_claim_welcome_email`), so a second launch must return `already_claimed`.
- To finish P-4: set Production secret `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true` (dashboard → Edge Functions → Secrets), read back the digest (`b5bea41b…e12b` = SHA-256 of `true`), sign in once with the authorized account, then check exactly one `herkeys_welcome_email_receipts` row (`status='sent'`, `provider_message_id` set), one Resend message, and none new on relaunch. Rollback: delete the secret.
- The direct AI-denial probe is reusable once a legitimate session exists: `herkeys-ai` runs the consent check before it reads the body, so `{}` is enough to see `403 ai_processing_consent_required` for a declined account.
