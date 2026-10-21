# Controlled Production promotion — approval required

The concrete, machine-readable candidate is `production-promotion-manifest-20261019.json`. Its source checkpoint is **6267a299206a4e9e48ca987891e7c971567c1223**, based on PR #38's **c7dca1ec13956e16e03b66ae64346be73829e077**. Four LF-hashed canonical migrations and seven exact function graphs are listed with read-back Staging versions/hashes. The manifest excludes all synthetic fixtures, temporary helper migrations/endpoints and test-scope rows.

Production `npykvnxnehlsdlbumzwk` received **no mutation** in this repair. Fresh read-only verification found `enabled=false`, `dry_run=true`, 43 registered resources and zero active destructive jobs. Two of nine Production bundles match current source; seven differ because their shared deletion Service/Core/Worker/Monitor source is older. `PRODUCTION_FUNCTION_PARITY=PARTIAL` is an observed mismatch, not an assumption that the current runtime is certified.

Only after explicit owner approval:

1. Refetch and compare the shared candidate and draft PR. Resolve any later changes without merging historical feature branches blindly. Require the final exact-head repository gate and relevant source tests.
2. Verify exact target, predecessor SQL contracts, schema census, migration history and disabled controls. Confirm secret **names** and environment-specific settings without displaying values. CLI secret-name listing returned 403 here; Staging RevenueCat execution proved its scoped runtime key, but Production names/provider configuration remain unverified.
3. Apply the four canonical migrations once in manifest order, using the approved source LF hashes. Record generated Production history IDs and advisor/ACL checks. No fixture migration or global recovery-shortening step is permitted.
4. Deploy only the seven listed differing function graphs, preserving the manifest's JWT settings and each handler's own authentication. Apple credential capture and proof expiry already match and do not need replacement. Read every deployed graph back and compare source hashes.
5. Verify read-only classification, active-account policies, private function privileges, health and configuration. Keep **enabled=false, dry_run=true** and zero active destructive jobs. Do not perform an irreversible Production test or create/delete a Production user under this approval.

Deployment approval is separate from **activation approval**. Activation additionally needs published legal and functional web/recovery pages, native/platform evidence, the recorded live-provider restrictions resolved or explicitly accepted, complete operational monitoring/watchdog and owned-fixture certification, truthful mail delivery/retention configuration and a concrete scheduler plan. A non-destructive mail/reconciliation schedule is also an operational decision; no scheduler was installed or enabled in Production here.

Emergency stop remains:

```sql
UPDATE public.account_deletion_control SET enabled=false,dry_run=true WHERE singleton;
-- If a worker cron exists, disable it with cron.alter_job(job_id:=...,active:=false).
```

Retain lifecycle/recovery/review/evidence state when stopping. An already sent bounded provider request may finish; subsequent fenced mutations must stop. Use forward fixes after an additive migration is applied. Do not revert to an unknown-resource bypass, erase review cases, extend recovery deadlines, restore a deleted identity automatically or attempt a destructive rollback.

This document requests no blanket Production activation and does not imply legal approval. It makes the eventual migration/function approval concrete and reviewable while all irreversible controls remain off.
