# AI consent Production promotion manifest — 2026-10-17

Status: NOT ELIGIBLE FOR PROMOTION. Build Manager approval and completed Staging authenticated certification are required.
No Production deployment or configuration mutation has occurred.

## Exact artifact

Repository: herkeys/her-keys.
Handler/shared files are byte-for-byte the tested entry source at d775b1fadea6e4d5b1da4a8e81738f539231a5e5.
Subsequent repair commits do not alter these files.
Staging: fhhudicklmpofuzkxeqe, herkeys-ai v11, verify_jwt=true.
Downloaded deployed ezbr_sha256: f7b98ea09472119d2005a9f7b990d1264d25e654efa1f694094a0c767b26da14.
All three downloaded file contents compared exactly equal to the submitted workspace source, including line endings.

Production remains npykvnxnehlsdlbumzwk, herkeys-ai v7, verify_jwt=true.
Current Production ezbr_sha256: 74cc1b82cc77c1e02c480bef2675df7cc3d9422ee35675e8fa0328028a83a16c.
Its source retains the optional environment guard. Historical toggle value/bypass is unknown.

Files and hashes:
[
  {
    "path": "supabase/functions/herkeys-ai/index.ts",
    "sha256": "dc1790f6b9ac83a4146d2e1eb4f0a864931ebd68383d913a606c1007156948e0",
    "lfSha256": "aac220a89f1de59cb9b6152a53bb7e5cb50107afc656e63a4d38184fbe7f27b5"
  },
  {
    "path": "supabase/functions/_shared/supabaseAdmin.ts",
    "sha256": "7fe68234426c9d03d27d182c8ba7ae77e619efe9e23c920801fed2cd6e238ad9",
    "lfSha256": "a985c9ee345c41c92ef0014b06e744ec659db43f63e79d08d09a4a61bb83ef96"
  },
  {
    "path": "supabase/functions/_shared/http.ts",
    "sha256": "ece84e7e17f3d21feb6b99ffa0606864196cf5848a1d0ddbb631f6f3cbea5f38",
    "lfSha256": "58f66be6e4f4056ae0637d4abcb71418bf063cd9ce3b5a26789edbbc2162576a"
  }
]

Raw workspace SHA256 includes CRLF; LF SHA256 identifies canonical Git text. Bundle hash is a separate Supabase artifact hash.

## Evidence matrix

| Case | Shipping handler execution | Authenticated deployed Staging |
|---|---|---|
| Missing / declined / withdrawn / outdated consent | PASS, zero provider fetches | BLOCKED_TEST |
| Wrong account/type receipt | PASS, zero provider fetches | BLOCKED_TEST |
| Read error / thrown ledger error | PASS, zero provider fetches | BLOCKED_TEST |
| Invalid/expired session | PASS in handler; deployed missing/invalid JWT 401 | Valid expired-session fixture unavailable |
| Current affirmative receipt | PASS with structured mock provider | BLOCKED_TEST, real Gemini NOT_RUN |
| Provider failure / timeout / bounded retry | PASS in handler | BLOCKED_TEST |
| URL/action-claim/unearned confidence/invented evidence | Rejected by shipping handler | Real response NOT_RUN |
| In-flight account/household switch and unmount | Reproduced four unsafe dispatch cases; common source repaired and ten mounted tests pass | Authenticated live session test NOT_RUN |

No messages, JWTs, provider credentials or personal account details were logged.
No synthetic user content was sent to Gemini in this workstream.
Only empty denial probes were sent to the hosted endpoints.

## Governed procedure

1. Complete authenticated Staging scenarios with legitimate approved synthetic accounts (including provider invocation/timeout/retry and actual response safety); record request IDs, latencies, consent decisions, function version and redacted provider outcome.
2. Recheck PR head and these exact handler/shared-file hashes. Require Deno/type/regression checks and zero new owned failures.
3. Obtain Build Manager approval for this exact artifact, Production project, function, verify_jwt=true, and safe synthetic Production identities. Approval is not implied by source PR approval.
4. Deploy only herkeys-ai and its two shared dependencies. Download actual Production source immediately; compare all files and bundle hash with the tested artifact and record the actual new version. Do not use the deployment success response as parity evidence.
5. Run approved denial and affirmative probes in Production, inspect structured response and redacted operational logs, and certify only observed behavior. Keep checkout/feature flags and all databases unchanged.

Recovery/rollback: preserve unconditional consent and JWT verification. Do not roll back to the old conditional v7/v10 bundles. If the provider path is unhealthy, use an approved operational provider-disable action to return an honest unavailable state (Free local fallback remains), then redeploy the pinned consent-enforcing files. Re-download and rerun denial probes before resuming. Production recovery/configuration changes also require the controlled approval path.

AI_CONSENT_SOURCE=PASS
AI_CONSENT_STAGING_DEPLOYED=PASS
AI_CONSENT_STAGING_E2E=NOT_RUN
AI_CONSENT_PRODUCTION_PARITY=PENDING_APPROVAL
AI_CONSENT_REAL_LLM=NOT_RUN

