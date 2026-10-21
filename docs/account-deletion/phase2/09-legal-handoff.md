# Legal and store handoff — account deletion Phase 2 (2026-10-20)

**Gate `LEGAL_DISCLOSURES=PENDING`.** This extends `../legal-handoff.md` (Phase 1, still valid section by section). No legal document was edited or published.

## Current published state (checked 2026-10-20)

- Published Privacy PDF is byte-identical to the one Phase 1 reviewed (SHA-256 `a85786a3…222e5a`), with the same placeholders.
- `https://herkeys.app/privacy`: "Privacy contact email to be supplied."
- `https://herkeys.app/support`: "A support contact address will be published here before launch."
- `/delete-account` is a disabled placeholder; `/account/restore` returns 404.
- Website PR #9 contains new privacy text (a summary section and a full-policy notice) and sets contact addresses. That wording needs your approval before the PR merges (DEL-P2-007).

## Implementation facts for drafting (as built; activation still pending)

| Topic | Exact behaviour |
|---|---|
| Deactivation vs deletion | Confirming stops access and sync immediately and revokes sessions. That is **deactivation**. Permanent deletion runs only after the server-recorded 30-day recovery deadline and only while processing is enabled (**currently disabled in Production**). |
| Recovery | Single-use emailed link; replacement links invalidate earlier ones and do not extend the deadline; opening the link does nothing until the user confirms. |
| Shared households | The departing adult's exclusive data is erased. Another adult's records are kept. Ambiguous or shared items go to restricted manual review with a 7-day target. No automatic ownership transfer. |
| Terminal proof | 365 days: receipt hash, purge time, verification time, aggregate counts, expiry. No email, account, household or provider identifier. |
| Completion email | Encrypted recipient held ≤7 days, separately from proof. |
| Subscriptions | Deletion does not cancel, refund or erase an Apple or Google subscription or store transaction. |
| RevenueCat | Customer record deleted and verified absent. |
| **Apple (new)** | Her Keys asks Apple to revoke its access when it holds a usable token. Older sign-ins may not have one, or Apple may report the token already invalid. In that case deletion **still completes**, Her Keys does **not** claim Apple revoked access, and the user is told how to remove Her Keys under Settings → Sign in with Apple. |
| **Google (new)** | Her Keys revokes its Calendar access token. If Google reports access already removed, deletion completes. The Google Account and calendar events are never deleted. |
| AI | Gemini calls are sent with `store:false`. Her Keys-held AI reports and consent rows are erased; a reviewer ID in another person's report is redacted. Google may keep operational/abuse logs per its terms. |
| Local device | The app can reset local data only for the same account namespace with valid proof, or by explicit user confirmation. A device that never reconnects keeps its copy. |
| Backups / vendor logs | Supabase, Resend, Vercel and Google logs and backups follow vendor retention. **Periods are not yet confirmed**; Legal must state them or a bounded general statement. |
| Status and support | Private receipt on web or in the app; support at the owner-approved address. |

## Change register (Privacy / Terms)

| # | Location | Change requested | Driven by |
|---|---|---|---|
| L-1 | Privacy §15–16, Terms §29 | Phase 1 items (recovery window, deactivation vs deletion, proof fields, outbox, shared review, URLs, support address) | AD-011 |
| L-2 | Privacy, Apple integration | Add the Apple manual-revocation sentence above; no claim that Apple revocation always occurs | DEL-P2-001 |
| L-3 | Privacy, Google integration | Add the "already removed" case; reaffirm the Google Account and events are untouched | DEL-P2-002 |
| L-4 | Privacy summary (website PR #9) | Approve, or amend, the new `#deletion-proof` section and full-policy notice before merge | DEL-P2-007 |
| L-5 | Privacy, while processing is disabled | Until P3 activation, do not state that deletion completes automatically after 30 days. Use "requests are recorded and access stops; permanent deletion is processed after the recovery period", or align publication with activation | Truthfulness |
| L-6 | Privacy, vendor retention | Insert confirmed Supabase/Resend/Vercel/Google retention, or a bounded statement | Provider matrix |
| L-7 | Jurisdictional timing | Confirm a 30-day recovery plus processing meets applicable statutory deadlines; if not, request an owner decision (no silent change) | Phase 1 note |

## For the Apple App Privacy and Google Data Safety agents

- Deletion capability: in app (both platforms) and web (`https://herkeys.app/delete-account`, **only after public release and re-verification**).
- Exceptions: shared-household records of other adults; manual review; proof and outbox retention as above; store transactions; vendor logs and backups.
- Apple and Google revocation: best effort with a truthful manual fallback (above); live revocation not yet verified.

Store submission is **BLOCKED** until L-1…L-6 are approved and published, while engineering work continues independently.
