# Her Keys — Email/Password Auth Addition (October 8, 2026)

## Scope

**Branch:** `feature/herkeys-email-password-20261008` (stacked on the protected V2 repair branch). **Status:** implemented in code, pending device/end-to-end verification. This is an additional authentication method; the existing Google, native Apple and six-digit email-code paths remain intact.

### New sign-in path
```
Welcome -> Account choice -> Continue with email and password
        -> Sign in (existing account) OR Create account
        -> Supabase Auth email/password
        -> [session only when the provider returns one]
        -> AccountRuntime common session activation, secure storage,
           RevenueCat account identity, household binding/quarantine
        -> Life Systems Audit / app via the existing route table
```

New account signup uses Supabase `auth.signUp({ email, password })`; existing confirmed users use `auth.signInWithPassword({ email, password })`. Password is kept only in the mounted screen's ephemeral input state, passed to the isolated provider client, and never recorded in Redux/AppState, cloud sync, SecureStore, event logs or response diagnostics. Text inputs are masked by default. Password sign-up requires 8+ characters and a matching second entry.

If **Confirm email** remains ON (the current Her Keys Staging and Production configuration), signup normally returns `user` **without a session**. The app displays a confirmation-required message; **it does not bind the household, assume a valid session, or enter onboarding**. The user confirms their email through the Supabase email link, then signs in with password. Existing OTP passwordless sign-in remains available separately. No auth configuration or backend migration was changed by this code addition.

## Why this is not a substitute for transactional email

Changing to email/password **does not bypass** an enabled Confirm Email policy. Without an approved Her Keys SMTP sender, a newly registered user may be unable to receive a confirmation email. For a controlled Staging test before SMTP, the owner may designate a confirmed **test-only** email/password user provisioned by authorized Supabase personnel using supported dashboard/admin APIs. Do not create test users in Production; do not disable production confirmation or anonymously auto-verify user emails.

If the owner explicitly chooses confirmation-disabled Staging signup for a temporary internal test, record it as an **intentional temporary security delta** and reinstate/test confirmation before Production promotion. Do not switch this automatically.

## Release gates before using email/password for all real users

1. CI and tests for the change; no forgotten cross-platform, identity, sync or release-identity regressions.
2. Staging real-device signup with confirmation ON, deliver email, confirm, then sign in; existing user sign-in; bad password, unavailable network, account switching and restart.
3. Complete **forgot/reset password** and password-change or recovery mechanism using verified Her Keys email templates and a tested callback flow; this is not included in the simple initial implementation.
4. Email sender/domain, SPF/DKIM/DMARC, template/callback policy, rate limiting, abuse controls, email enumeration resistance and secure-session restoration.
5. Device screen size, keyboard, TalkBack/VoiceOver, password auto-fill and show/hide accessibility.
6. Preserve canonical UUID identity and account isolation across Apple/Google/email; never assume matching email means consent to merge households.
7. Production promotion only after Staging proof and owner approval, with matched security behavior in both environments.

## Implementation

- `src/domain/account/emailPassword.ts`: result-only session boundary and script port.
- `src/platform/emailPasswordProvider.ts`: isolated Supabase Auth adapter.
- `src/domain/account/accountRuntime.ts`, `src/store/AccountProvider.tsx` and composition root: one session/binding authority.
- `src/features/welcome/views/EmailPasswordView.tsx`: sign-in/create account UI, secret inputs.
- Welcome pure controller/view state + renderer: choice and confirmation/refusal states.
- Regression: new provider tests, runtime & welcome-flow tests.
- No schema migration, server secret, Project setting, RevenueCat key, Production change or automatic merge.

**Classification:** `CODE_IMPLEMENTED_PENDING_CI_AND_LIVE_STAGING_CERTIFICATION`.
