# Frozen v3 fixtures

Byte-exact v3 envelopes, produced by the **v3 code** at the entry head of
B4-FOUNDATION-BUILDOUT-01 (`32b1601bc7edfa52992a92f1a744167211ee36c1`) — its own
domain functions (`addTask`, `approveDailyLoadMove`, `namespaceFromClaim`, ...) and
its own `encodeStoredState`, run from a temporary git worktree at that commit. They
are what a real v3 device would have written to disk.

`manifest.json` records each file's SHA-256, and `tests/migrationV3ToV4.test.mjs`
fails if any file changes. **Never edit a fixture to make a migration pass**
(Addendum 02 B10): if the migration disagrees with a fixture, the migration is
wrong.

Two fixtures assemble literal rows on top of v3 creators, because v3 had no way to
create them — and both are validated by v3's own `encodeStoredState`, which refuses
any state v3 would not accept:

- `unstamped-legacy-rows` — rows a real household can carry from before Build 3
  (`createdAt: null`, a v1->v2 `source:'demo'` event, systems and meals that had no
  production create path).
- `one-move-states` / `real-child-scoped` — statuses and children v3 could hold but
  its UI could not yet produce.

A locally *cleared* One Move has no local row in v3 (Build 3 physically removes it),
so "cleared" is represented by absence; the cloud has the explicit status.
