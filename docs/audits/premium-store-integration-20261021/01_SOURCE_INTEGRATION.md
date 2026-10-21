# Source integration — 2026-10-21
Repository: herkeys/her-keys. Authoritative remote candidate was fetched and verified at `3416f3ad5e2474e1ac93114c373c0eda16c5d62c`. Repair branch: `codex/premium-release-certification-20261021`. Worktree: `C:\Users\jsmit\Her-Keys-Premium-Cert`.

The primary checkout and its unrelated uncommitted work were preserved. The isolated `codex/premium-trial-gating` worktree was inspected at `e6f65f3f23acc4f72c39355f8c73c899d429c1d5`. Its only changes beyond main were app identity, EAS versioning and its audit. V2 already had the correct identifiers, owner, project, native plugins, consent and feature implementations. Only remote version management and both-platform auto-increment were ported; no main-based Premium implementation was merged.

Focused commits:
- `d9ec3dd`: remote versions and explicit SDK store routing.
- `b35a0c1`: D06 recent account-bound local access with sync suspension.
- `cb829bd`: verified trial projection, client copy, additive migration, malformed-provider rejection.
- `43005e1`: native Debug Test Store profiles and release-key rejection.
- `bbe6888`: per-request sync fencing during account revalidation.

Ownership review: inspected recent history for auth/deletion, monetization, EAS and iOS/Android repairs before editing. Shared changes are limited to the D06 client gate/sync runtime, existing Premium contracts and additive Premium-only schema. No deletion processing job, deletion-owned table, authentication provider or consent rule was replaced. The Meals boundary register records exact migration and shared-file ownership. The native prebuild's incidental package script changes are excluded from the PR.

Source CI must be evaluated on the final pushed head and again on the merged candidate; intermediate successful CI is not final certification.

