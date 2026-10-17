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

