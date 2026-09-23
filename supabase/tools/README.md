# Her Keys schema fingerprint

The one method for every "Staging matches Production", "the baseline reproduces Staging"
and "this migration changed exactly what we said" claim in Build 4. Anything not measured
this way is not a parity claim.

It answers one question: **do these two databases have the same Her Keys application
schema, including who is allowed to do what?** It is read-only by construction (a
`SELECT` inside a rolled-back transaction) and needs no dependencies beyond Node.

## Files

| File | Purpose |
|---|---|
| `schema-lines.sql` | The catalog inspection: one normalized line per schema fact. Single source of truth. |
| `schema-fingerprint.mjs` | Wraps the SQL (pins `search_path`, hashes each dimension), runs it against a source, compares to an artifact. |
| `baselines/*.json` | Committed, approved digests. A run is verified against one of these. |
| `gen-foundation-sql.mjs` | B4-FOUNDATION-BUILDOUT-01. Generates the foundation DDL (18 tables, provenance and facet columns, grants) from `src/domain/sync/foundationSpecs.ts` into two marker-delimited regions of the shipping migration. `--check` fails on any difference, so a hand edit or an unregenerated manifest change cannot ship as drift. |
| `reconcile-foundation.mjs` | B4-FOUNDATION-BUILDOUT-01. Takes two `--mode detail` captures (before / after, SAME environment) and attributes every added, removed or changed fact to the reason it exists; exits non-zero on an unexplained one. Its output is `baselines/build4-foundation-reconciliation.json`. |

## What is measured

Scope is the `public` and `private` schemas. Supabase-managed schemas (`auth`, `storage`,
`realtime`, `vault`, ...) are deliberately out of scope.

**Gating dimensions** (any difference is a parity failure):
`schemas`, `relations` (incl. RLS enabled/forced), `columns` (type, nullability, default),
`constraints`, `indexes`, `triggers`, `functions` (signature, security mode, `search_path`
config, body digest), `policies`, `types`, and the privilege set: `privileges.relations`,
`privileges.columns`, `privileges.functions`, `privileges.schemas`, `privileges.default_acl`,
and `privileges.effective` (what `anon`, `authenticated`, `service_role` and PUBLIC can
*actually* do, via `has_*_privilege`).

Privileges are gating on purpose. They are part of the Her Keys security contract, and a
new function that silently inherits `EXECUTE` for `anon` must fail parity.

**Informational dimensions** (`info.*`, recorded but not gating): installed extensions and
event triggers. They legitimately differ between the hosted platform and a local stack.

The overall result is `#GATING`: a digest over the per-dimension digests of every non-`info`
dimension. Two databases match when `#GATING` is equal.

## Determinism

- `search_path` is pinned to `''` for the run, so every deparsed constraint, index, trigger
  and policy is fully schema-qualified whatever the client's defaults are.
- Lines are ordered and hashed with `COLLATE "C"`, so a database's default collation cannot
  change a digest.
- No object ids and no environment-specific values enter a line.
- Function bodies are compared by `md5(pg_get_functiondef())`.
- The SQL is pure ASCII.

## Running it

Run from the repository root.

```bash
# Show the exact SQL (paste into the Supabase MCP or any SQL client for a source the CLI can't reach)
node supabase/tools/schema-fingerprint.mjs print-sql --mode digest

# Local database (supabase start / db reset)
node supabase/tools/schema-fingerprint.mjs run --source local

# The linked project (needs the Her Keys CLI credential in the shell; see the target check below)
node supabase/tools/schema-fingerprint.mjs run --source linked

# Verify any source against the committed approved baseline (exit 0 = match, 1 = mismatch)
node supabase/tools/schema-fingerprint.mjs verify --source local --against supabase/tools/baselines/<file>.json

# KNOWN LIMIT (B4-FOUNDATION-BUILDOUT-01, OBS-002): with Supabase CLI 2.109.1, `--source local` fails with "cannot insert multiple commands into a
# prepared statement", because `supabase db query` no longer accepts the tool's multi-statement SQL. The tool is locked and unchanged. Run the tool's own
# SQL through psql in the local container instead (`node -e` importing `buildSql`, as BUILD4_BE02_CLAIM_CORRECTION.md describes) and compare the rows.

# Rows captured elsewhere (for example the MCP result saved to a file)
node supabase/tools/schema-fingerprint.mjs verify --source json:rows.json --against supabase/tools/baselines/<file>.json

# Human-readable line-by-line output, for diagnosing a mismatch
node supabase/tools/schema-fingerprint.mjs run --source local --mode detail > local.txt
```

