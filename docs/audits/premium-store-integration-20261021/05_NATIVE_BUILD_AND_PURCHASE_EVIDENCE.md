# Native build and purchase evidence
Canonical identities are unchanged: Android com.heykeys.app; iOS com.herkeys.app; EAS project 7b25f8fe-d7de-49c1-ba69-1fd3a065826a owned by ams2dad.

EAS remote baselines were read as Android 2 / iOS 2. Production now uses remote appVersionSource and autoIncrement=true for both platforms. A future successful build must verify its actual resulting version; no version 3 artifact is claimed here.

EAS environment inventory: development public keys match Test Store on both platforms and Staging Supabase; preview matches native platform keys and Staging; production matches native platform keys and Production. No placeholder or secret API key is accepted by the client. Test Store requires an explicit Staging route AND Debug JS build. Development and diagnostic Android profiles now compile assembleDebug; development iOS uses Debug. Native-store profiles retain their platform keys.

Quota checked directly with eas account:usage ams2dad: Free plan; Android 15/15 used, iOS 4/15 used; billing cycle ends 2026-11-01T00:00:00Z. No Android cloud build was submitted, no plan upgraded, no charge incurred. Windows has no supported iOS local runtime; no TestFlight upload or public submission was made.

Local Android release compilation succeeded (645 tasks; 11m49s). APK SHA-256 1F9F8C358592C92E417353B0632BCFFE78747B8BF0EF268D804784B60B0BA6B9. This first internal artifact deliberately used Test Store credentials but exposed a native SDK constraint: RevenueCat intentionally crashes non-debuggable Test Store builds. The emulator reproduced the SDK alert and PurchasesException. This is recorded as a failed Test Store runtime artifact, not a certified purchase build. Source/profile guards were then repaired and a native Debug build started for correct Test Store QA.

[RevenueCat's release-build restriction](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store#test-store-api-keys-in-release-builds).

The emulator installed the local APK with install -r without clearing its existing data. Exact final Debug artifact, startup, account/offline and Test Store outcomes are added to evidence/native-final.json after execution. Neither a local debug APK nor a Test Store purchase proves Play-installed internal testing, upload-key signing or Apple sandbox billing.

