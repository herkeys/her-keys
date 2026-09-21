# HK-FEATURE-05 — OWNER CHECKPOINT 01: creating a child after the household is bound to an account

**Status: RESOLVED BY THE OWNER — IMPLEMENTED in the Feature 05 closeout repair (local only; nothing pushed, no remote environment touched).**
The proposal that this file was written as is kept, unchanged, below the resolution. Where the two differ, the resolution governs (§2, §7, §16
and §17 of the proposal describe a world in which nothing was built).

## RESOLUTION (2026-09-21)

**Owner decision.** "Her Keys MUST support adding a child after a household has already been bound to an account." Approved product behavior,
on the EXISTING household-member / child identity model. Not a second child model, not a Kids-specific identity table, not a feature-specific
Supabase persistence path, not a separate sync queue, not a duplicate household-member abstraction, not a new account/user identity system.
Authority: the account-bound household **owner**; nothing broader; every existing RLS rule and grant preserved. Any migration is local only.

**Was a backend change required?** Yes, and that was measured before anything was built (ledger §19, §38): `household_members` has no client write
path, `member` was a mapping-only sync kind, `sync_push` is `SECURITY INVOKER` and did not list the table, and a claim runs once per account.
So the smallest correct change is **one additive local migration**, and nothing else on the server: no table, column, constraint, index, policy,
trigger or table grant changed (proved item by item, ledger §38.5).

**What was built** — the path the owner named: *feature action → canonical store mutation → existing change observer → existing sync → existing
household/member backend semantics.*

| Layer | Change |
|---|---|
| Kids | The same screens and the same `addChildToHousehold` transition. `canAddChild` no longer requires an unbound household; only a household that belongs to *another* account (quarantined) cannot take a child. No new tab, screen, control or design. |
| Canonical state | Unchanged: the existing `Child` (`id`, `displayName`, `birthDate`, `scope`), added by the existing `addChild`. It is never the account user. |
| Sync (shared, the minimum) | `member` becomes a **create-only** pushed kind over `AppState.children` (dependency rank 0, so a child is sent before anything that names it). The change observer, bridge, queue, coordinator and `sync_push` carry it like every other kind. `applyMembers` (pull) matches a child by its cloud id, never by name, and **adopts** a row this device created whose acknowledgement was lost instead of minting a second child. |
| Backend | `supabase/migrations/20260921190000_f05_add_child_after_binding.sql`: `private.push_household_child` (`SECURITY DEFINER`, empty `search_path`, not exposed through PostgREST) and `public.sync_push` replaced with three marked differences (allow-list; the collision probe sees child rows only; the insert is delegated). `sync_push` stays `SECURITY INVOKER`. |

**How this differs from the proposal below.**
* The proposal's option A was a *public* `add_household_child` RPC that the sync layer would have to call by name. The owner required that Kids not
  know how account sync works and that no feature-specific persistence path exist, so the same authority is a **`private` function reachable only
  through the existing `sync_push`**: one entry point for every synchronized row, the SD4-006 collision semantics and the `already_exists` answer
  reused verbatim, and no new client-callable surface (PostgREST cannot reach the `private` schema; proved over real PostgREST).
* The server bound is **20 children per household**, the local state's own bound (`AppStateSchema.children.max(20)`). The server had none, so a
  client could otherwise create a household another device cannot hydrate. (A claim payload is still capped at 50; unchanged.)
* **No update path.** There is no rename or edit of a child by a client, so nothing new is granted for one (a rename made on the server is pulled
  and applied to the same child in place; that is the only rename that exists). MP-K-05 stays open.
* Option B (a client grant on `household_members`) was not built either: `household_members` still has exactly one policy (SELECT) and no client
  write grant.

**Authority, as enforced by the server.**

| Caller | Result |
|---|---|
| Owner of the household | creates the child (`created`); a retry from the same install is `already_exists` |
| A second member of the household (not the owner) | refused, 42501 "only the owner" — the device keeps it as `forbidden` evidence |
| An unrelated authenticated account | refused, 42501 (not a member); a foreign household id is refused the same way; a foreign *member id* is server-owned and stripped, so a NEW row is made in the caller's own household and the foreign child is untouched |
| Anonymous | no `EXECUTE` on `sync_push` at all |
| Anyone, stating an account, a role, another scope, an adult type, `id`, `revision` or an unknown column | refused (42501) or stripped (`id`, `revision`, timestamps); never honoured |
| Anyone, writing `household_members` directly (INSERT / UPDATE / DELETE), even the owner | refused: no grant, no policy |
| Anyone calling the function directly | it enforces its own authority, so a non-owner, an unrelated account or anon is refused there too |

**Behavior.**
* *Before binding:* unchanged — the child is added locally and reaches the cloud through claim v3, with its mapping. If a household was bound by a
  build that predated claim v3, a child the claim never carried is now created by the ordinary top-up instead of staying on the device forever.
* *After binding:* the child is visible at once; the intent is durable in the same write as the child; it is sent through the ordinary queue and
  mapped to the same local id; tasks and events for it follow it (a child is sent before the work that names it).
* *Offline / restart / reconnect:* owed durably, survives a restart, created **exactly once** on reconnect. A lost acknowledgement settles on the
  same child (the coordinator pulls before it pushes, so this is the pull's adoption rule, not the retry).
* *Second device:* hydrates every child under the same local id; work for a child names that child; two children with the same name (even the same
  birth date) are two children; a cloud rename is the same child updated in place.
* *Refusal:* kept as inspectable evidence, sent once, never retried, the child never silently deleted; work naming it is kept as
  `unresolvable-dependency` evidence rather than sent with an invented reference.
* *Account switching / demo / never signed in:* another account's pending child is never uploaded under a different account; a demo household and
  a household that never signed in send nothing.

**Evidence** — the numbers, the scenario map (all 20 required scenarios), the mutants and the fingerprint are in `HK_FEATURE_05_KIDS.md` §38.

**Not built (unchanged debt).** Renaming or correcting a child (MP-K-05) and removing or archiving one (MP-K-04, B4-P0-066) remain out of scope; the
migration has been applied to the shared LOCAL database only, and applying it to Staging or Production is an owner-gated step that was not taken.

---

## Original proposal (kept as written)

> **Status when written: PROPOSAL, NOT BUILT.** Nothing below was implemented at the time: no migration, no schema change, no RLS, no sync kind, and
> no UI that depended on it. This checkpoint existed because the plan makes any new durable semantic an owner decision, and "additive" does not
> bypass it.

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
