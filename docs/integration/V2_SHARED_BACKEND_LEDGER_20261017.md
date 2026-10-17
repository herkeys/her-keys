# V2 shared backend convergence ledger

Entry SHA: `d775b1fadea6e4d5b1da4a8e81738f539231a5e5`.
Branch: `repair/v2-shared-backend-convergence-20261017`.
PR #32 verified OPEN at that exact SHA on 2026-10-17; no newer fixes/conflicts.
Clean pre-existing requested worktree relocated to `.worktrees/v2-shared-backend`. Main workspace local changes preserved.
No Production mutation, deletion change, platform repair, entitlement grant, checkout change or native build is authorized.

## Pass A checkpoint (entry SHA)

| ID | Priority | Environment/location | Root cause/reproduction and entry evidence | Consumer impact | Repair/regression/exit evidence | Classification/owner |
|---|---|---|---|---|---|---|
| S02-01 | P1 | Both deployed herkeys-ai/index.ts | Downloaded actual Staging v10 and Production v7; both contain HER_KEYS_AI_REQUIRE_CONSENT conditional; entry source unconditional | Potential enforcement discrepancy; historical toggle value/bypass unknown | Validate source, deploy Staging only, authenticate synthetic probes; Production gated | CONFIRMED_DRIFT / shared backend |
| S03-01 | P1-P2 unassigned until proven | RevenueCat webhook/reconcile | Destinations discovered with sandbox/production filters; positive provider delivery not tested | Unverified fulfillment | Audit source, authentication, ledger, projection and negative probes | UNVERIFIED / billing + shared backend |
| S05-01 | P1-P3 unassigned until proven | Live database/RPC parity | Staging 32 migrations; Production 29; timestamp counts alone do not prove missing schema | Unverified authorization | Compare definitions/grants/RLS and actual consumer roles | UNVERIFIED / shared backend |
| S04-01 | P2 pending confirmation | Shared AI presentation/reporting | Android scan insufficient; full inventory pending | Potential inability to report problematic output | Inventory operational reporting and review policy before collection changes | UNVERIFIED / product + shared backend |
| S06-01 | P2 internal / P1 release | scripts/verify-release-identity.mjs | Exact allowlist contains only build/02-gemini-integration | New V2 branch correctly cannot produce authorized store build | Add guard coverage; final branch nomination/allowlist require Build Manager | CONFIRMED_DRIFT / Build Manager |
| EX-01 | inherited | account-deletion suite | Eight inherited failures reported by entry candidate; rerun pending | Outside assignment | No changes permitted | DEFERRED / deletion owner |
| EX-02 | inherited | Premium Home suite | Three inherited failures reported by entry candidate; rerun pending | Separate shared assignment | No changes without delegation | DEFERRED / Premium Home owner |

## Evidence discipline

PASS requires an executed test and its result. Mocked handlers do not establish deployed authentication/provider delivery.
Provider and legitimate account access limitations remain BLOCKED_TEST; deployment success alone is not E2E.
Operational report reviewer/destination and approved retention must be established before introducing sensitive collection.
Production promotion and exact release-branch authorization remain PENDING_APPROVAL.

## Pass B checkpoint — source 22f14c3 plus subsequent actor-fence repair

- S02-01: Staging v11 deployed from exact entry handler/shared source; downloaded files exactly match. Bundle f7b98ea09472119d2005a9f7b990d1264d25e654efa1f694094a0c767b26da14, JWT verification true. Production v7 unchanged, PENDING_APPROVAL. Handler tests PASS (18); targeted consent/AI group PASS (51). Live authenticated scenarios BLOCKED_TEST; missing/invalid JWT hosted denial probes PASS. No Gemini content sent.
- S02-02 — P1 CONFIRMED_DEFECT, src/store/TalkItOutContext.tsx: pending provider completion/retry used the global current store after its owner changed or component unmounted. Four red reproductions dispatched into the replacement store. Repair invalidates on unsubscribe/owner transition and compares account/household/binding before applying a result. Ten mounted tests now PASS for ready/unavailable outcomes, rebind, unmount, retry and account bounce; Free fallback PASS. Owner: shared source. Residual: live authenticated session-switch test BLOCKED_TEST.

## Pass B follow-up checkpoint — bd9f398c912d4be67ae9790a35e9c869778bd429

- S02-03 — P1 CONFIRMED_DEFECT, src/platform/herKeysAiClient.ts and src/store/TalkItOutContext.tsx. The installed SDK resolves its current JWT after the asynchronous receipt query. Local red reproduction on c8921b7 sent account A's synthetic message under account B's JWT; seven of eleven SDK checks failed. This is implementation evidence, not a claim of an actual historical incident.
- Repair requires the originating bound account, captures its session JWT, constrains the receipt query to that account, passes an explicit Authorization header and owner AbortSignal, and aborts when account/household/binding changes or the component unmounts. The Edge payload does not carry client account or consent authority; server authentication and unconditional consent are unchanged. Free local fallback remains available.
- Exit evidence: eleven installed-SDK tests and fourteen mounted tests PASS, including four new cancellation tests. Original client assertions retained with owner/session fixtures. TypeScript and backend boundary tests PASS. Full suite 5,102 total / 5,091 pass / 11 inherited failures, zero new failures. No hosted credential or provider used. Live synthetic account-switch certification remains BLOCKED_TEST.
- Residual: content already sent before an owner changes cannot be recalled by client cancellation; pinned JWT prevents later session substitution, and late completions are discarded. Owner: shared source. See evidence/shared-backend-account-boundary.json and shared-backend-account-boundary-suite.txt.

