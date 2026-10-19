# Google Play deletion review — 2026-10-19

Android uses the shared in-app flow **Your Account → Privacy & Data → Delete Account**. Server identity, recent authentication and the same authoritative lifecycle apply regardless of Free/Premium status. Source tests cover stale JWTs, invalid proof, ambiguous network outcomes, account-switch races, review states and explicit local reset. The account flow does not require notification permission or an active subscription. Android native execution is NOT_RUN because the available emulator never completed boot/package-manager readiness after two attempts.

The actual public deletion destination is **[https://herkeys.app/delete-account](https://herkeys.app/delete-account)**. An HTTPS GET returned 200 and identified Her Keys, but the page is a disabled placeholder. It says self-service deletion will be enabled later and that no deletion API exists in that build. **[https://herkeys.app/account/restore](https://herkeys.app/account/restore)** returned 404. A source repository is not evidence that this public journey works.

[Google account-deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111) requires both an in-app request route and an accessible functional web resource without reinstalling the app. [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311) requires truthful deletion/retention representations. The currently deployed placeholder does not satisfy that web requirement. `GOOGLE_SOURCE_COMPLIANCE=BLOCKED` and `WEB_DELETION=BLOCKED` reflect this deployment gap, even though the self-service source builds and its receipt/status regressions pass.

[Website PR #9](https://github.com/herkeys/her-keys-web/pull/9) carries the existing unpublished email-OTP ownership verification, request/status/recovery flows and approved support address. It adds bounded requests, proof display before a response can be lost, and strict unexpired terminal-proof validation. Sessions and recovery material remain memory-only, fragments are removed from browser navigation, no-referrer/no-store headers apply, generic initiation avoids account enumeration, and the server uses `shouldCreateUser=false`. The browser calls the same deletion lifecycle as mobile. No website deployment or Play Console change occurred.

Google Calendar cleanup targets only the authenticated account's retained encrypted connection and applicable OAuth grant. It does not delete a Google account or original events. Source tests pin the revocation endpoint and error behavior. Live Google revocation remains NOT_VERIFIED under the owner's recorded deferral. Store management points to `https://play.google.com/store/account/subscriptions`; account deletion and subscription cancellation remain separate.

Proposed Data Safety submission after deployment and validation:

| Question/field | Proposed owner action |
|---|---|
| Account deletion available in app | Yes, after native journey verification; supply the actual Your Account path |
| Account deletion web URL | Use `https://herkeys.app/delete-account` only after PR #9 is published and a complete deployed ownership/request/status/recovery journey passes |
| Associated data deletion | Describe actual eligible erasure after the disclosed recovery deadline and shared-resource review; never describe deactivation as completed deletion |
| Retained information | Disclose the five-field 365-day proof, separate seven-day completion outbox, store transaction records and any specifically approved vendor/security/backup exceptions |
| Account creation/identity methods | Reconcile the actual shipping Google/Apple/email methods with the store owner's existing declaration; no declaration was changed here |

Before submission, verify the page from a browser with no app installed, OTP/recovery delivery, non-enumeration, receipt isolation, unavailable-provider behavior and completion status. Legal placeholders and processor retention details must be resolved. The approved recovery window was preserved; the reviewed Play pages supplied no numerical requirement authorizing an autonomous policy change.
