# Build 2B shared integration repair ledger

Date: 2026-10-13. Authority: owner's **Build 2B Shared Integration Closeout** request. Android baseline:
`308551bac7b609234dfe440a40bd1096720a08fe`; Build 2A remote remains `68f95096dfeab85404b2f65e196ddfbee85fe86b` at entry.
Implementation checkout: `C:\Users\jsmit\.codex\worktrees\build2b-shared-closeout\Her Keys`, branch
`codex/build2b-shared-integration`. Final exact source/CI is in the local `audit-evidence/FINAL_SHARED_CERTIFICATION.md` artifact.

## Authorized repairs

| ID / severity | Demonstrated issue | Smallest correction / scope | Commit | Verification / disposition |
|---|---|---|---|---|
| B2B-N01 / P2 | Systems child association existed in commands/model but the consumer editor omitted its chooser. The prior sentinel explicitly pinned the omission. | `SystemEditor` renders the existing `subjectChoices` and `setSubject` contracts: household-wide option, existing children, selected-state announcement, unavailable-child notice, explicit replacement/clear. No child invention or domain/persistence/sync rule change. Hook comment updated; the omitted-chooser sentinel is replaced with an exposure assertion, preserving unsupported-operation guards. | `35d7c01d919ca2d3a05cdb8ea59480de6765f58d` | **55/55 PASS** focused Systems UI/model/persistence/account-backed sync tests. Android/iOS UI create → choose → save → restart → edit → clear; no-child default, missing child, stale/reload, real storage failure and existing canonical second-device/ownership tests. PASS/source; physical interaction NOT RUN. |
| B2B-N02 / P2 | Explicit restore route was closed after onboarding; returning users depended on an unverified remote paywall link. | Persistent Your Account action via `useEntitlement().restore(expectedAccountId)`. Loading/success/no-purchase/unavailable/error notices; synchronous duplicate-tap guard; sign-out/close disabled while restoring; owner-tagged late result suppression and unmount guard. Account panel can scroll. | `f947d3bf9ca3bd34c582558f8301211fe387eae1` | **86/86 PASS** focused new route/native-SDK seams, existing monetization/account access and Welcome Premium regression. Both platforms; no restore in disconnected/quarantined/busy states; thrown failures recover; expected UUID supplied; original free-feature policy remains. PASS/source; native store restore NOT RUN. |
| B2B-N02 ownership protection; N03/N09 reconciliation | The prior SDK callback discarded identification results, so a failed login could leave a previous/anonymous SDK identity eligible for store operations. The native-boundary comment also described obsolete anonymous checkout. | SDK records only successfully identified account UUID; checks native `getAppUserID` before/after restore/CustomerInfo/paywall, blocks anonymous/mismatched/failed identity, serializes identity changes against native transactions. Failed login clears local restore authority. Current Premium intent/checkout sequencing is unchanged. Refresh stays based on canonical CustomerInfo; no synthetic entitlement or purchase is introduced. | Same N02 commit | Real boundary driven by scripted SDK: wrong/anonymous identities refuse calls, failed login cannot expose old entitlements, login B waits until restore A settles, A cannot restore for B, real provider refreshes canonical state. No RevenueCat dashboard/transfer policy change. N03 diagnostics/retry remains a separate debt; unsafe operation is now refused. |

Modified production files: `src/features/systems/editor/SystemEditor.tsx`, `useSystemEditor.ts`, `app/sign-in.tsx`,
`src/features/account/AccountPanel.tsx`, `src/monetization/RevenueCatProvider.tsx`, `revenueCatClient.ts`. Companion tests are in
`tests/systems/ui.editor.test.mjs`, `ui.subject.test.mjs`, and `tests/platformParity/{persistentRestore,restoreIdentity}.test.mjs`
with test-local SDK/route stand-ins. These stand-ins prove source contracts, never native store or live backend behavior.

No code in `src/features/welcome/`, `src/features/account/WelcomeAuthFlow.tsx`, `welcomeFlowModel.ts`, `app/index.tsx`,
`app/onboarding/`, `app/_layout.tsx`, consent/auth domain, Supabase source/schema or iOS-native configuration was modified.
The SDK ownership guard can safely refuse a checkout after failed identification; it changes no Welcome Tree step/order/copy.

The Android compact-button implementation, platform registry and interaction tests are preserved unchanged from the Android
audit SHA. Canonical identifiers, dependency lockfile and EAS profiles are preserved. Exact-path provenance entries support
the new provider/UI/doc changes; no assertions or historical boundary rules are disabled.

## Restoration evidence (A/B/C)

