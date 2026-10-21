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

The 24h D06 cache permits bounded local use when a formerly active account cannot reach the server; a server-side deletion that happened while disconnected cannot be discovered offline. Known deactivation/receipts override it immediately. Cloud writes remain paused, including after auth callbacks and between individual network requests. No worker or server deletion authority was weakened.

Existing security advisors: INFO service-only RLS tables with no client policies; WARN intentionally exposed own-account SECURITY DEFINER RPCs, pg_net in public, and disabled leaked-password protection. No public policy/grant was added to service-only tables. Existing unrelated warnings are documented, not silently 'fixed' through a plan upgrade or broad schema move.

