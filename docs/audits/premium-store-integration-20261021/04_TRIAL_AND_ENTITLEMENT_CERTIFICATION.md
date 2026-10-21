# Trial and entitlement certification
Period metadata is presentation, not authorization. Server entitlement derivation, account lifecycle, feature availability, AI consent, quotas and household ownership remain the gates for protected work.

Webhook INITIAL_PURCHASE/RENEWAL preserve provider period_type, purchased_at_ms and expiration_at_ms. TRIAL gets the exact provider end; INTRO and NORMAL remain distinct. Cancellation retains the current period; paid renewal clears trial facts; extension uses the provider's new end; older events cannot replace newer period facts. Scheduled PRODUCT_CHANGE now requests reconciliation rather than treating a future plan as an already-paid new period.

Authenticated RevenueCat v1 reconciliation reads subscription.period_type (lowercase supported). Missing/malformed expiration is rejected instead of becoming a lifetime entitlement. Missing subscription environment and malformed entitlement records return invalid_response, preserving verification uncertainty. An explicit null expiry remains supported for legitimate non-expiring access. Existing dirty/stale, refund and environment protections remain enforced.

premium_my_entitlement exposes only the caller's verified display metadata. Premium Home is also the Premium section inside Your Account, so both surfaces share the same status. It distinguishes free trial, introductory offer, canceled trial, canceled active, grace, expired, refunded and verification pending. Trial dates come only from the server. If a date is absent, copy says it is unconfirmed. Local copy does not invent a renewal price: it directs the customer to the store's subscription settings; the store purchase interface owns actual prices. Showing the exact account-specific renewal price inline remains limited by verified provider metadata and is not claimed certified.

Tests cover January/February/leap-year ends, DST and local display, trial→cancellation→expiry/refund, trial→paid renewal, late events, restore/account switching from the existing full V2 suites, invalid timestamps, CAS, RLS, service-only writes and cross-account reads. Test Store readiness has separate PostgreSQL tests proving Production/native checkout cannot be activated by the Staging test flag.

Evidence categories: all automated lifecycle records in the test suites are unit/scripted integration or disposable database fixtures. A provider TEST is not a purchase. Real Google/Apple purchase, renewal, cancellation, refund and restore remain uncertified until actual store sandbox transactions are recorded.

