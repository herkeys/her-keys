# Morning handoff
Engineering status: source integration and backward-compatible backend repairs completed; final head/post-merge CI and native test evidence must be read from the closing evidence files. Commercial subscription release is HOLD.

Completed: selective V2 integration, remote versioning, correct Debug Test Store profiles, SDK routing guards, verified trial metadata and truthful Account/Home copy, strict provider-response validation, scheduled-plan reconciliation, D06 local access/sync fencing, two additive migrations, Premium function parity and signed Staging delivery. The baseline was 5,266 tests; the integrated suite reached 5,281 before the final checkout/sync additions. Final test count is recorded by exact-head CI.

Owner-only actions:
1. Connect the already-verified Her Keys EAS ASC key to RevenueCat's Her Keys Apple app. No new Apple key is necessary. Key ID XTNYDBS8T8; issuer 482fa4b7-89d8-4282-8963-5d2a1e68c960. Private material is saved as user-bound encrypted data in %LOCALAPPDATA%\HerKeys\billing\herkeys-revenuecat-asc-key.clixml, outside Git. The browser's credential handoff policy requires the owner to perform credential entry/submission. No K Scan credential was used.
2. Sign into the Her Keys Google Play developer account and verify the existing service account has access to com.heykeys.app, required purchase permissions/API enablement, and a signed initial testing AAB. The accessible browser account currently exposes only K Scan. Rerun RevenueCat's purchase-API check after correction/propagation.
3. Review the corrected paywall draft and authorize publication when ready. Its currently published revision retains the defects listed in 06. Complete/approve Apple subscription metadata and native sandbox tester access as required by the stores.
4. After actual Google/Apple sandbox lifecycle certification and all runbook gates pass, separately authorize Production checkout if desired. No upgrade of EAS quota is required or requested.

Do not treat provider TEST, fixtures, unit tests, a compiled APK or Test Store activity as proof of Google/Apple purchases. Existing Production feature availability does not authorize new subscription sales.

**PRODUCTION CHECKOUT — AWAITING SEPARATE OWNER AUTHORIZATION**

