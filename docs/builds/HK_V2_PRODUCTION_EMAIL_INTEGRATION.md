# Her Keys V2 — Production Transactional Email

**Target:** Her Keys Production `npykvnxnehlsdlbumzwk`. **Do not** deploy to K Scan. Staging SMTP is optional and not required for launch.  
**State:** repository work prepared; external Supabase Production settings NOT verified or applied (connector currently lists only K Scan projects). **Do not claim live email delivery until a real receipt is tested.**

## Published Resend assets

- Verified domain: `herkeys.app`
- Sender: `Her Keys <accounts@herkeys.app>`
- Welcome template alias: `herkeys-welcome-v1` (Resend template `c88ebcf5-7f58-4763-b902-e3938e477365`)
- Password reset template alias: `herkeys-password-reset-v1` (Resend template `b693f0b0-dc1b-4bf1-adab-3690f591b33f`)

## Production authentication mail: Supabase → Resend SMTP

Production Supabase Auth must retain responsibility for creating the token, its expiration, verification and password update. Resend must only deliver that token.

1. Open **https://supabase.com/dashboard/project/npykvnxnehlsdlbumzwk/auth/smtp** (or Authentication → SMTP Settings).
2. Create a **sending-only** Resend API key restricted to the verified `herkeys.app` domain. **Do not store it in the mobile app, EAS EXPO_PUBLIC vars, repository or chat.**
3. Enable Custom SMTP in **Production** (not Staging):
   - From: `accounts@herkeys.app`; sender name: `Her Keys`
   - Server: `smtp.resend.com`; port: `465` (or `587` with STARTTLS when required by the provider/network)
   - Username: `resend`; password: the domain-scoped Resend sending API key
4. Open **Authentication → Email Templates → Reset Password** in Production. Set subject to **Your Her Keys password reset code**. Paste the version-controlled `supabase/email-templates/herkeys-recovery.html` contents. **Supabase uses `{{ .Token }}`, not Resend's `{{{RECOVERY_CODE}}}`.** Do not insert a fixed code or email address.
5. Keep Email provider enabled, email confirmation enforced, and confirm the remaining existing Auth templates (Confirm Signup, Magic Link) use a working code/link. Email OTP in the app needs a six-digit `{{ .Token }}` in its corresponding Supabase email template. Do not turn off confirmation to avoid mail setup.
6. Check existing Auth email rate limits and adjust responsibly for real users; set redirect allowlist and website according to the already-approved identity flow.
7. Test a *real* disposable email/password account on the Production backend: request password reset, confirm arrival from `accounts@herkeys.app`, use the code in the app, verify session is isolated from household, change the password, and sign in again. Negative cases: invalid code, expired code, repeated request, unknown email, service outage and account isolation.

**Architecture:** Custom SMTP + Supabase's Recovery template is the active Auth path. The published Resend `herkeys-password-reset-v1` template is a visual/reference asset and **is not automatically used by Supabase SMTP**. To use the published Resend template directly instead would require a complete Supabase Send Email Hook for *every* Auth email type, with appropriate security testing; do not enable such a hook alongside this SMTP setup.

## Production welcome mail: verified bound account → Edge Function → Resend

1. Review and apply `supabase/migrations/20261009020000_herkeys_welcome_email_receipts.sql` to **Production only**, using the repository migration framework, after checking live migration parity. Never mark it applied based on code alone.
2. Deploy `supabase/functions/herkeys-welcome-email/index.ts` with JWT verification enabled to **Production only**. It checks the Supabase user from the request bearer, requires email confirmation and a newly created account, and refuses to send outside Her Keys Production.
3. Set **Production Supabase Edge Function secrets** `RESEND_HERKEYS_SENDING_API_KEY` (sending-only, domain scoped) and `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true` after the migration and function pass tests. Leave the server switch absent/off until ready. **Never prefix private values with `EXPO_PUBLIC_`**.
4. The Her Keys mobile composition invokes this endpoint only against the exact Production Supabase URL after an account reaches `accountBound`. It passes no recipient; the server obtains the email from the verified JWT. The function uses `herkeys-welcome-v1` and a stable Resend idempotency key per Supabase user. A per-user database ledger prevents repeat welcome sends across sessions and devices.
5. Test new verified accounts via Email, Google and Apple; test returning logins, different device, reinstall, rapid retries and expired/degraded sessions. Do not certify an already sent Resend request as **delivered** without checking actual receiving mailbox and Resend delivery status.

### Important failure boundaries

- Welcome email must not fire from a Staging build, unverified email, anonymous account, account conflict, or degraded session.
- A failed welcome send must never prevent account access.
- An unresolved `sending` claim older than the Resend 24-hour idempotency period must be reviewed by an operator, not silently resent. The ledger records provider **acceptance**, not guaranteed inbox placement.
- Resend keys remain server-only. Do not expose token, user email, message body or private key in logs.
- The Production welcome-email server enable flag remains **off** until data layer, authentication, credentials, and delivery evidence are verified.

## Release evidence fields

```
HERKEYS_PROD_RESEND_DOMAIN=VERIFIED
HERKEYS_PROD_AUTH_SMTP=UNVERIFIED
HERKEYS_PROD_RECOVERY_TEMPLATE=UNVERIFIED
HERKEYS_PROD_RECOVERY_E2E=BLOCKED
HERKEYS_PROD_WELCOME_MIGRATION=NOT_DEPLOYED
HERKEYS_PROD_WELCOME_FUNCTION=NOT_DEPLOYED
HERKEYS_PROD_WELCOME_SECRET=UNVERIFIED
HERKEYS_PROD_WELCOME_E2E=BLOCKED
HERKEYS_STAGING_SMTP=NOT_REQUIRED
```