## Pass C checkpoint — source audit and 119 passing webhook/reconcile/gate tests

- S03-01 remains NOT_VERIFIED for provider-originated authentication. Documented Authorization + HMAC format checked against current RevenueCat docs; no invented signing mechanism.
- S03-02 — P1 CONFIRMED_DEFECT (configuration), both hosted webhook and premium-ops: empty/missing and bad credentials receive 503 not_configured. This proves fail-closed unavailability, not working provider authentication. Exact missing secret/runtime field cannot be determined from public probes. No secrets or destinations changed. Repair BLOCKED_TEST awaiting approved Staging secret installation and provider test traffic; Production changes separately gated. Owner: billing/backend configuration.
- Source behavior PASS: authentication before persistence; malformed body refusal; durable provider event ID + environment deduplication; alias ambiguity/transfer reconciliation; out-of-order/refund clocks; CAS retries; durable failure/backlog/dead-letter recovery; content-minimizing logs. Unit tests do not certify the live provider.
- Staging webhook/ops v2 differs from Production v1 only in runtime requireHmac applying to staging as well as production. With correctly declared environments both actual deployments require HMAC; preserve strict Staging behavior. premium-gate/reconcile bundles match across projects. PREMIUM_ENVIRONMENT secret values remain UNVERIFIED.

## Pass D checkpoint — catalog parity and disposable SQL

- Actual metadata: Staging 76 relations / 1,147 columns; Production 77 / 1,154. All 189 RLS policy definitions match; shared columns, relation RLS/grants, and schema grants match exactly.
- Production-only welcome-email receipt table, seven columns, service-only grants and claim RPC are intentional outbound-email infrastructure. Staging has no corresponding table, consistent with suppressed outbound mail.
- Both projects expose 71 public/private functions. All shared definitions match except premium_authorize's deliberate Staging tester restriction. Staging-only readiness helper is service-only. Purchase readiness is identical, derives auth.uid(), checks lifecycle and independent checkout false. Service-only authorize/projection/event/reconcile functions are not executable by anon/authenticated. Consumer ledger RPCs derive auth.uid() and enforce ownership/authorized-operation keys.
- Live authenticated-role/no-subject SQL probe: readiness account_unavailable, consent rows zero. Consumer premium_events read denied 42501 in both. This does not establish signed-in A/B positive RLS; those tests BLOCKED_TEST.
- New disposable PostgreSQL test applies the complete unchanged migration chain, creates two local-only households, and passes 12 checks (parent included) of consent/RLS/grants, cross-household read/write denial, privileged RPC denial and durable event dedupe. No hosted users/purchases/entitlements/schema mutated.
- Canonical migration versions differ from historical hosted apply timestamps. Structural/functional fingerprints, not counts, establish the explained differences. Staging fixture/scheduler history and deletion-only differences remain DEFERRED. No applied migrations edited or new migrations deployed.

## Pass E checkpoint

- S04-01 now P2 CONFIRMED_DEFECT: full shared inventory found no compatible safety reporting route, submission backend or operational review queue. See V2_SHARED_BACKEND_AI_REPORTING_20261017.md.
- Implementation awaits owner-approved review destination/retention/attachment contract. New sensitive collection is an explicit owner decision; no inert control or unmonitored endpoint created. Owner: product/privacy + shared backend. AI_REPORTING=FAIL.

## Pass F checkpoint

- S06-01 nomination remains PENDING_APPROVAL. Proposed exact future branch: candidate/v2-shared-backend-convergence-20261017. Proposal is not authorization; no branch was added to RELEASE_BRANCHES and no Production build was run.
- S06-02 — P2 CONFIRMED_DEFECT, scripts/verify-release-identity.mjs: --release trusted cached @{u} and skipped backend validation outside EAS_BUILD. Repair requires live exact upstream SHA and Production URL/client configuration/empty mode/mandatory consent on --release, preserving every identity/branch/clean-source guard. Fifteen release tests PASS, including denied branch prefixes, missing/offline/local-only upstream and stale remote. Owner: shared release governance.
- Exact repair branch added only to validation workflow and scoped boundary provenance lane. No native-build workflow changed.

## Pass G source certification complete; hosted certification blocked

Fresh npm ci: 587 packages, PASS. TypeScript PASS. Deno checks for AI and all four Premium functions PASS. Expo dependency compatibility PASS; Expo Doctor 21/21 PASS. Boundary scan PASS after registering the exact assigned file ownership.

Initial full run: 5,042 tests, 5,029 pass, 13 fail. Eight deletion and three Premium Home failures are inherited/deferred. Two additional failures were (a) newly-created audit evidence lacking its boundary lane, now repaired, and (b) a CPU-contention calendar timing failure; isolated unchanged test passes (2.50ms against 50ms threshold). No assertion weakened. Final full suite: 5,087 tests, 5,076 pass, 11 inherited failures, zero new failures. Exact application-source CI fcdc7b9 (run 39047921590) has the same totals/failures; all other steps pass. Draft PR #34 remains uncertified for hosted/provider/platform handoff pending the documented owner inputs. See V2_SHARED_BACKEND_REPORT_20261017.md.


