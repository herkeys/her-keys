# Website activation report — account deletion Phase 2 (2026-10-20)

Repository `herkeys/her-keys-web`. PR #9 head `c751f9e7eb18575ecc86e2bd4ad862349d648324` (draft, base `main` `b8939095f5a1aec9877864635a7cafcfa521d1a2`, exact-head CI [39278472014](https://github.com/herkeys/her-keys-web/actions/runs/39278472014) PASS). Phase 2 repair branch `repair/account-deletion-web-phase2-20261020` at `c3b2c83` (stacked on PR #9).

## Gate results

| Gate | Result |
|---|---|
| `WEBSITE_SOURCE` | **PASS**: typecheck, lint, production build, 4/4 web tests, 22/22 browser checks at `c3b2c83` |
| `WEBSITE_PUBLIC_DELETION` | **NOT_DEPLOYED**: live `/delete-account` = disabled placeholder (200) |
| `WEBSITE_RESTORE` | **NOT_DEPLOYED**: live `/account/restore` = 404 |

## Public observations (2026-10-20, from this host)

| URL | Result |
|---|---|
| `https://herkeys.app/delete-account` | 200, placeholder ("disabled placeholder", "unavailable in this build"), `Cache-Control: public` |
| `https://herkeys.app/account/restore` | 404 |
| `https://www.herkeys.app/delete-account` | 307 → apex |
| `http://herkeys.app/delete-account` | 308 → HTTPS |
| HSTS | `max-age=63072000` on apex |
| `/privacy`, `/support` | Still "Privacy contact email to be supplied" / "A support contact address will be published here before launch" |

## Full PR #9 review (inherited and new)

| Area | Finding |
|---|---|
| `/delete-account` | Email OTP ownership; confirm disabled until verified; receipt shown **before** the mutation and kept in memory only; strict terminal-proof validation (`lib/deletion-status.ts`). OK. |
| `/account/restore` | Token read from the URL **fragment**, then `history.replaceState` strips it; explicit confirm; malformed token ignored; replacement link request is non-enumerating. OK. |
| Identity verification | `verifyOtp` with `persistSession:false, autoRefreshToken:false, detectSessionInUrl:false`; local sign-out after the request. OK. |
| Recovery-token leakage | No query strings; `referrerPolicy:'no-referrer'` per fetch plus page meta and header; `Cache-Control: no-store`; no web storage; no external links on restore except `/support`. OK. |
| Analytics / replay / error reporting | **No analytics, replay or error-reporting library ships** (`lib/analytics.ts` is a no-op seam; no Sentry/PostHog/Vercel Analytics). Click delegate additionally ignores deletion paths. OK. |
| Environment | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only; URL allowlisted to the two Her Keys projects (now also on every call, DEL-P2-008). `.env.example` points at **Staging**. Production deploy must set the Production URL. |
| Client bundle secrets | Built bundle contains only the publishable key; the `sb_secret_` string match is supabase-js prefix-check code, not a secret. |
| Rate limits | Server side (Edge Functions + `account_deletion_rate_limits`). The page adds no client throttle beyond disabling buttons while busy. Acceptable. |
| Errors | Raw "Failed to fetch" and JSON-parser text shown. **Fixed** (DEL-P2-008). |
| Legal text | PR adds a privacy-summary section, a full-policy retention notice and contact addresses. **Needs Legal approval** (DEL-P2-007). |
| CI | Workflow ran only on two branch pushes; Phase 2 adds `pull_request` and the new test. |
| Unrelated diff | `demos/life-scenarios` apostrophe escaping (lint), lockfile refresh for `@supabase/supabase-js@2.116.0`. Benign. |
| Footer | Site-wide "Public preview — final photography and store links are placeholders" predates PR #9; a launch item for the site owner, not deletion. |

## Verification performed

Local production build of `c3b2c83` served with `next start`, configured for **Staging** (publishable key only), driven by headless Chrome via Playwright (`evidence/web-deletion-check.json`, screenshots in `evidence/`). Live Staging calls used only a random 43-character token, random receipts and a nonexistent `.invalid` email. No account was created, deleted or restored.

22/22: fragment stripped; explicit confirm; token only in the POST body; empty Referer on all service calls; failure copy for unknown token; nothing in web storage; only localhost and the Staging host contacted; malformed token not offered; Her Keys identified; non-enumerating initiation; confirm disabled pre-verification; malformed receipt rejected; unknown receipt not "deleted"; offline and 502 handled with friendly copy; all inputs labelled; 375 px with no horizontal scroll and ≥44 px buttons on both pages.

Not verified here: the Vercel preview (behind `allonda` team SSO, not accessible), a full OTP → request → recover journey with a real disposable inbox, screen-reader pass, and desktop Safari/Firefox.

## Public release prerequisites (in order)

1. Legal approves the PR #9 legal text (DEL-P2-007) and the policy changes in `09-legal-handoff.md`.
2. Production backend promotion P1 is complete (`03-production-promotion-manifest.md`). The web flow calls the same functions; the Phase 2 functions must be live first.
3. Merge web Phase 2 into PR #9's branch, then PR #9 → `main` after review. Vercel Production env: `NEXT_PUBLIC_SUPABASE_URL=https://npykvnxnehlsdlbumzwk.supabase.co` and the Production publishable key.
4. **Product Owner authorizes the public release.** (Publishing before the backend accepts requests would expose a working "request deletion" button whose processing is disabled. With `enabled=false` requests are accepted and deactivated but not purged; the page copy must stay truthful about that.)
5. Re-verify on the public HTTPS URL: both routes 200, the headers above, the OTP journey with a disposable account, recovery with a real link, and a status check. Only then give the Play Console team `https://herkeys.app/delete-account`.
