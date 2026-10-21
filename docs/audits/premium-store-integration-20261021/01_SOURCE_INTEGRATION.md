# Source integration — 2026-10-21
Repository: herkeys/her-keys. Authoritative remote candidate was fetched and verified at `3416f3ad5e2474e1ac93114c373c0eda16c5d62c`. Repair branch: `codex/premium-release-certification-20261021`. Worktree: `C:\Users\jsmit\Her-Keys-Premium-Cert`.

The primary checkout and its unrelated uncommitted work were preserved. The isolated `codex/premium-trial-gating` worktree was inspected at `e6f65f3f23acc4f72c39355f8c73c899d429c1d5`. Its only changes beyond main were app identity, EAS versioning and its audit. V2 already had the correct identifiers, owner, project, native plugins, consent and feature implementations. Only remote version management and both-platform auto-increment were ported; no main-based Premium implementation was merged.

Focused commits:
- `d9ec3dd`: remote versions and explicit SDK store routing.
- `b35a0c1`: D06 recent account-bound local access with sync suspension.
- `cb829bd`: verified trial projection, client copy, additive migration, malformed-provider rejection.
- `43005e1`: native Debug Test Store profiles and release-key rejection.
- `bbe6888`: per-request sync fencing during account revalidation.
- `0aa7f31`: isolated tester-only Staging checkout, default OFF in both environments.
- `bb3edd2`: nine audits, sanitized store evidence and read-only Apple audit helper.
- `e156173`: readiness regression updated to retain owner-scoped RPC checks for both store lanes.
- `e9db821`: native-found duplicate Premium/Restore sibling keys repaired; owner-only Apple credential handoff helper added.
- `9a087d8`: actual Android fetch failures classified explicitly for D06; HTTP/JSON failures remain closed; five regressions and safe debug diagnostics.
- `4dc6f26`: exact ownership registration for that new adapter; no broad boundary exemption.

Ownership review: inspected recent history for auth/deletion, monetization, EAS and iOS/Android repairs before editing. Shared changes are limited to the D06 client gate/sync runtime, existing Premium contracts and additive Premium-only schema. No deletion processing job, deletion-owned table, authentication provider or consent rule was replaced. The Meals boundary register records exact migration and shared-file ownership. The native prebuild's incidental package script changes are excluded from the PR.

Source CI must be evaluated on the final pushed head and again on the merged candidate; intermediate successful CI is not final certification.

PR: https://github.com/herkeys/her-keys/pull/43. Source head `e156173c74a101cad54affcc3f6bca0826f21922` passed exact-head CI run [39571646672](https://github.com/herkeys/her-keys/actions/runs/39571646672). The local final full suite passed 5,285/5,285, with zero skipped/canceled tests; TypeScript, release identity, Expo compatibility, Expo Doctor 21/21, native config and whitespace checks passed. The earlier failed run 39571176352 exposed one obsolete structural readiness assertion; the corrected test and entire suite passed afterward.

Manual change review covered all production source diffs: server-only projection writes/RLS, per-account cache and namespace fences, every sync transport request, fail-closed SDK routing, additive migrations and nullable period parsing. No existing V2 feature implementation was replaced. Final merge and post-merge gate evidence is linked in the closing handoff; CI checks can also be independently resolved from the PR's exact merge SHA.

Final application source `e9db8215c7c0cc26422cf6a4096dffd71928b6bb` passed [CI 39573689781](https://github.com/herkeys/her-keys/actions/runs/39573689781). A fresh local full suite after that UI change also passed 5,285/5,285 in 95.8 seconds. The following evidence-only commit receives its own exact-head CI before merge. React review of the two edited TSX screens checked hook order, stable child identity/account remounts, effect cleanup and accessible offline retry text; no unrelated refactor was added.

Closing application source `9a087d80c3681ec375f34ab230e2c73f824d68e0`, with exact ownership registration at `4dc6f26cab3682a88c39d24ca3cb73248aaa511d`, passed [CI 39575749242](https://github.com/herkeys/her-keys/actions/runs/39575749242). The final local full suite passed **5,290/5,290** in 111.1 seconds; 96 focused native-network/account/sync checks and 13 ownership checks passed. Android cold offline launch and a durable offline capture were then verified on the repaired diagnostic artifact, independently of unit tests. The closing evidence commit is required to pass its own gate before merge.

