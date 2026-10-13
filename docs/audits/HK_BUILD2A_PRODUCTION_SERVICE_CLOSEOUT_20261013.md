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
| P-3 SMTP, templates, redirects | **PASS pending owner confirmation of functional recovery** | Two templates replaced; SMTP/Site URL/redirects already correct |
| P-4 Welcome email | **NOT STARTED** (gated on P-3 owner confirmation) | none |
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
