# Her Keys V2 — P0/P1 execution handoff (2026-10-09)

## Project scope

Her Keys Production project: npykvnxnehlsdlbumzwk. Staging: fhhudicklmpofuzkxeqe. GitHub PR #8, feature/herkeys-email-password-20261008. Never alter K Scan or other customer accounts. Keep PR draft/unmerged until certification. Rebuild the new smoke-production-android APK from the exact green HEAD, not the earlier artifact.

Previously authorized disposable Production Auth UUID: 4efe7570-8ed0-4408-93ad-cc76cb5444aa. Retain it for sign-in and recovery follow-up; request approval before creating additional identities.

## Already repaired in the connected backend

- Resend: herkeys.app verified; RESEND_API_KEY key name present in Resend, templates herkeys-welcome-v1 and herkeys-password-reset-v1 published. This does NOT prove the Supabase Edge secret matches the Resend key.
- Staging and Production: additive v2_account_consents migration applied. RLS and FORCE RLS enabled, anon denied, users owner-only SELECT and INSERT; no UPDATE, DELETE, or client-inserted receipt ID or timestamp. Staging owner/isolation transaction passed and was rolled back with no test rows.
- Her Keys herkeys-ai function v3 deployed in both environments with JWT verification; adds an optional account-scoped backend AI consent guard. It is controlled by HER_KEYS_AI_REQUIRE_CONSENT=true.
- Her Keys Production welcome function v1 was already deployed JWT-required with separate delivery ledger.
- EAS Production and internal smoke APK profiles now compile with EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true. This affects only the NEXT builds.
- Branded Supabase Auth email HTML is versioned at supabase/email-templates/herkeys-confirm-signup.html and supabase/email-templates/herkeys-recovery.html.

## P0-A — Configure real Production SMTP in Supabase (local agent with dashboard session)

Visit https://supabase.com/dashboard/project/npykvnxnehlsdlbumzwk/auth/smtp .
Enable Custom SMTP in HER KEYS Production (not K Scan).
Sender accounts@herkeys.app; display name Her Keys; host smtp.resend.com; port 465 (SSL, or TLS 587 if appropriate); username resend; SMTP password = the authorized Resend sending API token, ideally limited to herkeys.app. Supabase Edge secret RESEND_API_KEY alone does not configure Auth SMTP. Do not print/copy the password into chat, code, screenshots, client env or logs.
Save and verify by sending real signup and recovery emails to a mailbox controlled by the testing agent, inspecting actual From and inbox receipt. Keep confirmation required.

Production Auth Email Templates:
Confirm Signup subject: Confirm your Her Keys email. Paste supabase/email-templates/herkeys-confirm-signup.html (Supabase ConfirmationURL variable).
Reset Password subject: Your Her Keys password reset code. Paste supabase/email-templates/herkeys-recovery.html (Supabase Token variable, must render six digits).
If passwordless OTP login is offered, verify the Supabase Magic Link / OTP template includes the six-digit Token variable compatible with verifyOtp(type email).
Do not use a Resend three-brace variable inside Supabase email templates.

## P1-A — Correct Production Auth redirects

In https://supabase.com/dashboard/project/npykvnxnehlsdlbumzwk/auth/url-configuration replace the localhost fallback with https://herkeys.app after verifying this website is healthy. Retain the approved narrow native OAuth callback herkeys://auth/callback and any existing required Calendar redirects. Avoid wildcard schemes. Verify that a real confirmation email link is accepted and does not leave a malformed localhost redirect. Do not confuse email confirmation with in-app AccountRuntime binding.

## P0-B — Verify and activate Production Edge secrets

In the Her Keys Production Supabase dashboard Edge Functions/Secrets or authorized CLI, inspect secret NAME presence (not the values). Verify RESEND_API_KEY is nonempty and works for the approved sender.
When Auth SMTP and templates are verified, set HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true to activate the Production welcome sender. New verified account binding must produce one welcome receipt and exactly one email in the controlled mailbox. Never manually mark receipt sent, and never invoke sender as a different account.
Set HER_KEYS_AI_REQUIRE_CONSENT=true before declaring AI privacy certified. With a current declined or absent ai_processing receipt, the direct herkeys-ai request must return ai_processing_consent_required and must NOT call Gemini. With current affirmative receipt, it may proceed. This flag must be independently verified without printing the secret.
Secret and Auth configuration changes are NOT supported through the connected Supabase database/Edge deployment actions and therefore must be completed in the Production dashboard/local authorized agent session.

## P0-C — Diagnose and repair Android freezes

Run the exact updated CI-green Android smoke APK on clean disposable AVD. Reproduce on API 37, compare a second supported API level. Do not wipe existing physical device state.
Before/after freeze collect sanitized adb logcat main/system/crash buffers, dumpsys activity processes and ANR traces where available; measure input latency and determine whether sign-in, Supabase binding, sync, RevenueCat refresh, React render churn or emulator host performance is responsible. Mask email, passwords, tokens, URLs carrying codes and household data before sharing.
Fix a proven regression on PR #8 with focused tests, rerun CI, rebuild, retest. Do not alter release identity or Production policy to work around a freeze.

## P0-D — Test new consent gate from updated APK

Confirm legal Terms and Privacy acknowledgement, self-attested age 18+, and explicit yes/no AI Data Processing decision block protected routes until saved. Confirm server-owned versions/recorded_at, four separate current receipts and complete account isolation. Both AI decline and grant must be tested; a decline still permits non-AI features and revokes external AI.
Permissions such as notifications, approximate location and calendar remain optional and cannot bypass mandatory legal choices. Do not persist fake user consent via SQL. AI consent server flag must be ON for full certification.

## Complete smoke acceptance

Start at Welcome / Get Started. Actual signup confirmation FROM accounts@herkeys.app, in-app accountBound state, exactly-one welcome after newly confirmed signup, reliable sign-out/in, real 6-digit Forgot Password flow, new password works and old one fails, stable navigation and cold relaunch, age/legal/AI persisted, AI refusal enforced, and approved Premium placement after the Life Systems Audit. No subscription purchase.

Return: exact commit SHA, GitHub CI URL, APK URL/hash, emulator identifier/API, authorized test account UUID, sanitized screenshots/logs, and PASS/FAIL/BLOCKED for SMTP sender, signup, redirects, recovery token, secret names/flags, one-time welcome, Android stability, consent storage/enforcement, Premium ordering. Do not merge PR or publish store builds until all gates clear.