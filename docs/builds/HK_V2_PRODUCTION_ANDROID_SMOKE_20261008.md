# HER KEYS V2 — PRODUCTION-BACKEND ANDROID EMULATOR SMOKE

**Execution agent:** Authorized to create **ONE** disposable test user through the normal Her Keys Android onboarding flow on Her Keys **Production** Supabase `npykvnxnehlsdlbumzwk`. Do not fabricate mailbox verification. No broad access or changes to other users, K Scan, policies, SMTP, RLS or release signing.  
**Candidate:** PR #8, `feature/herkeys-email-password-20261008`. Test the exact current HEAD and report SHA.  
**Device:** A dedicated, clean Android emulator. No user-data wipes on existing physical devices or shared emulator installations.  
**Artifact:** EAS `smoke-production-android` makes an **internal APK** pointing only to the Production Supabase project. Not a Play Store release.

## 0. Preconditions / environmental truth

- Repo clean (or use a clean worktree); fetch latest PR #8 head; record `git rev-parse HEAD`.
- Verify `eas.json` has `smoke-production-android` / `environment=production` / `distribution=internal` / `android.buildType=apk` / `EXPO_PUBLIC_HERKEYS_BACKEND=production`.
- Assert resolved `EXPO_PUBLIC_SUPABASE_URL` host is **exactly** `npykvnxnehlsdlbumzwk.supabase.co`; build must not include `RESEND_API_KEY`, Supabase service role, or private secrets.
- Confirm production Auth email confirmation, SMTP provider, signup email template, Reset Password token template and allowed redirects through authorized project settings. **Do not modify settings as part of the smoke**; report `BLOCKED-CONFIG` if missing.
- The verified Resend sender `accounts@herkeys.app` and templates `herkeys-welcome-v1`, `herkeys-password-reset-v1` must exist. Production welcome Edge Function `herkeys-welcome-email` is deployed with JWT verification; backend secret `RESEND_API_KEY` and kill switch `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true` must actually be present to send. Do not infer a secret from prior user statements.
- Use a disposable email address in a mailbox that the agent is legitimately authorized to READ. Do not use a random recipient or someone else's email. Preserve inbox access during recovery. Generate an unpredictable password; do not paste it into CI, terminal logs, screenshots, GitHub or chat.
- If a Production precondition is missing, report it; continue unaffected UI steps but **never classify delivery as PASS**.

## 1. Build and emulator startup

Commands (PowerShell in a clean checkout; adjust project directory without altering release identifiers):

```powershell
git fetch origin
git switch feature/herkeys-email-password-20261008
git pull --ff-only origin feature/herkeys-email-password-20261008
git status --short
git rev-parse HEAD
npm ci
npm run typecheck
npm run verify:release-identity
npx eas-cli build --platform android --profile smoke-production-android --non-interactive
adb devices -l
adb -s emulator-5554 install -r "PATH_TO_DOWNLOADED_APK"
adb -s emulator-5554 shell monkey -p com.heykeys.app -c android.intent.category.LAUNCHER 1
```

Use the emulator ID actually returned by `adb devices -l`; **do not assume `emulator-5554` exists**. Build/download the APK via EAS result URL; install on a dedicated emulator. Never `adb shell pm clear` or uninstall the app on a device with existing household data without explicit approval. If `adb install -r` fails on a signature mismatch, use a fresh emulator; do not alter Play signing, app identity, EAS credentials or production deployment.

## 2. Required walkthrough (capture screenshots, no passwords or OTPs)

1. Launch from cold start. Confirm branding, splash, `Get Started` and `I Already Have An Account`. Android must not offer native Apple sign-in.
2. `Get Started` opens the account-choice tree without an upfront Premium paywall. Select **email and password → Create Account**. Verify password confirmation and validation. Use one disposable mailbox/strong password.
3. Submit signup once. **Verify whether Supabase returns confirmation-required or session:** do not assume signup is complete before proof. Check a real confirmation message was delivered and confirm the email through the actual provided code/link. If confirmation never arrives, mark `BLOCKED-EMAIL`; never bypass confirmation.
4. Sign in with the verified account. Verify the account/household binding and no unexpected sync quarantine, blank screen or route loop. Capture first authenticated route. Test Back navigation from an unauthenticated screen without corrupting auth state.
5. Review **Terms, Privacy, age-18 and AI Data Processing** if present. Do not assume consent is stored merely because a screen renders; the consent gate may not be activated in this candidate. Record `BLOCKED-GATE` when absent.
6. Continue into first-run onboarding / Life Systems Audit. Note paywall positioning; Premium is not supposed to appear before signup. Do not make a real subscription purchase in a smoke without explicit authorization.
7. Check `Her Keys | Welcome Email` delivered **exactly once** to the disposable inbox from `accounts@herkeys.app`. Distinguish provider accepted/delivered from the recipient's actual inbox. Relaunch/re-login and confirm no duplicate.
8. Sign out. `I Already Have An Account` → email/password sign-in. Confirm successful sign-in with disposable credentials.
9. Sign out. `Forgot Password?` → send reset request. Confirm an actual email arrives from `accounts@herkeys.app` with **fresh six-digit** code (not `------` or literal template syntax). Check a bad six-digit code fails. Enter the real code inside the app → set a new strong password → return to Sign In. Confirm old password is rejected and the new one works.
10. Validate request cooldown, disabled/double-submit behavior, cancellation/back navigation, and absence of accidentally bound recovery sessions or other-account data.
11. Reopen the app: check durable login/account association and navigation. Do not screenshot the inbox token, credentials or sensitive content.

## 3. Evidence and scope

Report per step `PASS / FAIL / BLOCKED-CONFIG / BLOCKED-DEVICE / NOT-RUN`, build URL, exact Git SHA, Android emulator model/API level, production project host only, test account's user UUID (no email or credentials), timestamp and sanitized screenshots; include *only* that user's welcome receipt row and delivery status if accessible. Mask email/code in screenshots and logs. If a check fails, record exact visible symptom and minimum reproduction; never solve by disabling confirmation, bypassing RLS, setting service keys in the app, or merging PR #8.

**Cleanup:** Keep the disposable identity after test long enough to investigate delivery, and propose exact-account-only cleanup separately. Do not delete other users, households, or production audit rows. Don't mark the welcome receipt `sent` without a verified provider acceptance.

**Acceptance:** The smoke can only be declared fully `PASS` when the test account confirms, binds, receives exactly one welcome, resets by a real email token, signs in with the new password, and does not bypass legal/AI gates. Source CI success alone is insufficient.

## Known release constraints

- The app currently gates versioned consent under `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true`; do not mistake an unactivated gate for proof of consent persistence.
- `RESEND_API_KEY` in Supabase Edge Functions does not turn on Supabase Auth SMTP; Auth SMTP and its `{{ .Token }}` Recovery template are separately configured.
- The Production welcome sender requires `HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED=true`; its absence is a safe fail-closed result, not evidence that Resend is broken.
- No customer accounts, service credentials, or Production settings need to be altered merely to run this smoke.