To diagnose a mismatch, produce `--mode detail` output for both sides and diff them; the
first differing dimension names the object class.

### Production

Production is measured **read-only, through the Supabase MCP**, with the same SQL: run
`print-sql`, execute it against the Production project ref, save the returned rows as JSON,
then `verify --source json:<file>`. No Production database password and no CLI link are
involved. Production must never be linked from this repository during Phase 1.

### Target check (remote runs)

Before any `--source linked` run, confirm what the CLI is pointed at:

```powershell
supabase projects list      # must show the herkeys org projects and no K Scan project
```

The linked ref must be the Staging ref `fhhudicklmpofuzkxeqe`. If it is anything else, stop.

## Artifacts

`write` records the per-dimension digests as an approved baseline:

```bash
node supabase/tools/schema-fingerprint.mjs write --source linked --out supabase/tools/baselines/<name>.json --label "<what this approves>"
```

An artifact contains digests, item counts and the tool version only: no data, no secrets,
no timestamps. Re-running the tool on an unchanged schema produces a byte-identical artifact.

## Superseded baselines

`baselines/build4-local-fingerprint.json` is SUPERSEDED by `baselines/build4-foundation-local-fingerprint.json` (B4-FOUNDATION-BUILDOUT-01) and is kept, unchanged apart
from a `superseded_by` pointer, as the "before" side of the reconciliation. Verify current state against the newer file; do not verify against a superseded one.
Two captures are only comparable when both apply the shipping migration in its authoritative form — the working-tree file, CRLF on this machine — because
function bodies hash their line endings.

## Feature branch baseline (HK-FEATURE-12 Life Admin / Documents, Wave 3, NOT integrated)

`baselines/f12-local-fingerprint.json`: 3,844 facts, gating digest `60af45784ddd7373c7a56cd57c51b802`, for WAVE3_BASE (IR01 + F08 + F05,
derived `96f93f3d46dcf5735e7a0b50996944bf`, 3,629 facts — no committed baseline existed for the integrated Wave 2 schema) plus the additive
migration `20260922180000_f12_life_records.sql`. DERIVED by `f12-fingerprint.mjs derive --write`, which never migrates the shared database: it
requires that database to match the F05 baseline below, measures the F08 and F12 deltas on scratch databases, and pins F12's exact movement
(added: columns 45, constraints 40, functions 2, indexes 13, policies 5, privileges.columns 52, privileges.effective 16, privileges.functions 1,
privileges.relations 34, relations 2, triggers 7; removed: the replaced `change_log_entity_table_check` and the replaced `sync_push` body).
It is a FEATURE-BRANCH artifact: the Wave 3 integration re-derives the integrated baseline once F09-F12 are merged. Local only.

## Current baseline (HK-FEATURE-05 closeout repair, OC-01)

`baselines/f05-local-fingerprint.json` is the CURRENT approved local baseline: 3,621 facts, gating digest `8bf3c7c6367c06b79128eb83147fd17e`.
It follows the additive migration `20260921190000_f05_add_child_after_binding.sql` (a child added after the household is bound to an account:
one `SECURITY DEFINER` function in `private`, reached only through `sync_push`), which changes exactly three dimensions of the IR01 baseline and
nothing else: `functions` (27 -> 28: the new `private.push_household_child`, and the body digest of `public.sync_push`), `privileges.effective`
(309 -> 310: `authenticated` may EXECUTE the new function) and `privileges.functions` (53 -> 55: the new function's two EXECUTE entries).
No table, column, constraint, index, policy, trigger or table grant changed. The migration is pinned to LF by `.gitattributes`. Local only:
it has not been applied to Staging or Production, and applying it there is owner-gated.

## Previous baseline (HK-INTEGRATION-READINESS-01)

`baselines/ir01-local-fingerprint.json` is the PREVIOUS approved local baseline: 3,617 facts, gating digest `43e7c8a4402a3387cb2e1add4170921e`.
It follows the additive migration `20260921120000_ir01_duration_source_and_claim_v3.sql`, which changes exactly four dimensions of the previous
baseline (`columns`, `constraints`, `privileges.columns`, and the `functions` digest for `claim_local_household`). `build4-foundation-local-fingerprint.json`
(199ed4d4..., 3,613 facts) remains the PRE-REPAIR reference and is kept unchanged; do not verify current state against it.
The IR01 migration is pinned to LF by `.gitattributes` so its function digest does not depend on the checkout.

## When to update a baseline

Only when a migration is *intended* to change the schema and has been reviewed. The new
digest is written in the same commit as the migration, so the history of approved schema
states is the history of this directory. Never regenerate a baseline to make a failing
verify pass.
