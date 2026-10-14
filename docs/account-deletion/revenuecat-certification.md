# RevenueCat certification — Her Keys

Staging: `fhhudicklmpofuzkxeqe`. Production: `npykvnxnehlsdlbumzwk`, read-only inspection. Project pinned to `proj93809efe`. Only explicitly marked disposable Staging identities were used. No K Scan customer, credential or project was used.

```
RC_STAGING_CONFIGURATION=PASS
RC_PRODUCTION_CONFIGURATION=PASS
RC_HER_KEYS_PROJECT_ID=PASS
RC_STAGING_API_AUTHORIZATION=PASS
RC_CUSTOMER_ID_MAPPING=PASS
RC_DELETION_PERMISSIONS=PASS
RC_30_DAY_GRACE_PROTECTION=PASS
RC_STAGING_DELETION_E2E=PASS
RC_PRODUCTION_DELETION=NOT_RUN
```

Both dashboards independently showed the required secret names. The project-ID digests matched SHA-256 of the owner-confirmed project ID. Neither API key was revealed. Production configuration PASS means name presence and project-ID digest verification, not a Production API request or deletion test.

Staging's key accepted customer GET and disposable customer POST (201) in the exact pinned project. Customer ID equaled the Supabase UUID. Project-list GET returned 403 because this narrowly scoped key lacks project-list permission; customer operations succeeded. No broader permission was added. Actual customer deletion and subsequent GET 404 demonstrate Staging deletion permission.

The restoration fixture retained its real RevenueCat customer after deactivation and after explicit browser restoration at 2026-10-14 02:02:52 UTC. A separate purge fixture retained its customer during grace. Its original deadline was exactly 30 days after request; only its marked test request was accelerated. The actual 02:05 scheduled worker did not claim async deletion as completion: Auth remained until external absence was verified. Independent GET then returned 404; the 02:10 scheduled run `91eaa231-3366-4852-bedb-8236ebe98ffe` completed verification. The restored fixture's RevenueCat customer still returned 200 with its own identity.

The adapter pins the project, targets only the claimed account UUID and accepts erasure only after GET 404. Automated tests cover wrong project, async deletion still present, unauthorized/forbidden, unavailable and rate-limited responses. Failures remain retryable. Deactivation and restoration never call the deletion adapter. Shared-household cleanup independently revokes providers while ownership cases remain nonterminal; see staging-certification.md.

Staging is ready for further scoped disposable RevenueCat tests. Native device checks and the complete hosted resource matrix remain incomplete. The owner deferred live Apple/Google revocation tests; they are SKIPPED, never PASS. Public support is configured in website source. The owner later authorized and applied eight Production SQL migrations; RevenueCat customer deletion and worker activation remain unauthorized.

Contract checked against the [RevenueCat customer API](https://www.revenuecat.com/docs/api-v2/customer). API acceptance alone is never erasure evidence.
