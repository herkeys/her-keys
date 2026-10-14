# Build 2 release-branch policy update — prepared, awaiting owner approval

Status: **OWNER_APPROVAL_REQUIRED**. Nothing in this document has been applied. It does not disable, loosen or bypass the release guard and it
does not authorize EAS, a store submission or a merge. It supersedes the proposal text in `BUILD2B_RELEASE_POLICY_PROPOSAL.md` by supplying a
verified patch for the same single-branch change.

## What was investigated

| Question | Finding |
|---|---|
| What does `npm run release:preflight` enforce? | `scripts/verify-release-identity.mjs --release`: canonical Android/iOS identity, then provenance: branch ∈ `RELEASE_BRANCHES`, no tracked changes, `HEAD` equals its upstream. |
| What does `RELEASE_BRANCHES` contain? | One literal: `build/02-gemini-integration`. The line above it says: "Changing this list is an owner decision." |
| Where is that branch? | `origin/build/02-gemini-integration` = `0cf041a`, an **ancestor** of the converged line and **219 commits behind** it. Nothing on the converged line can satisfy the guard, and building from that branch would ship none of the Build 2A/2B repairs. |
| Where else does the list matter? | Only `release:preflight`. The EAS builder hook (`eas-build-post-install`) runs the identity check and, on EAS, the backend/consent checks, but not the branch allowlist. CI runs `verify:release-identity` (no `--release`). |
| What is independent of the list? | Exact-SHA CI triggers (`.github/workflows/v2-integration-validation.yml` push list) — handled separately and already includes the shared consumer branch. |

## The prepared change

`docs/release/patches/build2-release-branch-allowlist.patch` (apply with `git apply`; `git apply --check` is clean on the shared consumer
repair tree, and it applied and passed `tests/releaseIdentity.test.mjs` 12/12 on a scratch copy before being reverted):

```diff
-export const RELEASE_BRANCHES = Object.freeze(['build/02-gemini-integration']);
+export const RELEASE_BRANCHES = Object.freeze(['build/02-gemini-integration', 'codex/build2b-release-candidate']);
```

plus two regression tests in `tests/releaseIdentity.test.mjs`:

1. The list is exactly those two literals (no pattern characters), the candidate passes provenance, and each of these is **rejected**:
   `codex/build2b-shared-integration`, `integration/build2-shared-consumer-repair`, `audit/ios-build2-candidate`,
   `codex/build2b-android-candidate-audit`, `codex/build2b-release-candidate-2`, `codex/build2b-release-candidate/x`, `main`, `HEAD`, the empty string.
2. Admitting the branch keeps the other safeguards: a dirty tracked tree, a `HEAD` that differs from its upstream, and a missing upstream still fail,
   and `checkBackendTarget` still requires `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE` to be exactly `true`.

The branch name is the one already proposed in `BUILD2B_RELEASE_POLICY_PROPOSAL.md`, kept for continuity. Using another name is a one-token change to the patch
and to the first test; the owner picks it.

## Safeguards that are not touched

Android `com.heykeys.app` and iOS `com.herkeys.app` identity, owner/slug/EAS project, clean tracked tree, pushed `HEAD` equal to upstream, explicit
Supabase target with the exact project URL and a client key, empty data mode, and the mandatory consent flag. No wildcard, no environment bypass and no
"audit branch" exception is proposed.

## If the owner approves

1. Create `codex/build2b-release-candidate` at the **certified** converged SHA (shared consumer repair + deletion integration + Welcome Tree, once each is
   merged and exact-SHA CI is green). Do not move it afterwards.
2. On that branch only: `git apply docs/release/patches/build2-release-branch-allowlist.patch`, commit, push.
3. Exact-SHA CI on the resulting SHA (add the branch to the workflow push list for the run; remove with the branch).
4. On a clean checkout of the pushed SHA run `npm ci` and `npm run release:preflight`; it must print `RELEASE_IDENTITY=PASS`.
5. Present the result for a **separate** EAS authorization. Approval of this policy is not that authorization.

## Rollback

Remove the second literal and the two tests, then rerun `tests/releaseIdentity.test.mjs`. Nothing else depends on it.

## Risk

Admitting the named branch changes which source may pass release provenance. It does not certify live services, Premium value (see
`docs/audits/HK_BUILD2_SHARED_CONSUMER_REPAIR_LEDGER.md` §3), store compliance or device behavior.
