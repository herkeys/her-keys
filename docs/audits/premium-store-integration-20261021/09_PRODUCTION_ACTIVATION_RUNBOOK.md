# Production activation runbook — owner approval required
Current recommendation: HOLD. Do not execute activation during this sprint.

Preconditions:
- Final repair PR fully green on its exact head; mergeability/reviews satisfied; merged candidate gate also green.
- Both RevenueCat store credentials validate. Apple products have complete approved metadata and correct group/availability; Google package/testing track and service account are confirmed.
- Corrected paywall published only after owner review; actual store prices, P1M eligibility, Terms/Privacy, cancellation and restore verified on native devices.
- Legitimate native sandbox purchase→trial→restore→cancellation→expiry/refund and account-isolation evidence; required AI consent remains enforced.
- Production matches the certified Premium function sources, migrations, RLS and grants; runtime environment=production, allow_test_fixtures=false, test_store_checkout_enabled=false.
- All three Premium features released/general with owner-approved limits; no deletion worker activation.
- Canonical identifiers/signing and a pushed exact candidate with successful native artifact checks. The public release provenance allowlist is separately governed; never bypass it to cut a store release.
- Separate explicit owner authorization for checkout. This does not itself authorize a public store release.

Read-only preflight:
```sql
select environment, premium_enabled, webhook_processing, checkout_enabled,
       test_store_checkout_enabled, allow_test_fixtures
from public.premium_runtime_config where singleton;
select feature_key,enabled,released,kill_switch,rollout_status,limit_status
from public.premium_feature_config
where feature_key in ('daily_load_premium','smart_inbox_extract','momentum_report');
```

Only AFTER owner approval, in the exact Production project npykvnxnehlsdlbumzwk:
```sql
begin;
update public.premium_runtime_config
set checkout_enabled=true,updated_at=now()
where singleton and environment='production'
  and premium_enabled and webhook_processing
  and not allow_test_fixtures and not test_store_checkout_enabled
returning environment,checkout_enabled,test_store_checkout_enabled;
commit;
```
Require exactly one returned row. Recheck authenticated purchase readiness with a legitimate account and the real platform SDK configuration. Monitor real signed webhooks, reconciliation and access decisions without fabricating transactions.

Immediate reversible rollback:
```sql
update public.premium_runtime_config
set checkout_enabled=false,updated_at=now()
where singleton and environment='production'
returning environment,checkout_enabled;
```
Preserve existing entitlements, webhook processing, receipts and subscriber benefits. Do not delete purchase data or disable account-deletion safeguards.

Staging Test Store window is separately controlled by test_store_checkout_enabled and its tester-only RPC. Native-store checkout remains checkout_enabled=false. Close that window after test completion; never copy its flag or synthetic records to Production.