| Case | Strongest evidence in this closeout | Classification |
|---|---|---|
| A — same-device authenticated session restore | Real AccountRuntime/composition with scripted secure storage and session client; stored credentials restore and re-identify, binding stays durable, routing waits for hydration/session resolution, no first-run/Welcome bypass or flash is authorized. | PASS/source; native credential/provider execution NOT RUN. |
| B — same-account reconnect after expiry | Expired/failed refresh degrades locally, preserves household and pending work; same actor resumes existing binding/transport; wrong actor is refused/quarantined rather than taking local ownership. Existing account/access/sync transport tests execute the source path. | PASS/source; live expiry/reconnect NOT RUN. |
| C — another device | Current source **already contains pristine-device cloud household adoption** (`accountRuntime.ts` bootstrap/superseded-by-cloud branch, `composeAccountApp` pull-first namespace). Existing tests prove empty-device binding, invalid-id refusal, local-work race refusal and durable-write rollback. A non-pristine device is not merged or overwritten; local/private data outside designed sync coverage is not magically recovered. | **DEFERRED for general migration/recovery product scope**. Existing narrow source adoption is preserved; no implementation of migration/merge/recovery or live device certification is authorized or claimed. |

Returning-user focused regression: **62/62 PASS**, including `accountRuntime`, `sessionContinuityTransport`, platform account
access and cross-account integration. This corrects the overly broad historical “new-phone restoration unavailable” assumption:
limited pristine adoption exists; general migration/recovery remains out of scope. Copy reconciliation belongs to the owner's
separate Welcome Tree workstream and was not performed here.

## Remaining defects, policy and store gates

| Item | Current candidate evidence / location | Internal engineering artifact | Store/external release / owner |
|---|---|---|---|
| B2B-N04 release policy | `scripts/verify-release-identity.mjs`, `RELEASE_BRANCHES`, still permits only `build/02-gemini-integration`. A concrete one-branch proposal is in `docs/release/BUILD2B_RELEASE_POLICY_PROPOSAL.md`; **not applied**. | **Blocks a passing release preflight and final EAS readiness** until owner approval and exact-SHA revalidation. | Repository/release owner; no generic bypass or older-source substitution. |
| IOS-S01 account/data deletion | Current Your Account provides status/restore/sign-out, not deletion; no account-deletion route/function/RPC was implemented in this assignment. Old cascade comments are not a consumer deletion flow. | Does **not** block a controlled internal engineering artifact with designated accounts. No consumer-release certification. | **Mandatory store blocker** per owner. Requires separately authorized app/backend purge, reauthentication/confirmation, provider revocation, session/local cleanup and tests. Sign out is not deletion. |
| IOS-S03 paid-benefit exposure | `src/monetization/featureAccess.ts` has two plus placeholders; `checkFeatureAccess`/`usePremiumGate` have no delivered gated consumer feature. `app/onboarding/plus.tsx` and Welcome offer benefits therefore remain ahead of implementation. | Does not block a controlled engineering artifact when real paid sales are excluded; source restores the entitlement, not a claim of delivered differentiated value. | **Mandatory store/real-paid-sale blocker**. Product owner must connect real benefits or correct claims and sales scope. Welcome copy/sequencing remains assigned elsewhere. |
| N12 RevenueCat live configuration | Read-only connector lists only `proj46588afb` / K Scan AI; no Her Keys project/paywall is accessible through that connection. Source still uses native `presentPaywallIfNeeded` with current offering and `her_keys_plus`; remote restore control/packages/transfer policy unverified. | No blocker to compiling an engineering artifact; **do not treat sandbox/real-paid restoration or no-transfer policy as certified**. | Her Keys RevenueCat connection/console owner and sandbox QA. No dashboard or product changes made. Server may transfer store receipts according to its own configuration; local UUID checks do not prove that policy. |
| N03 identity diagnostics/retry | Composition still discards the `IdentifyResult`; safe SDK guards now refuse store/entitlement operations when identification fails. No automatic account reassignment/retry is invented. | Safe unknown/unavailable state and existing free access preserved; test keys/billing still need verification. | Monetization owner can add diagnostics/guarded retry separately. |
| N05 flag / N10 server consent | Selected internal Production profile sets mandatory flag=true and EAS target hook retains its enforcement. Historical server secret/config evidence is not fresh authenticated refusal evidence. | Post-build test: legitimate declined-account direct refusal and consenting control, before asserting live AI consent certification. | Security/backend workstream; no bypass allowed. |
| Native/runtime matrix | Real restore/paywall/store transfer, device Back/IME/large fonts/accessibility, signup/confirmation/recovery, welcome mail and real sync are **NOT RUN**. | Engineering build is intended to obtain these observations, after release policy/source prerequisites and explicit EAS approval. | No physical-device, live service or store certification. |

Read-only reconciliation also inspected the concurrent iOS report at `925a9b445b75a3f34a7bd9a102167c65f6895f4b`
(`docs/audits/HK_IOS_BUILD2_CANDIDATE_AUDIT_20261013.md` on its own branch). Its IOS-S02 restore finding is repaired in source
here. Its account deletion, Premium value, settings/legal/support exposure, Apple credential lifecycle and native/privacy/store
findings remain assigned to their owners. That branch/report was not overwritten or absorbed. No new Welcome Tree exception
is approved by this closeout; existing sequencing/presentation work and exceptions remain separate.
