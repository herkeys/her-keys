# V2 Codex backend deployment ledger

## AI dependency security patch

Source: PR #45, `0a93e9c745abc1eab110983d0167c5c1dc715385`, merged at `1926676bb4a5e9f5a5232e9b7444bafeb30fbd09`.

Reason: both live functions imported vulnerable Zod 4.6.5. Bundle comparison confirmed the reviewed source differs only by the approved import of Zod 4.6.7. No migration, schema, RLS, consent logic, provider configuration, secret or checkout change.

| Environment | Function | Previous | Deployed | Deployed SHA-256 |
| --- | --- | --- | --- | --- |
| Staging fhhudicklmpofuzkxeqe | herkeys-ai | 20 | 21 | 5f0c8dee30535c3f8221946e6140b5eb13a151eb658bbe8689406632a48821ea |
| Production npykvnxnehlsdlbumzwk | herkeys-ai | 12 | 13 | 5f0c8dee30535c3f8221946e6140b5eb13a151eb658bbe8689406632a48821ea |

Staging deployed first, then retrieved and compared all three files (entrypoint, supabaseAdmin, HTTP helper) to source. ACTIVE with verify_jwt=true. Live POST checks: missing Authorization returned gateway 401; anonymous-role JWT reached the application authentication guard and returned 401 unauthorized. Local shipping-handler executable suite passed 20/20, including missing, declined, revoked, outdated, wrong-account and unreadable consent, zero provider invocation on denial, valid consent and provider failure handling.

After those checks, promoted the identical bundle to Production. Retrieved all three files and confirmed equality, ACTIVE and verify_jwt=true. The same two live authentication rejection probes returned 401. No provider content or private user records were sent during those probes.

Scope of verification: dependency patch, deployed bundle identity and authentication startup. This does not certify real authenticated account recovery, real consent revocation against a provider, or complete application journeys. Those remain outstanding.

Rollback: recover the three function files at immutable starting SHA `a8cbf21dd707dfc5a5f27abf8355fba6eb89c996` and redeploy them with verify_jwt=true, first Staging then Production after validation. This reinstates vulnerable Zod, so prefer a forward repair if any regression is found. No data rollback is needed because this patch changes no stored data or database contract. Prior bundle source was retrieved before replacement; do not change consent/auth guards as part of rollback.

## Uncertainty behavior repair

Reason: source-level local uncertainty handling did not guarantee equivalent server behavior; a model could force an answer or create evidence when the user did not know. The reviewed handler now returns an acknowledged unresolved turn without provider invocation, after authentication, affirmative consent and request validation. Narrative openings still use the provider. Existing output checks also validate the deterministic response's inherited untrusted state.

Staging herkeys-ai 21 -> 22, ACTIVE, verify_jwt=true, deployment hash `3d2181e4eb35810ad4c187a434f84671f0550ef173e609dd7f4aa71aa43ee3f0`. Retrieved all three files and confirmed exact equality to the submitted bundle. Shared authentication and HTTP helper files unchanged. No schema, migration, RLS, secrets, entitlement, deletion or checkout modification.

Live synthetic Staging checks: grant/revoke through the shipping consent adapter; 403 before grant and after revoke; schema-valid deterministic uncertainty response (request 467350c3-54f7-44ec-9b7e-d7f5c5ff1b88); normal synthetic narrative still returns schema-valid Gemini response (request 86068c15-b700-4fd0-8e79-562d699f47ff). Local shipping-handler regressions also verify zero outbound provider calls on uncertainty, unsafe-state rejection and unconditional consent enforcement. Original test account's revoked choice restored. Full shared regression/CI is tracked in the execution ledger.

Rollback: redeploy the pre-change version-21 files (same as PR #45's dependency patch) with JWT verification enabled. This changes no data and retains Zod 4.6.7, consent and account-deletion guards. Production remains version 13 until a verified promotion is recorded here.
