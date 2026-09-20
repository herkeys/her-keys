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

## When to update a baseline

Only when a migration is *intended* to change the schema and has been reviewed. The new
digest is written in the same commit as the migration, so the history of approved schema
states is the history of this directory. Never regenerate a baseline to make a failing
verify pass.
