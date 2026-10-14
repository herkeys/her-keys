# Her Keys V2 Premium hostile verification — interim integration findings

Date: 2026-10-14. **Full Checkpoint 5 certification NOT RUN.** This is the required append-only record of security failures discovered during Checkpoint 2 integration. Checkpoint 3 is still a hard stop before feature work. No hosted or native certification is implied.

## Confirmed integration failures and repairs

| Finding | Source-executable result | Requires Staging status | Owner / evidence producer and environment |
|---|---|---|---|
| P0-INT-01: first-frame cross-account Premium snapshot / retained open consumer state | FAIL before repair; regression now PASS, SOURCE_VALIDATED at `7eb6592348422dd54e6b3b5d3377c03b75694078` | BLOCKED; no real account/device switch run | mobile integration agent, #10; `tests/premium/clientProvider.test.mjs` V2 every-render switch test; local |
| P1-INT-02: RevenueCat provider retained A's paid display after identity B until manual refresh | FAIL before repair; regression PASS, SOURCE_VALIDATED at `7eb6592` | BLOCKED; real SDK/store switch still requires #12 | integration agent; `tests/platformParity/restoreIdentity.test.mjs` identity-change test; local |
| Stale ledger/purchase callback after same-household A→B→A or lifecycle restriction | PASS, SOURCE_VALIDATED at `7eb6592`; new generation fences deny ledger, authorization, extraction and verification work | BLOCKED; real JWT/receipt calls require #11/#12 | integration agent; `tests/premium/clientProvider.test.mjs`; local |
| Restored account inherits prior server entitlement | PASS, SOURCE_VALIDATED at `7eb6592`; SDK hint cannot unlock while fresh server state is unknown | BLOCKED; actual account recovery and Sandbox restore require #9/#12 | integration agent; `tests/premium/clientProvider.test.mjs` restored-account test; local |
| Existing Premium deletion privacy P0 (#9) | FAIL / BLOCKED: combined-chain cleanup is refused with unclassified_resource; no terminal purge certification | BLOCKED; deletion owner has no Premium erasure sign-off | deletion lifecycle owner, [#9](https://github.com/herkeys/her-keys/issues/9); `tests/accountDeletion/database.test.mjs`, `mutations.test.mjs`, `resourceCoverage.test.mjs`; local PGlite SQL, no hosted write |

P0-INT-01 reproduction: mount real PremiumStateProvider with bound account A and server premium_active; open a consumer screen; update the provider to B in the same household; collect **every** child render before effects. Previously B's first render received snapshot.accountId=A, server=premium_active and the previously open state. The ordinary test that inspected only after act/effects missed that frame. Root cause: controller.setAccount ran in a passive effect and consumer state was keyed only by household. Repair: actor+household keyed consumer boundary, synchronous scope generation invalidation, current-account/lifecycle transport fences, and disposal that discards the server snapshot. No cached entitlement authorizes computation; server authority remains unchanged.

P1-INT-02 reproduction: mount real RevenueCatProvider after identifying A with SDK entitlement her_keys_plus, then identify B with no purchase and inspect without manually invoking refresh. Previously isPlus stayed true. Repair: immediate identity generation publication before serialized SDK changes; provider masks old status synchronously and only applies responses for the current generation. Queued native operations remain serialized; late results are discarded, including A→B→A. Anonymous/current-UUID guards remain in place.

Red output: `v2-premium-pass-a-checkpoint2/identity-isolation-red.txt`, produced by `node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test tests/platformParity/restoreIdentity.test.mjs tests/premium/clientProvider.test.mjs` before repair, local working tree with baseline provider source inherited unchanged from `1a0d25e`. The extra anonymous-test failure in that initial run was test-fixture residue following the deliberately failing test; teardown was repaired to sign out and clear scripted call history. It is not a third application defect.

Green combined producer at exact `7eb6592`: command and 137/137 output in `v2-premium-pass-a-checkpoint2/client-integration-7eb6592.txt`, named in the user-journey report. Later keyboard/strict-guard repairs are `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17`, 77/77 guard tests. These source results do not prove hosted persistence or authorize release.

## Open P0 defects

**#9 — Premium account-deletion provider identifier erasure / resource classification**, deletion lifecycle owner. Both migrations introduce records not classified by the inherited worker/registry. premium_events retains app_user_id, original_app_user_id, aliases and transfer identifiers; null account FK is insufficient. Combined-chain tests fail closed rather than certify incomplete erasure. The original worker/registry/authorization SQL were preserved byte-for-byte; reproduction was posted on #9. Other subscribers and global config must be preserved in the owner's repair. This open P0 forces the unified release decision FAIL.

P0-INT-01 is repaired at SOURCE_VALIDATED level; Staging/device regression remains BLOCKED. No full attack class matrix has run in this continuation. Village and Co-Parent Plus remain BLOCKED by Pass A scope, without UI or release-flag changes.


## Pass A Step 6 — Premium-only source-executable hostile verification (2026-10-14)

**Evidence environment:** GitHub Actions / Node 22; isolated **Premium-only** source branch `integration/premium-certification` exact SHA `4be74a99423ae620c586b5a8f92abf1a954068c7`, based directly on `e4462d2a5cb42706a8523f6ba45248ee9396d02e`. Producer: [Her Keys V2 Integration Gate, run 38630089798](https://github.com/herkeys/her-keys/actions/runs/38630089798), job `v2-repository-validation=success`, step `Full application test suite=success`; command `npm test`. Other mandatory steps (npm ci, backend boundary, release identity, TypeScript, Expo install check, Expo Doctor, public/native config, evidence boundary) all passed. Specific source assertions below were independently inspected by reading the named `tests/*.test.mjs` files at the certified SHA. Test names prove **source-level simulated behavior**, not actual account/JWT/provider/DB/device isolation.

**Statuses:** `PASS` = a directly named test and assertions exist and executed as part of successful exact-SHA full suite; `NOT RUN` = no matching standalone/hard real-device or behavior test evidence located in this pass; `BLOCKED` = live Staging/real-JWT/provider prerequisites not ready. `PARTIAL` is not used as a certification status. `N/A` denotes an attack not applicable to that feature, not a PASS. **Nothing in this matrix is `STAGING_VERIFIED` or `DEVICE_VERIFIED`.**

### Daily Load Autopilot — hostile source column

| Attack | Source-executable — result and exact test producer | Requires Staging — status |
|---|---|---|
| Forged `isPremium=true` / body account id | **PASS** — `tests/premium/gateHandler.test.mjs` strict rejected keys / no authorization calls | **BLOCKED** — real JWT direct endpoint |
| Cross-household and forged proposal ID | **PASS** — `tests/premiumDomain/dailyLoadChange.test.mjs` forged destination and byte-identical unrelated tasks; `dailyLoadUi.test.mjs` switching accounts drops receipts | **BLOCKED** — actual RLS denied foreign household |
| Invalid / expired JWT shape | **NOT RUN** — JWT server wrapper has separate source tests but this pass did not independently exercise expired-token signature validation | **BLOCKED** — real expired Staging JWT |
| Same decision replay and duplicate approval/taps | **PASS** — `tests/premiumDomain/dailyLoadFlow.test.mjs` replay, double submission, unauthorized approval; `dailyLoadChange.test.mjs` duplicate proposal | **BLOCKED** — durable hosted idempotency |
| Restart after crash before/after save | **PASS** — `dailyLoadFlow.test.mjs` crash before save, after save, failed receipt, recover; `dailyLoadChange.test.mjs` receipt recovery | **BLOCKED** — real device kill/restart |
| Stale manifest / entitlement changed | **PASS** — `tests/premium/clientState.test.mjs` release switch, revoked/unknown; `tests/premium/clientController.test.mjs` stale answer dropped | **BLOCKED** — live feature switch, actor-aware server |
| Malformed server response | **PASS** for fail-closed boundary exceptions in `tests/premium/gateHandler.test.mjs`; no complete malformed-HTTP schema-fuzzing verified | **BLOCKED** — hosted malformed responder |
| Hostile prompt injection | **NOT RUN** — Daily Load is local deterministic, no AI prompt; unauthorized review/forged plan tested instead | **BLOCKED** — hosted unauthorized review only |
| Missing fields / zero data / oversized input | **PASS** zero-data, missing estimated duration, no safe move: `dailyLoadReview.test.mjs`; huge payload bounds **NOT RUN** | **BLOCKED** — live data size/invalid shape |
| Illegal states / stale proposal / unsafe undo | **PASS** — `dailyLoadChange.test.mjs` stale changed/finished, conflict-aware undo, unmodifiable task; `dailyLoadFlow.test.mjs` unlawful approval fails | **BLOCKED** — hosted ledger state transition |
| Timezone / logical-day boundary | **PASS** for calendar-day constraints and due-date boundary in `dailyLoadReview.test.mjs`; multi-timezone device migration **NOT RUN** | **BLOCKED** — real IANA zone on device |
| Account switch during pending request | **PASS** — `clientController.test.mjs` late A answer never applies to B; `dailyLoadUi.test.mjs` switches/clears reviews | **BLOCKED** — real A→B signed-in switch |
| Offline / provider timeout | **PASS** for unavailable server and fail-closed reviewer in `dailyLoadFlow.test.mjs`; physical offline toggle **NOT RUN** | **BLOCKED** — loss of actual connection |
| Small screen / large text / screen reader / keyboard overlap | **PASS** for small-screen/large-font rendering and labeled controls in `dailyLoadUi.test.mjs`; actual TalkBack/VoiceOver/keyboard **NOT RUN** | **BLOCKED** — device accessibility tests |

### Smart Inbox — hostile source column

| Attack | Source-executable — result and exact test producer | Requires Staging — status |
|---|---|---|
| Forged account / Premium body property | **PASS** — `tests/premium/smartInboxServer.test.mjs` closed request contract rejects account/entitlement/isPremium extra keys | **BLOCKED** — real JWT direct request |
| Cross-household child/ref / private data | **PASS** — `smartInboxServer.test.mjs` only allow-listed short refs, unknown child rejected; `smartInboxClient.test.mjs` account/child IDs withheld from AI prompt | **BLOCKED** — RLS/foreign-household signed-in probe |
| Invalid / expired JWT shape | **NOT RUN** — no actual expired JWT issued in this lane | **BLOCKED** — live JWT expiry |
| Same capture and duplicate tapping | **PASS** — `smartInboxClient.test.mjs` same submission results in one server call/interpretation; UI `smartInboxUi.test.mjs` only explicit accept writes canonical row | **BLOCKED** — hosted quota reservation double-charge |
| Restart/lost network during capture | **PASS** — `smartInboxClient.test.mjs` source saved before server call and retained on provider failure; full kill/relaunch during save **NOT RUN** | **BLOCKED** — real device persistence |
| Stale entitlement/manifest | **PASS** — `smartInboxClient.test.mjs` not entitled or unbound sends nothing; `clientState.test.mjs` kill switch, expiry, deletion overlay | **BLOCKED** — live kill switch/grant/lifecycle |
| Malformed/untrusted server and model response | **PASS** — `smartInboxServer.test.mjs` invalid JSON/schema, unknown capability kinds, extra fields, bounded outputs; client maps unavailable honestly | **BLOCKED** — live model malformed responses |
| Hostile prompt injection in note | **PASS** — `smartInboxServer.test.mjs` adversarial notes treated as quoted untrusted data; immutable system prompt; external URLs rejected | **BLOCKED** — real external-model instruction-resistance evaluation |
| Missing fields / zero text / oversized notes | **PASS** — strict parsing, MAX_TEXT_CHARS bound and invisible character normalization in `smartInboxServer.test.mjs`; `smartInboxClient.test.mjs` refuses send oversized text | **BLOCKED** — live HTTP payload/failure |
| Illegal state changes / no approval writes | **PASS** — `smartInboxUi.test.mjs` user review must approve before canonical save; invalid model action kinds dropped | **BLOCKED** — hosted direct domain write denial |
| Date/time and logical-day boundary | **PASS** — weekday/date disagreement, null invented missing time, invalid dates and wrong-child proof in `smartInboxClient.test.mjs` and `smartInboxServer.test.mjs` | **BLOCKED** — model-generated plausible invented time **known residual risk** |
| Account switch during pending request | **PASS** for shared Premium controller dropping delayed A result in `clientController.test.mjs`; capture-local A→B in-flight specific test **NOT RUN** | **BLOCKED** — real A/B session switch |
| Offline / provider failure | **PASS** — `smartInboxClient.test.mjs` throwing transport preserves local reading and says unavailable; physical device offline toggle **NOT RUN** | **BLOCKED** — real model/provider outage |
| Small screen / accessibility / keyboard overlap | **PASS** for existing review UI/action assertions in `smartInboxUi.test.mjs`; actual large font, voice assist and keyboard dimensions **NOT RUN** | **BLOCKED** — native accessibility test |
| Accuracy against real model | **NOT RUN** — `smartInboxEval.test.mjs` uses authored model outputs; explicitly asserts plausible invented time can reach review | **BLOCKED** — owner-authorized spend and live Gemini evaluation |

### Momentum — hostile source column

| Attack | Source-executable — result and exact test producer | Requires Staging — status |
|---|---|---|
| Forged Premium/client flags | **PASS** — shared `tests/premium/gateHandler.test.mjs` rejects forged request, `momentumFlow.test.mjs` refuses report if authorization denied | **BLOCKED** — actual subscriber/Free JWT |
| Cross-household observation/decision receipt | **PASS** — `momentumFlow.test.mjs` foreign receipts never enter report; `momentumUi.test.mjs` account switch clears open/saved reviews | **BLOCKED** — hosted cross-household RLS |
| Invalid / expired JWT shape | **NOT RUN** — no real signed expired token source check in this lane | **BLOCKED** — hosted token checks |
| Duplicate observation/decision | **PASS** — `momentum.test.mjs` dedupe observations, reopened tasks, approved deferral counted once, undo not counted as win | **BLOCKED** — real persisted duplicate observations |
| Restart / failed/partial save | **PASS** — `momentumFlow.test.mjs` failed save marked pending, interrupted save reconciled next open, same-period receipt replay | **BLOCKED** — real native restart |
| Stale feature manifest / expired Premium | **PASS** — `momentumFlow.test.mjs` saved reports remain readable with entitlement denied; `clientState.test.mjs` global/feature switches | **BLOCKED** — real expiry/revocation |
| Malformed receipt/server response | **PASS** — `momentum.test.mjs` tampered/old-version snapshot fails closed; `momentumFlow.test.mjs` malformed source receipts ignored | **BLOCKED** — hosted invalid persisted row |
| Prompt injection | **NOT RUN** — no Momentum external model; neutral evidence/ref-only report tested rather than prompt | **BLOCKED** — hosted malicious observation content isolation |
| Missing fields/zero data/insufficient history | **PASS** — `momentum.test.mjs` empty week, 5 events across 3 days threshold; never invents time saved/score | **BLOCKED** — real household source sufficiency |
| Illegal report actions/undo | **PASS** — `momentumFlow.test.mjs` user next-step approved only once after authorized review, approval changes no household data; `momentum.test.mjs` applied/undone receipt distinction | **BLOCKED** — real durable status transitions |
| Timezone/logical-day boundary | **PASS** — `momentum.test.mjs` seven-day inclusive edges, future excluded; `momentumFlow.test.mjs` household logical-day mapping | **BLOCKED** — real timezone device rollover |
| Account switch during pending request | **PASS** for `momentumUi.test.mjs` switch clears already-open report, plus shared `clientController.test.mjs` dropping delayed A; Momentum-specific in-flight fetch cancellation **NOT RUN** | **BLOCKED** — signed-in A/B rapid switch |
| Offline/server unavailable | **PASS** — `momentumFlow.test.mjs` refused/unavailable gate saves nothing, saved reviews available without new authorization; full offline/reinstall **NOT RUN** | **BLOCKED** — real network and restart |
| Small screen/large text/screen reader/keyboard overlap | **PASS** for visible, review copy/UI assertions `momentumUi.test.mjs`; explicit native small-screen/accessibility/keyboard test **NOT RUN** | **BLOCKED** — device accessibility |

### Findings and escalation

- **No NEW P0 was confirmed from the explicitly identified Premium-only source tests at `4be74a99423ae620c586b5a8f92abf1a954068c7`.** This does not close the separately confirmed `premium_events` deletion privacy coverage risk [#9](https://github.com/herkeys/her-keys/issues/9).
- **Smart Inbox residual risk remains:** the 43-case pipeline evaluation uses agent-authored outputs, and `tests/premium/smartInboxEval.test.mjs` documents a plausible **invented time passing to human review**. Do not certify live extraction accuracy, provider prompt protection or autonomous capture.
- Source test producer `npm test` on GitHub was SUCCESS, and existing tests assert the behaviors described. **No separate real device screen-reader, keyboard or offline harness was executed** by this pass.
- **Hostile hosted column stays BLOCKED** on secure Staging Edge secrets [#16](https://github.com/herkeys/her-keys/issues/16), provider catalog/restore [#17](https://github.com/herkeys/her-keys/issues/17), authorized JWT A/B sessions and deletion-owner certification [#9](https://github.com/herkeys/her-keys/issues/9). None receives hosted/device PASS.
- No Village or Co-Parent Plus route, mock, feature flag or source was created by this Pass A evidence update.
