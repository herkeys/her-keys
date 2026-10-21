# Native build and purchase evidence
Canonical identities are unchanged: Android com.heykeys.app; iOS com.herkeys.app; EAS project 7b25f8fe-d7de-49c1-ba69-1fd3a065826a owned by ams2dad.

EAS remote baselines were read as Android 2 / iOS 2. Production now uses remote appVersionSource and autoIncrement=true for both platforms. A future successful build must verify its actual resulting version; no version 3 artifact is claimed here.

EAS environment inventory: development public keys match Test Store on both platforms and Staging Supabase; preview matches native platform keys and Staging; production matches native platform keys and Production. No placeholder or secret API key is accepted by the client. Test Store requires an explicit Staging route AND Debug JS build. Development and diagnostic Android profiles now compile assembleDebug; development iOS uses Debug. Native-store profiles retain their platform keys.

Quota checked directly with eas account:usage ams2dad: Free plan; Android 15/15 used, iOS 4/15 used; billing cycle ends 2026-11-01T00:00:00Z. No Android cloud build was submitted, no plan upgraded, no charge incurred. Windows has no supported iOS local runtime; no TestFlight upload or public submission was made.

Local Android release compilation succeeded (645 tasks; 11m49s). APK SHA-256 1F9F8C358592C92E417353B0632BCFFE78747B8BF0EF268D804784B60B0BA6B9. This first internal artifact deliberately used Test Store credentials but exposed a native SDK constraint: RevenueCat intentionally crashes non-debuggable Test Store builds. The emulator reproduced the SDK alert and PurchasesException. This is recorded as a failed Test Store runtime artifact, not a certified purchase build. Source/profile guards were then repaired and a native Debug build started for correct Test Store QA.

[RevenueCat's release-build restriction](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store#test-store-api-keys-in-release-builds).

The emulator installed APKs with install -r without clearing existing data. The initial Debug/Metro artifact compiled in 9m39s (403 tasks), SHA-256 120336FBBDD48486FC5539B288B056728B7E07207CC5CDAB016A872F045AE82E. It accepted the Test Store SDK route, restored the existing Staging session and opened Today/Your Account with all three Premium tools available. The account has a pre-existing test_fixture entitlement; this is not a purchase result. No new Test Store transaction was made, neither checkout flag was enabled, and the other fresh tester's login credential was unavailable.

Native QA found and repaired two additional discrepancies: identical sibling keys for Premium/Restore, and RN fetch rejecting offline with plain Error. The latter initially made both warm and cold offline launch fail despite passing browser-style unit tests; explicit transport-only classification and five regressions fix that native gap. HTTP denials and malformed responses still fail closed.

A raw embedded dev bundle was rejected by Expo's devtools websocket policy; it was a diagnostic attempt, not a release artifact. For offline testing without Metro, Expo export:embed --dev false produced a bundled diagnostic in a native Debug APK. Because JS is non-development, its Test Store key is safely refused by the client guard. That artifact tests local household/account behavior with billing unavailable; it does not certify checkout. The final repaired diagnostic compiled in 1m25s (403 tasks), SHA-256 685C4FFB271D0BEACACD57812C183AC4D1F913A2061CBF1768678BDC0C0E2F38, source 9a087d8. Raw JS diagnostic startup is not a release performance benchmark.

Exact startup/offline/recovery evidence and all exploratory artifact outcomes are in evidence/native-final.json. Neither a local Debug APK nor Test Store activity proves Play-installed internal testing, upload-key signing or Apple sandbox billing. No iOS artifact was built, no TestFlight upload/public release occurred, and no actual Google/Apple lifecycle is certified.

