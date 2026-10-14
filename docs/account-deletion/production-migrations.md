# Production migration result

Owner authorization: apply the same reviewed migrations associated with passing Staging checks. Target verified: `npykvnxnehlsdlbumzwk`. Applied on 2026-10-14 at 11:54 UTC. The eight canonical source files and checksums match the reviewed Staging package.

| Migration | Production history version |
| --- | --- |
| account_deletion_lifecycle | 20261014115427 |
| account_deletion_auth_reconciliation | 20261014115429 |
| account_deletion_terminal_identity | 20261014115432 |
| account_deletion_proof_retention | 20261014115434 |
| account_deletion_cancelled_history_cleanup | 20261014115436 |
| account_deletion_shared_provider_retry | 20261014115439 |
| account_deletion_orphan_shared_ownership | 20261014115441 |
| account_deletion_household_lock | 20261014115443 |

Verification passed:

- Counts across all 45 existing business tables are unchanged. Auth, profile and household counts remain one each; the three existing Storage objects remain.
- An authenticated-role read check returns account status active, one visible profile and one visible household.
- New lifecycle/credential tables have RLS enabled and deny anonymous/authenticated direct reads. Internal worker, retention, case-resolution and proof-verification RPCs deny both client roles.
- The terminal-proof table has exactly receipt_hash, purged_at, verified_at, resource_counts and expires_at.
- Deletion requests remain zero. Processing is enabled=false, dry_run=true, effective batch 1 and max attempts 8.
- No scheduler, pg_cron extension, Staging test policy or probe RPC was installed in Production. Retention control remains disabled; the Production daily job is not installed.

No Edge Function deployment, secret change, provider/customer deletion, destructive test or worker activation was performed. These migrations prepare the database; they do not make the complete deletion feature operational in Production.

Post-migration security advisors contain no error-level finding. Service-only RLS tables intentionally have no client policies. The intentional authenticated account-status RPC adds a SECURITY DEFINER warning; existing bootstrap/claim warnings and disabled leaked-password protection remain documented. See the [RPC advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Raw aggregate verification and migration hashes are in production-migration-evidence.json and deployment-manifest.json. Preserve the name/version mapping; do not blindly replay canonical files using CLI history versions.

The owner has separately deferred live Apple/Google revocation tests and approved herkeysnow@gmail.com as public support. Neither decision activates Production processing or turns skipped tests into PASS.
