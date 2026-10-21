# Morning handoff

Overall decision: **CONDITIONAL PASS for engineering integration; HOLD for commercial release. Production checkout is not technically certified for activation.**

| Area | Status / evidence |
|---|---|
| Source integration | Current V2 preserved; focused repairs in [PR 43](https://github.com/herkeys/her-keys/pull/43). Exact final merge/CI evidence is provided in the closing handoff and PR checks. |
| Premium features | Daily Load, Smart Inbox and Momentum preserved. Feature/account/consent/RLS regression suites pass; native Account shows all three available. Real store-funded feature use remains uncertified. |
| RevenueCat catalog | Six monthly/yearly products, entitlement and packages match. Test Store lifetime preserved. P1M / ONE_MONTH offers and current prices verified directly. Corrected paywall draft remains unpublished. |
| Google Play connection | BLOCKED: purchase API says "No application was found for the given package name"; catalog checks pass. Her Keys Play admin account is inaccessible here. |
| Apple connection | Existing Her Keys EAS ASC key verified against Apple; live prices/offers read. RevenueCat upload requires owner credential entry. Both subscriptions remain MISSING_METADATA. |
| Trial lifecycle | Verified period projection, CAS, server/client validation and shared Account/Home copy implemented; lifecycle/date/isolation tests pass. Actual Google/Apple sandbox lifecycle not certified. No fixed 30-day trial. |
| Staging checkout | Native/commercial checkout OFF. Separate tester-only Test Store flag defaults OFF; native outcomes/final flags are in evidence/native-final.json and backend-final.json. |
| Production backend | Both additive migrations and all five Premium functions deployed through Staging; code hashes match. Entitlements preserved, fixture mode OFF, deletion jobs inactive. |
| Production checkout | OFF; separate owner authorization required after all commercial gates pass. |
| Android native | Local Release/Debug compilation completed; Release/Test Store crash reproduced and guards/profiles repaired. Debug startup/account restoration passed. No Play-installed licensed purchase or certified upload AAB. Cloud Android quota 15/15 used. |
| iOS native | Identity/config verified; quota 4/15 used. No macOS/iOS runtime, StoreKit purchase, TestFlight upload or native trial certification here. |

Completed: selective V2 integration, remote EAS versions and both-platform increment, explicit SDK routing, correct Debug Test Store profiles, strict provider-grant validation, scheduled-plan reconciliation, verified trial metadata and truthful Account/Home copy, D06 account-bound local access with per-request sync fencing, distinct Premium/Restore keys, two additive migrations, five-function parity, signed provider Staging TEST (200/ignored_test), legal review and corrected paywall draft. Baseline: 5,266 tests; final integrated suite after the native transport repair: **5,290/5,290 passing**, zero skipped/canceled. Typecheck and 41 focused UI checks passed. Commit ledger, deployment versions/hashes and blockers are in 01, 03, 07 and evidence/.

Native D06 passed cold offline launch, Today/Life navigation and a durable offline capture that survived force-stop/relaunch. Only that test capture was resolved, while still offline. Online cold relaunch restored the account and removed the offline notice; the exact test item then reached Staging as resolved, revision 1. Original airplane/Wi-Fi/cellular settings were restored. This diagnostic safely refuses billing and is not store purchase evidence; its hash, screenshots and prior failed attempts are retained in evidence/native-final.json.

Owner-only checklist:

1. **Apple credential handoff:** open [Her Keys RevenueCat apps](https://app.revenuecat.com/projects/93809efe/apps), choose Apple app app55f51de583, and enter the verified existing key. Run `scripts-dev/premium-store-certification/prepare-apple-credential.ps1 -ExportForOwnerUpload` locally to produce the owner-only ACL-restricted temporary file. It prints only its path, key ID XTNYDBS8T8 and issuer 482fa4b7-89d8-4282-8963-5d2a1e68c960. Run the same script with `-Cleanup` immediately after saving/verification. The original is user-bound encrypted data under %LOCALAPPDATA%\HerKeys\billing, outside Git. No new key or K Scan credential is needed. Browser credential entry/submission requires owner handoff.
2. **Google administrative access:** sign into the Her Keys Play developer account and verify the existing service account's access to com.heykeys.app, purchase permissions/API enablement and initial signed testing AAB state. Provide correct account/testing access so engineering can rerun validation and native sandbox tests. No quota upgrade is requested.
3. **Store and paywall approval:** complete/approve Apple's missing subscription metadata and provide native sandbox tester/device access. Review the [corrected paywall draft](https://app.revenuecat.com/projects/93809efe/paywalls/pw9aa8edf9bdb34338/builder) and explicitly authorize publication if ready. The published revision still has the defects in 06.
4. **Commercial authorization:** after engineering records actual store sandbox lifecycle passes and all runbook gates pass, separately authorize Production checkout if desired. This does not authorize a public store release.

Do not treat provider TEST, fixtures, unit tests, a compiled APK or Test Store activity as proof of Google/Apple purchases. No real-money purchase, new cloud charge, public release or deletion-worker activation occurred.

**PRODUCTION CHECKOUT — AWAITING SEPARATE OWNER AUTHORIZATION**
