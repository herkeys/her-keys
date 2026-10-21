# Apple compliance report — account deletion Phase 2 (2026-10-20)

References: [Guideline 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple). Phase 1 source review: `../ios-compliance-report.md` (still accurate except where noted below).

## Gate results

| Gate | Result | Basis |
|---|---|---|
| `IOS_DELETION_SOURCE` | **PASS** | In-app path Your Account → Privacy & Data → Delete Account; recent verification; pending/restored/review/purged states; store-managed subscription disclosure; device namespace fencing (Phase 1, retained). Legacy Apple blocker repaired (DEL-P2-001). Full suite 5,237/5,237. |
| `IOS_DELETION_NATIVE` | **NOT_RUN** | Windows host: no Xcode or iOS Simulator. No IPA was built (not authorized). |
| `APPLE_REVOCATION` | **NOT_VERIFIED** | Live Apple revocation is owner-deferred (`SKIPPED_OWNER_DECISION`, Phase 1). Source tests cover revoke, invalid_grant, missing material and outages. Apple Developer key, Services ID and entitlements are unverified. |
| `APPLE_POLICY` | **PARTIAL** | Source flow complies once DEL-P2-001 is approved and deployed. Blocked on legal disclosures (AD-011), native evidence and live/configured revocation (or explicit acceptance of the deferral). |

## Legacy credential investigation (Phase 2 §6)

**Finding: confirmed.** At PR #39 (`e265f27`), an Apple-linked account without stored revocation material could never reach terminal completion. The full trace is DEL-P2-001 in `10-defect-ledger.md`. In short: the worker threw on every attempt, Auth was removed after the eighth, and `providers:true` was never written, so `finish` never ran and the request stayed `failed_requires_action` with no operator exit.

How each part of the old design handled it:

| Area | Behaviour at e265f27 | Phase 2 behaviour (7b2fe25) |
|---|---|---|
| Identity capture | `capture-apple-credential` exchanges the authorization code, verifies issuer/audience/subject against the user's Apple identity, stores the AES-GCM-encrypted refresh token | Unchanged |
| Legacy detection | No row + (Apple identity live, initiation snapshot `identity_providers` contains `apple`, or earlier `apple_legacy`) | Unchanged inputs; now produces a settled outcome |
| Revocation request | `POST /auth/revoke`, `token_type_hint=refresh_token`; any non-2xx = outage | `invalid_grant` = credential unusable (expired / user already revoked); 429/5xx/`invalid_client`/other 400/unconfigured = retry |
| Missing token | Throw → retry forever | `apple_revoked='manual_revocation_required'` (never `true`), `apple_legacy` retained |
| Outcome recording | Only `true` or `requires_retry` | `true` (confirmed, or no Apple link) / `manual_revocation_required` / `requires_retry` |
| Auth removal ordering | Auth removed at attempt ceiling, then terminal blocked | Auth removed after private cleanup and provider settlement, then `finish` |
| Terminal requirements | `providers:true` only if all three keys `===true` | `providerSettled()`: Apple may settle as manual; Google only as `credential_already_invalid` (DEL-P2-002); RevenueCat only `true` |
| Identity safety | An unverified identity throws `apple_identity_unverified` | Unchanged; Apple cannot settle without a verified Auth lookup or initiation snapshot |
| User instructions | None | Completion email + in-app panel: Settings → your name → Sign-In & Security → Sign in with Apple → Her Keys → Stop Using |
| Audit evidence | Request evidence (deleted at finish) | Same. During processing the request evidence shows `apple_revoked='manual_revocation_required'`. After purge only the approved five-field proof remains. Adding an aggregate "manual revocation" counter to run rows would change a schema and the proof meaning, so it is proposed, not built. |

What is deliberately **not** done: no generic success override; no `apple_revoked=true` without a confirmed Apple 2xx; an Apple outage never becomes manual settlement during the retry budget.

One interaction to approve explicitly: Phase 1 deletes stored provider credentials when attempts are exhausted. If an operator later requeues an exhausted Apple **outage**, the material is gone and the retry settles as `manual_revocation_required`. That is truthful (the grant was not revoked and the user is told), but it means a long Apple outage ends in manual revocation. **Approval item A-1.**

Apple server-to-server notifications (`consent-revoked`, `account-delete`) are not handled (DEL-P2-014, P3). Not required by 5.1.1(v); recommended by TN3194.

## Required approvals

1. **Security/product:** accept `manual_revocation_required` as satisfying Apple provider evidence (DEL-P2-001) and the A-1 interaction.
2. **Owner:** run, or explicitly continue to defer, a live Apple revocation test with a disposable Apple ID; verify the Apple Developer key, Services ID and the four `APPLE_DELETION_*` secret names in Production.
3. **Legal:** publish the deletion and revocation disclosure (see `09-legal-handoff.md`).

## Native iOS test plan (reproducible; not executed)

Device: an iPhone on the current iOS, or Simulator on macOS with Xcode matching Expo SDK 57. Build: a development or internal build of the approved commit against **Staging** `fhhudicklmpofuzkxeqe`. No App Store build is needed.

| # | Step | Expected |
|---|---|---|
| 1 | Sign in with Apple (disposable Apple ID; one with Hide My Email) | Account binds; `capture-apple-credential` returns `stored` |
| 2 | Settings → Your Account → Privacy & Data → Delete Account | Panel shows the 30-day recovery, store subscription, Apple revocation and 365-day proof copy |
| 3 | Confirm without recent verification | Refused with the re-verify notice |
| 4 | Re-verify (fresh Apple sign-in or email code), confirm | Gate shows pending + deadline; sync stops; access blocked |
| 5 | Kill and relaunch the app | Still pending; no local data shown as deleted |
| 6 | Recovery email → confirm restore | Restored; sign in again works |
| 7 | Second account on the same device (switch A→B) while A's request is pending | B is unaffected; A's receipt stays namespaced |
| 8 | Shared household: second adult on another device | Departing adult's request ends in review (`failed`) with no terminal proof |
| 9 | Scoped Staging acceleration of the owned fixture only, then worker run | Terminal proof; app shows verified purge; local reset offered |
| 10 | Legacy case: delete the `apple_revocation_credentials` row for the fixture before step 9 | Terminal proof issued; request evidence showed `manual_revocation_required`; email contains the Stop Using steps |
| 11 | Settings → Sign in with Apple | After step 9 Her Keys is gone (live revocation), or the manual steps remove it (step 10) |
| 12 | Subscription links | Open the Apple subscriptions page; deletion did not cancel a subscription |

Record each step's screenshot plus the request/proof rows. Evidence must be labelled simulator or physical device.
