# Provider erasure matrix — account deletion Phase 2 (2026-10-20)

**Gate `PROVIDER_ERASURE=PARTIAL`.** RevenueCat is live-certified; Supabase Auth, Database and Storage are hosted-certified (Phase 1); Apple and Google are source-only (live tests owner-deferred); vendor log/backup retention is unconfirmed.

| Provider | What Her Keys does at deletion | Evidence | Status | What Her Keys cannot erase / must not claim |
|---|---|---|---|---|
| Supabase Auth | `auth.admin.deleteUser`, then requires an authoritative 404; recounts `auth.*` `user_id` subresources | Phase 1 hosted runs 1770/1772/1773; source tests | **PASS (Staging)** | Supabase platform audit/request logs and backups follow Supabase's retention |
| Supabase Database | 50 registered tables + 2 custom groups cleaned; shared rows escalated; terminal recount | 50/50 local fixtures; hosted 52-group zero-count proof | **PASS (Staging)** | Point-in-time backups until they age out (Legal to disclose period) |
| Supabase Storage | Storage API removal by owner (current + legacy owner columns); multipart uploads must be zero | Historical 2026-10-14 blob removal + independent list/download; source checks | **PASS (Staging, historical blob)** | Storage backups/CDN cache per vendor |
| RevenueCat | `DELETE /v2/projects/proj93809efe/customers/{uuid}`, then GET must 404; the project ID is pinned | Phase 1 live: removed customer 404, unrelated 200 | **PASS (live Staging)** | Apple/Google store transactions; RevenueCat may keep aggregated/anonymized metrics |
| Apple (Sign in with Apple) | Revoke the stored refresh token. With no usable token: `manual_revocation_required` and user instructions (Phase 2) | Source tests (Phase 2) | **NOT_VERIFIED (live)** | Apple ID, Apple's own sign-in records, App Store purchases |
| Google (Sign-in + Calendar) | Revoke the stored Calendar refresh token(s); delete connection/state rows. An already invalid token settles as `credential_already_invalid` (Phase 2) | Source tests | **NOT_VERIFIED (live)** | Google Account, calendar events, Google's OAuth/activity history, Play purchases |
| Resend | Recovery/restored/problem emails sent during the lifecycle; completion recipient held encrypted ≤7 days, then nulled/expired; alert emails carry counts only | Historical delivery + retention evidence; source | **PARTIAL** | Resend's sent-message logs/metadata per its retention; no programmatic erasure is invoked |
| Google Gemini (herkeys-ai) | Calls use `store:false`; Her Keys-held AI reports and consent rows are erased; reviewer IDs redacted | Source (`herkeys-ai/index.ts:404`), Phase 1 tests | **PARTIAL** | Google's abuse-monitoring/operational logs per API terms; Her Keys cannot erase them |
| PostHog | Not integrated in the mobile app or website (no SDK in `package.json`, no client code) | Repository search (Phase 2) | **N/A** | — |
| Vercel (website) | No account data stored; deletion pages send `no-store` | Header checks | **N/A** | Vercel request logs (IP, path; no token in the path) per Vercel retention |
| Other SDKs | `react-native-purchases` (RevenueCat app user ID cached on device, cleared by local reset/sign-out); `expo-secure-store` (session/receipt keys, namespace-scoped); `expo-notifications` (local reminders cancelled) | Phase 1 device-race tests | **SOURCE PASS** | Data on a device that never reconnects; copies held by other household members |

Retention values that stay unchanged (owner-approved): 30-day recovery, five-field terminal proof for 365 days, completion outbox ≤7 days, shared-review target 7 days.
