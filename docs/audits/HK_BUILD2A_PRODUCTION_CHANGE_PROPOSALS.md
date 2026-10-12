# Build 2A — Production change proposals P-1 … P-5 (NOT EXECUTED)

Production project `npykvnxnehlsdlbumzwk` (Her Keys Production). **Nothing below has been done, and nothing may be done without a separate, named
owner approval for that item.** Each proposal lists the exact change, why, the risk, what to record *before* changing it (so rollback is real), how to
verify, and how to roll back. Facts cited were measured read-only on 2026-10-12; see `HK_BUILD2A_BACKEND_PARITY_20261012.md`.

Two limits apply to every item: **no secret value is ever printed, logged, pasted or screenshotted** (names and presence only); and verification uses
**only** the existing authorized identity `4efe7570-8ed0-4408-93ad-cc76cb5444aa`, or an account the owner names in writing — no new Production account is created
by any of this.

Recommended order: P-2 → P-3 → *(verify mail)* → P-1 → P-4 → P-5. Do each on **Staging first** where a Staging equivalent exists (P-1, P-5; P-2/P-3 are Production-only
because Staging's mail path is the provider default).

## P-1 — Make a declined AI choice binding on the server

| | |
|---|---|
| **Exact change** | In Supabase → Edge Functions → Secrets (Staging first, then Production), create the secret **`HER_KEYS_AI_REQUIRE_CONSENT`** with the value **`true`**. No code change and no redeploy: `herkeys-ai` reads `Deno.env.get('HER_KEYS_AI_REQUIRE_CONSENT')` on every request. |
| **Why** | The deployed function (Production v4, Staging v3, identical bundle) refuses with `403 ai_processing_consent_required` only when this variable is exactly `true`. Whether it is set is **unreadable from here**, so today a declined account could call the function directly and reach Gemini. The one Production identity (`4efe7570-…`) has a **current declined** `ai_processing` receipt (2026-10-09 16:15 UTC) — the exact case this guards. (B2A-BE-01) |
| **Risk** | Any account without a current granted `ai_processing` receipt at version `ai-data-processing-initial-v1` gets `403` and the app falls back to its deterministic engine (it already treats an unavailable AI as a fallback). Builds made before the consent gate shipped have no receipt, so their users lose AI until they pass the gate. The version literal is hard-coded in the function and in `src/domain/consent.ts`; a test now pins them together, but a future version bump needs a function redeploy at the same time. The function checks with the **service role**, so an RLS mistake cannot hide a refusal. |
| **Capture before** | Whether the secret already exists (name only). Current function version and bundle hash (`1e43c8c9…`, both projects). |
| **Verify (evidence needed)** | (1) Secret **name** listed in both projects. (2) With a short-lived access token for `4efe7570-…`: `POST /functions/v1/herkeys-ai` with a valid minimal body → **`403`**, body `{"status":"unavailable","reason":"ai_processing_consent_required",…}`, and **no `[herkeys-ai]` provider log line** for that `requestId` (Gemini not called) in the function logs. (3) A Staging account with a **granted** receipt → `200`, one provider log line with `providerStatus: 200`. (4) No token / garbage token / anon-role token → still `401` (already observed). Record the tokens' *expiry only*, never the token. |
| **Rollback** | Delete the secret, or set it to anything other than `true`. Takes effect on the next request; nothing to redeploy. |
| **Access needed** | Supabase dashboard (Edge Function secrets) for both projects; a user token for the test identity (the owner signs in once and supplies a short-lived token through an approved channel). |

## P-2 — Production email OTP length 8 → 6

| | |
|---|---|
| **Exact change** | Supabase dashboard → Authentication → Providers → **Email** panel (`/auth/providers?provider=Email`) → **Email OTP Length**: set **6** (recorded as **8** on 2026-10-08; Staging is 6). |
| **Why** | The app's code field and the password-recovery screen accept **six** digits (`OTP_CODE_LENGTH = 6`). With 8-digit codes a Production recovery code cannot be entered. **Unverified today** (dashboard not signed in). (B2A-BE-02) |
| **Risk** | Affects every email code and recovery code issued afterwards; codes already issued keep their length until they expire (expiry 3,600 s). Low blast radius: Production holds one user. |
| **Capture before** | The current value (a screenshot of the field only, nothing else on the page) and the expiry. |
| **Verify** | Request a password-recovery code for `4efe7570-…`'s own mailbox (or an owner-named mailbox); count the digits in the message = 6; enter it in the app and reach the new-password step. Record the From address, the digit count and the outcome — never the code. |
| **Rollback** | Set the field back to the captured value (8). |
| **Depends on** | P-3 (a recovery email must actually be deliverable and render the token). |

## P-3 — Production email delivery: SMTP, templates, redirects

| | |
|---|---|
| **Exact change** | (a) Authentication → SMTP: enable **custom SMTP**; sender **`accounts@herkeys.app`**, sender name **Her Keys**, host **`smtp.resend.com`**, port **465** (or 587/TLS), username **`resend`**, password = the Resend sending key limited to `herkeys.app` — **entered by the owner in the dashboard, never by this agent or in chat**. Keep **Confirm email = on**. (b) Authentication → Emails (unlocked by (a)): **Confirm signup** subject *Confirm your Her Keys email*, body = `supabase/email-templates/herkeys-confirm-signup.html` (uses the confirmation link variable); **Reset password** subject *Your Her Keys password reset code*, body = `supabase/email-templates/herkeys-recovery.html` (must render the **`{{ .Token }}`** variable as digits). If any code-by-email sign-in is ever offered, its Magic Link template needs `{{ .Token }}` too. (c) Authentication → URL configuration: **Site URL** `http://localhost:3000` → **`https://herkeys.app`** *only after that site is confirmed healthy*; keep the redirect allow-list to the exact **`herkeys://auth/callback`** (plus any Calendar redirect already required); **no wildcards**. |
| **Why** | Today confirmation and recovery emails cannot be delivered or branded: custom SMTP is off, and on this plan the templates are **locked** until it exists (recorded 2026-10-05/08; re-read blocked today). A confirmation link that lands on `localhost` is a dead end for a real user. |
| **Risk** | A wrong redirect or Site URL breaks every confirmation link; wrong SMTP credentials silently drop mail; a leaked SMTP password is a sending key. Resend free-tier limits and domain reputation (SPF/DKIM were recorded verified for `herkeys.app`). Changing **Site URL** affects OAuth fallback redirects. |
| **Capture before** | The three current values (SMTP on/off and host, Site URL, redirect list) and the current template subjects/bodies (templates are not secret) — saved to the evidence folder so each can be restored. |
| **Verify** | Send a **recovery** email to the authorized identity's own mailbox (no signup is created): confirm in the delivered message the **From** (`accounts@herkeys.app`), DKIM/SPF **pass**, the **six-digit** code, and for a confirmation link only that its **host** is the intended one (do not click through with the real account unless the owner says so). Record headers with the recipient and code masked. |
| **Rollback** | Restore the captured Site URL, redirect list and template bodies; switch custom SMTP off (default sender resumes, templates lock again). |
| **Access needed** | Supabase dashboard (Authentication); the owner's Resend key entered by the owner; a mailbox the owner controls. |

## P-4 — Switch on the one-time welcome email

| | |
|---|---|
| **Exact change** | Production **only**: Edge Function secret **`HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED`** = **`true`**. (The function also hard-requires `SUPABASE_URL` = the Production URL, so it cannot send from Staging.) Preconditions: P-3 verified; secret **`RESEND_API_KEY`** present *and valid for `accounts@herkeys.app`* (presence ≠ validity — a Resend-side key name is not proof the Supabase secret matches); template alias `herkeys-welcome-v1` published. |
| **Why** | The function answers `503 {"status":"disabled"}` today (observed 2026-10-12) and the receipt table holds **0** rows: welcome email is off. The V2 acceptance requires "exactly one welcome after a newly confirmed signup". |
| **Risk** | Any **confirmed** account created within the last **30 days** that signs in on a build that requests it will be emailed once. The authorized identity (its consent receipts were recorded 2026-10-09, so it was created on or before that day, i.e. within 30 days) is therefore eligible — an intended test, but it sends a real email; the owner should expect it. Delivery is idempotent: the claim function never re-claims a `sent` row and the provider call carries an idempotency key; a transport failure is retried with the **same** key, never a new one. |
| **Capture before** | Secret **names** present (no values); receipt count (0). |
| **Verify** | After the owner's authorized sign-in: **one** row in `herkeys_welcome_email_receipts` for that account with `status='sent'`, `provider_message_id` set, `attempts=1`; **one** message in the controlled mailbox from `accounts@herkeys.app`; a second sign-in changes nothing and the function answers `already_claimed`. Never mark a receipt `sent` by hand. |
| **Rollback** | Unset the secret: the function returns `disabled` again. Receipts are **kept** (they are the duplicate guard). |
| **Depends on** | P-3. |

## P-5 — Password policy on the server

| | |
|---|---|
| **Exact change** | Authentication → Providers → **Email** panel (the password-length and leaked-password settings live with the email provider; the exact panel layout varies by dashboard version): set **minimum password length 8** (matches the client's 8), and enable **leaked-password protection** (HaveIBeenPwned check) **if the plan allows it** (it may require a paid tier; the organisation was on the free plan on 2026-10-05). Optional character requirements are **not** proposed. |
| **Why** | Email/password sign-up now exists. The client refuses fewer than 8 characters, but a direct call to the Auth API does not go through the client, and the server-side minimum is **unread**. Both projects report the advisor `auth_leaked_password_protection` (disabled). (B2A-BE-03) |
| **Risk** | A sign-up or password change that the server now refuses reaches the app as the generic "That did not work. Check your details and try again." (the client does not explain *weak password*) — a copy gap to fix before this ships to users. Existing weak passwords are unaffected until changed. |
| **Capture before** | The current minimum length and leaked-password setting. |
| **Verify** | Read the settings back; on **Staging** (apply there first), `POST /auth/v1/signup` with an address under the reserved `.invalid` TLD and a 6-character password → **`422 weak_password`** before any user is created; confirm the user count is unchanged. |
| **Rollback** | Restore the captured minimum length; disable the leaked-password check. |
| **Access needed** | Supabase dashboard; plan check for the leaked-password feature. |

## Not proposed

* No migration, no RLS change, no schema change, no Edge Function redeploy, no change to existing customer data, no RevenueCat change, no new Production account.
* Server-side revocation of other sessions after a password reset (B2A-BE-05) is a **behaviour to observe first** (it needs two live sessions), not a setting to change; it is OD-2A-06.
