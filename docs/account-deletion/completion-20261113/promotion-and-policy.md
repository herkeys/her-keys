# Promotion manifest and legal handoff

**Not ready for promotion.** Mobile repair code: `a73d3b96989b4a79f0a196caf75e30962d6ecb8a`. Website source: `b83faa09d981da73874b8373c0297a52f46e40fc`. Integration tip stays `9bdcff9135c6f3aa2393509827d284b6310108c9`; website main stays `b8939095f5a1aec9877864635a7cafcfa521d1a2`. No final merged build SHA yet.

Candidate SQL: `supabase/migrations/20261114020529_account_deletion_recovery_delivery.sql` (LF SHA-256 `53c7fbab8caa3e5fd937fd15833178c12ffb573dcfafacb33419ead9ff946198`). Apply only after source review and separately approved Production promotion. Verify existing divergent migration histories before applying; never replay the canonical chain against Production.

Apply SQL before dependent Edge replacement. Proposed deploy set and gateway JWT setting:

- `request-account-deletion`: true; recent verified user and session required.
- `restore-account`, `resend-restoration-email`, `deletion-status`, `begin-web-deletion`: false; handler checks proof/ownership or returns a generic response with rate limiting.
- `monitor-account-deletions`, `process-account-deletions`: false; existing HMAC verification remains mandatory.

The [source manifest](promotion-source-manifest.json) pins the migration and the exact source dependencies for these bundles. An exact bundle checksum must be recorded after hosted deployment.

Read back each deployed file and gateway flag against the source manifest. Pin the known deployed bundles for rollback. Do not roll the migration body back to immediate token invalidation or discard outbox data. If a dependency fails, leave purge disabled, restore the compatible prior bundle or roll forward, and recheck active requests, queued proofs and recovery links before resuming. Rehearse on the scoped Staging fixture set. Production promotion and destructive activation are separate explicit approvals.

Verify presence by name: `EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`, `DELETION_EMAIL_ENABLED`, `RESEND_API_KEY`, `DELETION_ALERT_RECIPIENT`, `REVENUECAT_DELETION_API_KEY`, `REVENUECAT_PROJECT_ID`, `APPLE_DELETION_CLIENT_ID`, `APPLE_DELETION_TEAM_ID`, `APPLE_DELETION_KEY_ID`, `APPLE_DELETION_PRIVATE_KEY`, Staging-only `DELETION_STAGING_RECIPIENT` and optional `DELETION_RECOVERY_BASE_URL`. Check Auth email OTP settings, Resend permission for send and delivery read-back, and the GitHub watchdog credentials/variables in the correct project. Do not paste values.

| Decision | Recommendation for review |
|---|---|
| Ordinary 30-day recovery | Keep standard design while Legal verifies target markets, service-time expectations and disclosures. |
| Expedited / waive recovery | LEGAL APPROVAL REQUIRED. Decide whether applicable erasure requests require a verified expedited route. Do not add global early purge. |
| Region / deadline exceptions | LEGAL APPROVAL REQUIRED. Where GDPR applies, Article 17 calls for erasure without undue delay where applicable; Article 12 generally requires a response within one month. Thirty days plus processing is not evidence of meeting either duty. [Official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/). |
| Direct privacy requests and retention | Confirm public support handling, legal exceptions, time bounds for failed provider reconciliation and backups/processors. A tracked legal channel may be needed independently of normal app recovery. |
| Apple | Review in-app path, time estimates, completion notice, subscription guidance, legacy revocation and iPad. [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion). |
| Google Play | Confirm in-app path plus a working web request without an app reinstall; reconcile Data Safety and target URL after public HTTPS validation. [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111). |

Proposed customer wording for Legal review: “When we accept your deletion request, we restrict normal account access. You can recover your account before the date shown on your receipt, normally 30 days after the request. After that deadline, we process permanent deletion of account-owned data and confirm it after verification. Shared records may need individual review to protect other people. Deleting a Her Keys account does not cancel store billing. Contact Her Keys support for privacy requests or questions about applicable retention obligations.”

After scoped hosted PASS and owner-approved integration, verify both **live** heads, full CI, clean locked install, mobile typecheck, iOS and Android Hermes exports, and Production EAS preflight for the new exact merged SHA. The iOS/iPad historical result remains scoped to that earlier audit; native devices, store review and EAS builds/uploads are separate.
