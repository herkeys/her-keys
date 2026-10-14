# Current owner decisions

## Production database migrations

The owner instructed: “for all Staging test that PASS, we need to apply the same migrations to Production as well.” This authorizes the eight reviewed canonical lifecycle migrations in deployment-manifest.json. All eight were applied to Production npykvnxnehlsdlbumzwk on 2026-10-14, using the same source SQL and checksums tested in Staging. Production-generated history versions are recorded separately.

The approval does not activate destructive processing, install a scheduler, deploy Edge Functions, change secrets, authorize customer deletion or approve a disposable Production test. Those actions remain separate. Staging-only fixture policies, probe RPCs and test endpoints are excluded.

## Apple and Google live revocation tests

The owner instructed: “we will skip this test for now.” Record the live Apple and Google revocation tests as SKIPPED_OWNER_DECISION. Do not call them PASS, repeat the credential request, or disable revocation/verification in the implementation. Actual provider revocation remains unverified and must be disclosed in any future release or activation approval. Missing provider evidence still cannot produce a false terminal purge.

## Public support contact

The owner approved using the same address as Staging tests and operational alerts for public support: herkeysnow@gmail.com. The website source now uses that address on support, privacy and terms pages, with account-deletion review guidance and the unchanged seven-day target. The local preview was checked; this does not claim the Production website has been published.

The approved 365-day minimal terminal-proof retention and conservative shared-household policy remain unchanged.
