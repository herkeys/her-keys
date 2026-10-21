# Defect ledger
| ID | Priority | Root cause / repair | Verification / status |
|---|---|---|---|
| P-SOURCE | P1 | Older main-based audit described placeholders; selective integration preserves real V2 | Remote candidate/history and worktree diff inspected; repaired |
| P-VERSION | P1 | Local version source and Android-only increment | Remote source, both-platform increment; baselines read 2/2 |
| P-KEY | P0 prevention | Swapped/Test Store/secret/placeholder key could reach wrong native lane | Explicit route/prefix policy and Production refusal tests |
| P-DEBUG | P1 | Test Store keys were configured for native Release builds; SDK deliberately crashes | Reproduced on emulator; Debug profiles + release-key refusal added; retest recorded separately |
| P-TRIAL | P1 | period_type retained only in event inbox, absent from projection/client | Additive verified-period mapping, Home/Account display, lifecycle/date/DB tests |
| P-MALFORMED | P0 | Missing/invalid provider expiry was interpreted as non-expiring access | Reject malformed provider grants and missing subscription environment; regression tests |
| P-CHANGE | P1 | Scheduled PRODUCT_CHANGE treated as a completed paid new period | Reconcile-only handling; no premature plan/expiry change |
| AE2E-D06 | P1 | Any deletion-status transport failure unmounted a legitimate local household | Recent same-account secure positive check (24h), no receipt/known denial, local-only notice, durable sync pause, per-request fencing; cold-launch/account-switch/in-flight tests |
| P-COPY | P2 | Pending verification guaranteed no duplicate charge | Factual store-check direction and regression |
| P-PAYWALL | P1 | Published placeholder legal links, unsupported benefit and web-checkout savings | Corrected draft prepared; publication/real native review remains blocked |
| P-GOOGLE | P1 | Purchase API cannot find package while catalogs are readable | Correct identity confirmed; Her Keys Play admin session unavailable; external gate |
| P-APPLE | P1 | RevenueCat ASC credential missing | Existing Her Keys EAS key verified against Apple and encrypted locally; owner credential-entry handoff remains |
| P-APPLE-META | P1 | Apple products MISSING_METADATA | Direct Apple API evidence, current prices/trials preserved; store readiness gate |
| P-NATIVE | P1 certification | No Play/Apple native sandbox purchase evidence | Android quota exhausted; local Debug/Test Store work separated from real store proof |
| P-PRICE | P2 limitation | Current account RPC has no verified future renewal price | No invented amount; store subscription settings/purchase interface owns amount; inline renewal-price certification remains limited |
| P-ACCOUNT-KEY | P2 | Premium and Restore were siblings with identical account UUID keys | Native warning traced to app/sign-in.tsx; distinct account-scoped keys preserve remount boundaries; 41 focused UI checks pass |

The 24h D06 cache permits bounded local use when a formerly active account cannot reach the server; a server-side deletion that happened while disconnected cannot be discovered offline. Known deactivation/receipts override it immediately. Cloud writes remain paused, including after auth callbacks and between individual network requests. No worker or server deletion authority was weakened.

Native follow-up found a real gap beyond the initial passing unit tests: Android rejected offline fetch with plain Error, so the browser-oriented fallback still blocked local access. Commit 9a087d8 classifies transport rejections inside the account-status fetch adapter; HTTP denials and malformed response parsing remain outside that catch. Five regressions cover native Error, HTTP failures, malformed responses and production runtime composition; 96 focused checks passed. Debug-only diagnostics contain failure class and cache-presence booleans, never tokens or account IDs. The exact adapter path is registered in the existing ownership guard (4dc6f26); its first CI failure was a missing ownership declaration, not a waived check.

Existing security advisors: INFO service-only RLS tables with no client policies; WARN intentionally exposed own-account SECURITY DEFINER RPCs, pg_net in public, and disabled leaked-password protection. No public policy/grant was added to service-only tables. Existing unrelated warnings are documented, not silently 'fixed' through a plan upgrade or broad schema move.

External closure details (independent engineering continued for every row):

| Gate | Required external action / dashboard | Exact retest after access is restored |
|---|---|---|
| P-GOOGLE (P1) | Her Keys Play Console admin must inspect the existing service account's app-specific purchase grants, API access and initial signed AAB/testing-track state for com.heykeys.app. Catalog reads alone cannot determine which prerequisite is missing. The accessible Google session belongs to another application. | RevenueCat app3311d4868e purchase API must validate; then an actual Play-installed licensed tester must purchase, restore, cancel and expire/refund in sandbox with matching signed Staging fulfillment. Allow propagation only after a real permission change. |
| P-APPLE (P1) | In RevenueCat Her Keys app55f51de583, owner uploads the existing verified Apple-issued key from 08. The connector cannot submit private key material; browser credential entry requires owner handoff. | RevenueCat reports ASC configured, credential validation succeeds, monthly/yearly metadata refresh succeeds instead of HTTP 422. No new key is needed. |
| P-APPLE-META / P-NATIVE (P1) | App Store Connect Her Keys app6816197153: complete missing subscription metadata and authorize tester/device access. A macOS/iOS runtime and store sandbox testers are unavailable here. Android EAS quota is 15/15; no upgrade is needed for local QA. | Supported store installations and actual sandbox lifecycle evidence on both platforms: trial eligibility/date/price, account switching, and signed backend state. Engineering performs the retest once access exists. |
| P-PAYWALL (P1) | Owner explicitly authorizes publication of the corrected draft in the linked RevenueCat builder. | Native monthly/annual selection, actual P1M eligibility/prices and PDF links, dismissal, Restore, light/dark, small-screen and accessibility checks. |

The paywall skill says: "Do not publish unless the user explicitly asks" ([SKILL.md](C:/Users/jsmit/.codex/plugins/cache/openai-curated-remote/app-6a69853c7df08191801acfc8ff769b01/2.3.0/skills/revenuecat-paywall-design/SKILL.md)). This assignment authorized draft repairs but did not explicitly request paywall publication. The draft is concrete and reviewable before that final action.

