# Automation certification

Staging scheduled invocation is observed; full release certification remains incomplete. Production has no deletion tables, deletion migrations or pg_cron extension as of read-only inspection at 2026-10-14 11:09 UTC.

Staging worker cadence: every five minutes, batch ceiling 1, five-minute lease, eight attempts, bounded backoff. Monitor: every five minutes offset by two minutes. Daily retention: 03:17 UTC. Installation creates disabled jobs; activation is separate. Final Staging destructive controls are in staging-certification.md.

Actual scheduled evidence on 2026-10-14 UTC:

- 01:35 dry-run preserved eligible fixture records.
- 01:40 provider failure permitted independent private cleanup without false terminal success.
- Kill-switch refusal and an interrupted fixture lease were exercised; 01:45 resumed safely after lease expiry and provider configuration.
- 02:05 asynchronous RevenueCat deletion remained nonterminal; 02:10 run 91eaa231-3366-4852-bedb-8236ebe98ffe verified completion.
- 11:10 shared-household cleanup removed private data and the actual storage blob, preserved the other adult and legitimate shared data, and created restricted manual cases instead of terminal success.

Retention failure injection used a synthetic expired minimal-proof record. Temporarily refusing the service cleanup RPC caused actual scheduled endpoint failures at 01:58 and 01:59; the expired row remained. Monitoring delivered a retention-failure alert, provider message 01a13822-6b43-7377-b31a-e4961b8adab3. After restoring permission, actual scheduled cleanup at 02:00:06 UTC physically removed the proof: run 6b28c4ac-f4e1-4cb1-bc62-fb109d74ebe1, deleted 1, remaining 0. Daily 03:17 subsequently succeeded. The daily cadence was restored after temporary minute-level certification. Cron HTTP enqueue success is not treated as endpoint success; HTTP responses and retention runs supply that evidence.

Recovery/restoration email delivery and operational alert delivery were observed through Resend. Acceptance and delivery are tracked separately. Only the owner-authorized Staging/alert inbox was used. The owner later approved that same inbox as public support; it is configured in website source. Production subsequently received the eight canonical database migrations only; no Production scheduler is installed.

Emergency controls:
```sql
UPDATE public.account_deletion_control SET enabled=false,dry_run=true WHERE singleton;
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'),active:=false);
```
Use cron.alter_job: direct cron.job UPDATE is denied. An in-flight bounded HTTP request may finish; subsequent fenced boundaries stop. Preserve recovery, access restrictions, ledger and monitoring. Monitoring covers stale runs, failures, overdue cases, delivery and retention backlog/failure/staleness. An independent watchdog and the full outage/concurrency matrix remain release requirements.
