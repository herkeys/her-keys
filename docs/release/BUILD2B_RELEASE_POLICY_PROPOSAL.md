# Build 2B release branch — proposal only

Status: **AWAITING_OWNER**. This document does not modify or override the release guard and does not authorize a build.

The Build 2A handoff requires the converged candidate; `scripts/verify-release-identity.mjs` currently authorizes only
`build/02-gemini-integration`. The shared closeout branch `codex/build2b-shared-integration` preserves the audited Android repair
and implements N01/N02, but is intentionally not automatically admitted to release policy.

Proposed owner decision: authorize one specific branch, **`codex/build2b-release-candidate`**, created from the final exact-SHA
certified shared-closeout source. Keep the existing authorized branch and every other guard. Do not create/move the proposed
branch or apply this change until the owner approves it.

The complete proposed policy change is:

```diff
--- a/scripts/verify-release-identity.mjs
+++ b/scripts/verify-release-identity.mjs
@@
-export const RELEASE_BRANCHES = Object.freeze(['build/02-gemini-integration']);
+export const RELEASE_BRANCHES = Object.freeze(['build/02-gemini-integration', 'codex/build2b-release-candidate']);
```

What approval would permit next:

1. Create the named release-candidate branch at the certified integration SHA, without changing the concurrent iOS/Welcome
   branches or merging either workstream implicitly.
2. Apply the single whitelist addition on that release branch and add regression assertions that it is accepted while the
   integration branch, arbitrary branches, unpushed HEAD and dirty tracked trees remain rejected.
3. Push normally, run TypeScript/full regression/identity/native configuration and exact-SHA CI on the resulting new SHA,
   then rerun `npm run release:preflight` on its clean, pushed release checkout.
4. Present the resulting final candidate and any remaining blockers for separate EAS authorization. Release-policy approval
   **does not authorize EAS** or any store submission.

Retained without alteration: Android `com.heykeys.app`, iOS `com.herkeys.app`, owner/slug/EAS project checks, clean tracked
tree, pushed HEAD equality, explicit Supabase environment and project URL/publishable key, empty data mode, and mandatory
consent flag exactly `true`. No wildcard, environment bypass or generic “audit branch” exception is proposed.

Risk: admission of the named branch changes which source may pass release provenance; it does not certify live services,
Premium value, store compliance or device behavior. Rollback after approval: remove only the added branch from the list and
rerun policy tests. The currently audited integration SHA and final CI evidence are recorded in the closeout certificate.
