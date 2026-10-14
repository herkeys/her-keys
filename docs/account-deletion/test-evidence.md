# Test evidence

Local Node v24.14.0; Expo SDK 57. Existing CI uses Node 22; exact-SHA CI remains required. Embedded PostgreSQL uses PGlite 0.5.9 / PostgreSQL 18.6, whereas Staging is PostgreSQL 17.6. Results are local evidence, not Staging certification.

Latest recorded application run: 4066 PASS, 0 FAIL in full-tests.log, including the approved shared-policy SQL, manual reconciliation refusal and retry checks. Expo compatibility passes; Expo Doctor 21/21 passes. Mobile TypeScript passes. Website production build, TypeScript and full ESLint pass. The pre-existing website apostrophe error was repaired with an HTML escape.

Initial run: 4034/4037 passed. Two pre-existing provenance errors came from post-password legal/email repairs incorrectly registered to the password branch; the new migration additionally needed canonical registration. Boundary ownership was corrected without weakening its guards or negative controls. Restore Purchases tests isolate the newly imported lifecycle platform adapter.

Database tests: full migration chain applies; lifecycle/authority/deadline/recovery/fencing/terminal scenarios; other-account preservation; shared-household refusal; encrypted outbox proof authentication; device namespace protection; mutation controls. All detailed logs are local. No native device, live Apple/Google/RevenueCat, real delivery, Staging schedule, Production schedule, or Production end-to-end PASS is claimed.
