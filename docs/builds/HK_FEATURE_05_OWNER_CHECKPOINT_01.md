# HK-FEATURE-05 — OWNER CHECKPOINT 01: creating a child after the household is bound to an account

**Status: PROPOSAL, NOT BUILT.** Nothing below is implemented: no migration, no schema change, no RLS, no sync kind, and no UI that
depends on it. Feature 05 continues on every other path (see §17). This checkpoint exists because the plan makes any new durable
semantic an owner decision, and "additive" does not bypass it.

## 1. User problem
A woman opens Kids on a real household and has no children in it. Before she signs in she can be given a way to add one (Feature 05
builds that, §2). After she has signed in, a child she adds exists only on her phone: the cloud cannot learn it, so every task or
event she attaches to that child also stays on her phone, and a second device never sees the child or anything about them.

## 2. What Feature 05 does without the owner's decision (existing semantics only)
* `addChild` (a new file, `src/domain/children.ts`, no schema change) adds a canonical `Child` to `AppState.children` **while the household is
  not bound** (`isUnbound(identity)`), or is a demo household (which never syncs). Claim payload v3 already sends *every* child at claim
  time, so a child added before sign-in reaches the cloud through the existing claim, with its mapping.
* While the household **is** bound, Kids offers no add-a-child control and says so honestly. It never adds a child that the cloud cannot know.

## 3. Exact missing canonical capability
A way for a bound household to give a **new child** a cloud identity (`household_members` row, `member_type = 'child'`) after the claim.

## 4. Why existing semantics are insufficient
* `household_members` is **read-only to the client**; child rows are "server-created" (`BUILD4_SD4_CLOUD_SCHEMA.md:151-152`).
* `member` is a **mapping-only** sync kind: the claim RPC creates it and only the claim (`syncKinds.ts` header; `HK_INTEGRATION_READINESS_01_BACKEND.md` D6).
* The claim is once per account (a second is refused as `superseded_by_cloud`).
* Consequence measured in the code: a task/event whose `subjectMemberId` has no mapping throws `UnresolvedReferenceError` in the projection
  (`projection.ts:66-68`), and `pushEngine.ts:88-107` moves the intent to evidence `unresolvable-dependency`. It does **not** block other rows,
  but the child's rows never sync and the household shows "changes need your attention".

## 5. Proposed domain type
No new type. The existing `Child` (`id`, `displayName`, `birthDate`, `scope: 'child'`), unchanged.

## 6. Proposed persistence shape
None locally (a `Child` already persists in envelope v4). Nothing new is stored.

## 7. Proposed cloud representation
One **server-owned** creation path for the existing `household_members` child row. Two candidate shapes, both needing an owner decision:
* **(A, recommended) a `SECURITY DEFINER` RPC** `add_household_child(p_household, p_local_id, p_display_name, p_birth_date)` that inserts the row, enforces owner-only, the 20-child bound and the existing CHECKs, and returns the cloud uuid for the id-map. No new grant on the table.
* (B) a column-level INSERT grant on `household_members` for child rows plus an RLS policy. Rejected: it widens who can write a table every RLS rule keys off.

## 8. Identity semantics
The local `Child.id` stays the identity; the cloud uuid is recorded in the existing `mappings` (`kind: 'member'`). No new identity type, never a name.

## 9. Ownership semantics
Owner-only creation (same as claim). A second household member reads the child (existing policy) but cannot create one.

## 10. Null / unknown semantics
Unchanged: birth date is required by the existing CHECK (`member_type = 'child' … birth_date IS NOT NULL`); there is no "unknown" child.

## 11. Lifecycle
Create only. **Removal / archive of a child stays out of scope** (B4-P0-066 still deferred; Feature 05 offers none — Tier 3 BH is SAFE-UNAVAILABLE).

## 12. RLS posture
Unchanged for reads. Writes only through the RPC (`EXECUTE` revoked from PUBLIC and `anon`, granted to `authenticated`, `search_path = ''`), matching SD4-027's pattern. The full attack matrix (unauthenticated / owner / same-household member / unrelated account with a guessed child id) would be required.

## 13. Sync representation
`member` would need a **create** operation in `ALLOWED_OPS` and to become a pushable kind, dependency-ranked before every kind that references a child. That is a change to the sync kind inventory and to `changeBridge`'s "one of everything" test.

## 14. Migration shape and populated-database behavior
One additive migration: one function + grants. No table change, no column change. On a populated database it changes no existing row. The fingerprint would change in `functions`, `privileges.functions` (and `privileges.effective`) only; the old and new values would be recorded.

## 15. Overlap analysis
* **People OS** — owns *people who are not accounts*; a child is a household member, not a person. No overlap, but People OS will want the same server-owned creation shape for other member types.
* **Co-Parent Logistics** — will read children across a shared household; it needs this to exist, does not define it.
* **Calendar / Systems / Life Admin** — consume `subjectMemberId`; blocked only for a child added post-bind.

## 16. Alternatives considered
1. **Do nothing (current).** Children must be added before sign-in; Kids says so after. Safe, but a family that adds a second child later cannot.
2. **Allow the local add and let its rows wait.** Rejected: it produces evidence rows and a permanent "needs attention" for something the user did correctly.
3. **Re-run the claim.** Rejected: the claim is once per account and would risk the household.
4. **Client write grant (7B).** Rejected (§7).

## 17. Consequence of deferral
Kids is fully usable, syncs, and round-trips to a second client for every child that exists at claim time or is hydrated from the cloud. What is unavailable: adding a child to an already-signed-in household. Feature 05's scenarios that need a *second* child on a signed-in household are proven with children present at claim (as production would have them).

## Decision requested
Approve (A), approve a different shape, or leave it deferred. Until decided Feature 05 builds nothing for it.
