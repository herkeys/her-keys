# Her Keys V2 recovery engineering and live evidence

Baseline: `6a094ac61fe55a4e1daf48eb3498d4d72540eaf6`, PR #48 merge. Merge-head CI 43470595280 independently verified PASS. The controlled worktree fast-forwarded cleanly; unrelated original-directory changes remain preserved. This report continues the full takeover and does not close the authentication workstream.

## Access, plan and supported contract

The owner confirmed there is no verified Her Keys Auth-management session, configured CLI profile or secure credential reference available. A fresh read-only CLI inventory still lists only K Scan projects; it was not used for a Her Keys mutation. Browser host inventory remains unavailable. Connected Supabase tools can inspect projects, organizations and databases but cannot read/update hosted Auth configuration.

Live organization qouxjbueadjitgpchwtj reports plan=free/tier_free. Staging was created 2026-09-18. The [2026-06-03 Supabase restriction](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) still applies to new Free projects using default SMTP; custom SMTP permits template editing without a plan upgrade. Staging's observed default Supabase sender/template matches the restricted case; the current dashboard lock and SMTP configuration itself remain inaccessible. No attempt was made to circumvent that restriction or upgrade a plan.

The approved contract remains numeric recovery OTP, not an emailed session/confirmation link: [Supabase supports .Token in templates](https://supabase.com/docs/guides/auth/auth-email-templates), and the app verifies type=recovery on a dedicated ephemeral client. The existing repository template uses `{{ .Token }}` and contains no href, ConfirmationURL or TokenHash. [Resend's supported SMTP configuration](https://resend.com/docs/send-with-supabase-smtp) is smtp.resend.com:465, user=resend, password=an authorized API key. Sender accounts@herkeys.app / Her Keys is consistent with working Production delivery. The connected sending domain remains verified, sending enabled, DKIM/SPF verified, click/open tracking disabled; receiving capability is not required for sending.

Management authorization permits Staging SMTP first, then inspected and narrowly justified Production differences after successful Staging verification. No Auth configuration has been changed in either environment in this resumed pass. Production's working sender/template was preserved.

## Separate certification matrix

| Criterion | Staging | Production |
| --- | --- | --- |
| Custom SMTP settings inspected and verified | BLOCKED: no management access; observed default sender | BLOCKED: configuration not readable; branded delivery works |
| Sending-domain verification | PASS: live Resend domain inspection | PASS: same verified sending domain |
| Numeric recovery template contract in delivered mail | FAIL: observed link-only default template | PASS: actual fresh six-digit code, branded sender, no link |
| Hosted template source/configuration inspected | BLOCKED | BLOCKED |
| Actual six-digit delivery | FAIL: link received, no numeric code | PASS: fresh messages at 17:30 and 17:35 UTC |
| Invalid code rejection | BLOCKED | PASS: 403 / otp_expired |
| Old unconsumed code rejection | BLOCKED | PASS: prior 14:31 delivery rejected at 17:30 before a fresh request |
| Exact configured expiration duration/boundary | BLOCKED | BLOCKED: Auth settings not readable; old-code rejection is not an exact TTL measurement |
| Fresh OTP verification, type=recovery | BLOCKED | PASS: real shipping PKCE client and adapter |
| Replay rejection after successful verification | BLOCKED | PASS: 403 / otp_expired, in both runs |
| Password update | BLOCKED | PASS: authorized marked synthetic account only |
| Login with newly generated password | BLOCKED | PASS: canonical Auth UUID confirmed with getUser |
| Wrong password refusal | NOT_RUN in this resumed pass | PASS: invalid_credentials |
| Session renewal and isolated-client restoration | PASS from prior live probes, independent of recovery UI | PASS after the new-password login |
| Repeated request / rate limit | BLOCKED for the corrected recovery contract | PASS: 200 then immediate 429 / over_email_send_rate_limit; original code remained valid |
| Recovery email redirect correctness | FAIL: observed localhost:3000 link | PASS: numeric email contains no navigation link |
| Hosted redirect allowlist/site URL inspection and correction | BLOCKED | BLOCKED; do not infer correctness from a link-free email |
| Exact hosted settings rollback snapshot | BLOCKED | BLOCKED; working configuration preserved |
| Source failure/lifetime guards | PASS in focused tests, pending final CI | PASS in focused tests; repaired adapter also exercised live |
| Complete environment recovery certification | BLOCKED | BLOCKED: remaining configuration/redirect/rollback inspection |

Supabase uses otp_expired for invalid, expired and used tokens. Evidence establishes the scenario by controlled sequence, not by inventing distinct server error codes. The old code was rejected before requesting a replacement; its delivery was approximately 179 minutes earlier. The exact configured lifetime is still unknown. Tests exercise SDK/backend behavior; native-device form rendering and household restoration through AccountRuntime are not implied by successful Auth session restoration.

## Live Production evidence

The owner explicitly authorized independent Production certification using the pre-existing marked synthetic account. The harness pins project, canonical UUID and controlled inbox address, then checks server getUser before password writes. It uses the shipping Supabase factory (PKCE, no persisted SDK session, timeout fetch), createPasswordRecoveryPort and createSupabaseEmailPassword. No account is created and no real household data is read or written.

Redacted HTTP evidence: [V2_RECOVERY_PRODUCTION_20261113.jsonl](evidence/V2_RECOVERY_PRODUCTION_20261113.jsonl). The first run verified the baseline flow; run b717d2a1-45c4-4188-9f34-bfde728289a3 repeats the material successful flow using the repaired adapter (LF SHA-256 880593848cc2b5862688eb1e294fefbe4ee1c37140c23e212b9ca22d73fab0ad), including 200/429 repeated requests, verification, replay refusal, password update, login, refresh, restore and sign-out. No OTP, password, API key, authorization header or email body is emitted or stored. Only route, HTTP status, sanitized machine error, request identifier and result are recorded.

Synthetic passwords were intentionally changed during these authorized recovery tests; they are random, process-local and not retained. Future synthetic access uses the controlled recovery inbox. Both test processes signed out and exited. No Production SMTP/template/redirect setting, subscription entitlement, checkout flag, deletion control or real account was changed.

## Verified source defects and repairs

| ID | Severity | Root cause | Repair / test | Disposition |
| --- | --- | --- | --- | --- |
| HK-CODEX-AUTH-01 | P2 | Recovery request status=0 or request_timeout was classified ok; code-based limits with status 400 were also hidden | Distinguish transport failures from enumeration-safe account refusals; reuse the established rate-limit classifier. Test reproduced ok-vs-failed, then passes all cases | Repaired; final CI pending |
| HK-CODEX-AUTH-02 | P2 | verified flag survived a refused new verification/request; overlapping operations were accepted; a response installed after dispose was not cleaned | Clear prior authority before a new accepted attempt, serialize operations, reject disposed completion and sign out the late temporary session. Three tests failed before repair and pass after | Repaired; final CI pending |

The application still never binds a household or installs AccountRuntime's account session from recovery. A failed new proof cannot authorize a password write from an earlier attempt. Password-update failures do not claim success, and no completion screen is shown before update success and temporary-session cleanup. The rendered real screen/adapter regression exercises transport failure, retry, invalid code, valid proof, confirmation mismatch, pending update, actual completion, secret-field removal and return to sign-in. Source tests do not certify native interactions.

Focused provider 9/9 and rendered journey 1/1 pass. TypeScript passes. Full regression and exact-head CI must be recorded before merge. Existing account-enumeration guards remain: generic account-not-found/request refusals do not disclose whether an address exists, while actual transport failures and rate limits remain retryable.

## Prepared configuration and exact access gap

scripts-dev/prepare-auth-recovery-config.ps1 performs only read-only inspection and preparation. Both executions currently return BLOCKED_AUTH_MANAGEMENT_ACCESS and configMutated=false. Credential-free plan artifacts are generated beneath %TEMP%/HerKeysAuthRecovery; source template is read at generation time. The script contains no Auth PATCH operation and no credential value.

The following are proposed secure-reference names, not claims that these credentials already exist:

- HK_HERKEYS_SUPABASE_MANAGEMENT_TOKEN: an authorized Her Keys management token/session with Auth configuration read/write for the two named projects; the K Scan CLI token is not a substitute.
- HK_STAGING_RESEND_SMTP_PASSWORD: a secure reference to an authorized existing sending credential for the verified Her Keys domain, usable as Resend SMTP password.
- Production SMTP credential/rollback reference only if inspection proves a credential change is necessary. Do not replace or re-enter working Production credentials just to match Staging.

When access exists: inspect exact live SMTP/hook/template/site/allowlist and expiry values, retain touched old settings securely, configure Staging SMTP, then set mailer_subjects_recovery and mailer_templates_recovery_content from the approved template. Preserve confirmation and other security settings. Remove unintended loopback redirect entries while preserving legitimate identity and calendar callbacks. Validate site URL and exact allowlisted callbacks; do not apply an assumed list or a broad wildcard. Run the same real certification in Staging, including expiry and repeated requests, before preparing only necessary Production differences. Production settings must be independently inspected and its live tests repeated as applicable. No config rollback is claimed ready without the original values.

App source rollback: restore src/platform/passwordRecoveryProvider.ts from verified baseline 6a094ac61fe55a4e1daf48eb3498d4d72540eaf6 if needed, with regression and exact-head CI. This restores the identified source defects, so prefer a forward repair. No database migration is needed.

## Preserved backend gates

Fresh deployed bundle inspection: Staging herkeys-ai 22 matches current source; Production 13 matches the accepted Zod patch at 0a93e9c745abc1eab110983d0167c5c1dc715385. All three files compared after line-ending normalization. Both ACTIVE with JWT verification. Deployment hashes remain 3d2181e4eb35810ad4c187a434f84671f0550ef173e609dd7f4aa71aa43ee3f0 and 5f0c8dee30535c3f8221946e6140b5eb13a151eb658bbe8689406632a48821ea respectively. No uncertainty promotion occurred. Both live databases still show checkout=false, test_checkout=false, fixtures=false, deletion enabled=false/dry_run=true.

Continue independent activation, isolation, RevenueCat and backend work while these precise configuration gaps remain blocked. Neither environment receives a blanket authentication PASS from delivery alone.
