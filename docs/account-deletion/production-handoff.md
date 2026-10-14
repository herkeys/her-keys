# Production gate — NOT READY FOR APPROVAL

Do not deploy to npykvnxnehlsdlbumzwk or enable destructive processing from this branch. This is an implementation in progress. No Production change or store/EAS action is authorized by source completion.

Before requesting deployment approval: complete missing security/data-isolation/provider tests; certify iOS/Android/web consumers and actual Staging request/recovery/purge/retry/scheduled runs; obtain exact-SHA green CI in both repositories; reconcile the Production schema/provider/storage census; approve shared-household and retention contracts; configure and verify alerts.

The concrete package must identify both repository SHAs, migration checksum/order, modified existing functions, new functions, only required secret NAMES, environment target, scheduler installation in disabled mode, allowed disposable Production account and test expiry method, expected effects, rollback/kill-switch commands and residual risks. Production worker activation requires a second explicit approval after approved disposable-account certification.

Rollback preference: disable destructive processing and scheduling immediately; preserve lifecycle ledger/receipts/outbox and pending restrictions; restore only reviewed endpoint revisions if needed. Never remove pending-account guards while any request is pending. Do not reverse a real purge or claim deleted provider data can be recovered.
