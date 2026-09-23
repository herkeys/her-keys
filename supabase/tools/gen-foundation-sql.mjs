#!/usr/bin/env node
// Her Keys — foundation DDL generator (B4-FOUNDATION-BUILDOUT-01, ADR-023).
//
// Reads src/domain/sync/foundationSpecs.ts — the one manifest that says what every
// foundation kind's columns are — and emits the explicit DDL that lives in the
// shipping migration between two marker pairs. The migration is still ordinary,
// reviewable SQL: this tool exists so that the column a row is WRITTEN to, the column
// the client may UPDATE and the column a pull READS cannot disagree, because they
// come from one definition.
//
//   node --import ./tests/support/register-ts.mjs supabase/tools/gen-foundation-sql.mjs --write
//   node --import ./tests/support/register-ts.mjs supabase/tools/gen-foundation-sql.mjs --check
//
// `--check` exits non-zero when the migration differs from what the manifest
// generates, so a hand edit to a generated region — or a manifest edit that was never
// regenerated — fails a test instead of shipping as drift.
//
// NOT generated, on purpose: the safety logic (authorization coverage, cycle
// refusal, decided-freeze, single-transition), the household-context contract and
// the claim closure. Those are written out in the migration, where they are read.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
export const MIGRATION = join(REPO, 'supabase', 'migrations', '20260919231500_build4_cloud_schema.sql');

const specsModule = await import(pathToFileURL(join(REPO, 'src', 'domain', 'sync', 'foundationSpecs.ts')).href);
const refModule = await import(pathToFileURL(join(REPO, 'src', 'domain', 'foundation', 'typedRef.ts')).href);
const { FOUNDATION_SPECS, EXISTING_FACETS, EXISTING_ROW_CHECKS, PROVENANCE_EXISTING, CLOUD_PRODUCERS, columnsOfSpec } = specsModule;
const { KIND_CLOUD } = refModule;

const SQL_TYPE = { text: 'text', int: 'integer', bigint: 'bigint', bool: 'boolean', instant: 'timestamptz', date: 'date', smallints: 'smallint[]' };
const LOCAL_ID_RE = `'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text`;
const MAX_MONEY = '9007199254740991';

/** Kinds whose cloud table is owner-private (carries profile_id), so a reference to one is same-household AND same-owner. */
const OWNER_PRIVATE_KINDS = new Set(['needsMe', 'oneMove', 'goal', 'responsibility', 'observation', 'pattern', 'intent', 'person', 'interpretation', 'opportunity']);

/** What a `link` field points at. `member` is the household's child, proven structurally (NHR-01). */
const LINK_TARGET = {
  sourceArtifact: { table: 'source_artifacts', ownerPrivate: true },
  interpretation: { table: 'interpretations', ownerPrivate: true },
  externalReference: { table: 'external_references', ownerPrivate: true },
  observation: { table: 'behavior_observations', ownerPrivate: true },
  authority: { table: 'automation_authorities', ownerPrivate: true },
  intent: { table: 'action_intents', ownerPrivate: true },
  decision: { table: 'intent_decisions', ownerPrivate: true },
  execution: { table: 'action_executions', ownerPrivate: true },
  person: { table: 'household_people', ownerPrivate: true },
  responsibility: { table: 'responsibilities', ownerPrivate: true },
  goal: { table: 'goals', ownerPrivate: true },
  system: { table: 'household_systems', ownerPrivate: false },
  category: { table: 'household_categories', ownerPrivate: false },
  member: { table: 'household_members', ownerPrivate: false, child: true },
};

const specByKind = new Map(FOUNDATION_SPECS.map((s) => [s.kind, s]));
const tableOf = (kind) => (KIND_CLOUD[kind] ? KIND_CLOUD[kind].table : specByKind.get(kind).table);

const ident = (name) => {
  if (name.length > 63) throw new Error(`identifier too long (${name.length}): ${name}`);
  return name;
};

const q = (list) => list.map((v) => `'${v}'`).join(', ');

// The column model lives in the manifest (columnsOfSpec), shared with the sync engine.
const columnsOf = columnsOfSpec;

// ---------------------------------------------------------------- constraints --

const constraint = (table, name, body) => `ALTER TABLE public.${table} ADD CONSTRAINT ${ident(`${table}_${name}`)} ${body};`;
const fkTail = (target, ownerPrivate, onDelete) =>
  `REFERENCES public.${target}(id, household_id${ownerPrivate ? ', profile_id' : ''}) ON DELETE ${onDelete}`;
const fkCols = (col, ownerPrivate) => `(${col}, household_id${ownerPrivate ? ', profile_id' : ''})`;

function provenanceConstraints(table, ownerPrivate) {
  return [
    constraint(table, 'producer_values_check', `CHECK (producer = ANY (ARRAY[${q(CLOUD_PRODUCERS)}]))`),
    // Confidence exists exactly for the producers whose output is a claim that may be wrong.
    constraint(table, 'confidence_check',
      `CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))\n    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])))`),
    // A row nothing was derived from cannot name a source.
    constraint(table, 'source_artifact_check', `CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']))`),
    constraint(table, 'source_artifact_fkey',
      `FOREIGN KEY ${fkCols('source_artifact_id', ownerPrivate)}\n    ${fkTail('source_artifacts', ownerPrivate, 'NO ACTION')}`),
  ];
}

function moneyChecks(table, prefix, nullable, noDirection) {
  const amount = `${prefix}_amount_minor`;
  const currency = `${prefix}_currency`;
  const direction = `${prefix}_direction`;
  const parts = [];
  if (nullable) {
    parts.push(`((${amount} IS NULL) = (${currency} IS NULL))`);
    if (!noDirection) parts.push(`((${amount} IS NULL) = (${direction} IS NULL))`);
  }
  parts.push(`(${amount} IS NULL OR (${amount} >= 0 AND ${amount} <= ${MAX_MONEY}))`);
  parts.push(`(${currency} IS NULL OR ${currency} ~ '^[A-Z]{3}$')`);
  if (!noDirection) parts.push(`(${direction} IS NULL OR ${direction} = ANY (ARRAY['outflow','inflow']))`);
  return constraint(table, `${prefix}_money_check`, `CHECK (${parts.join('\n    AND ')})`);
}

function refChecks(table, f) {
  const typeCol = `${f.prefix}_type`;
  const parts = [`(${typeCol} IS NULL OR ${typeCol} = ANY (ARRAY[${q(f.kinds)}]))`];
  for (const kind of f.kinds) {
    parts.push(`(COALESCE(${typeCol} = '${kind}', false) = (${f.prefix}_${KIND_CLOUD[kind].column} IS NOT NULL))`);
  }
  const out = [constraint(table, `${f.prefix}_ref_check`, `CHECK (${parts.join('\n    AND ')})`)];
  for (const kind of f.kinds) {
    const col = `${f.prefix}_${KIND_CLOUD[kind].column}`;
    const ownerPrivate = OWNER_PRIVATE_KINDS.has(kind);
    out.push(constraint(table, `${col}_fkey`,
      `FOREIGN KEY ${fkCols(col, ownerPrivate)}\n    ${fkTail(KIND_CLOUD[kind].table, ownerPrivate, f.onDelete === 'cascade' ? 'CASCADE' : 'NO ACTION')}`));
  }
  return out;
}

// ---------------------------------------------------------------- one table ----

function tableDdl(spec) {
  const t = spec.table;
  const cols = columnsOf(spec);
  const width = Math.max(...cols.map((c) => c.name.length)) + 1;
  const lines = cols.map((c) => `  ${c.name.padEnd(width)}${c.sql}`);
  return `CREATE TABLE public.${t} (\n${lines.join(',\n')}\n);\n\nALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;\n`;
}

/** The keys every other table's references depend on. All of them exist before any reference is made. */
function tableKeys(spec) {
  const t = spec.table;
  return [
    constraint(t, 'pkey', 'PRIMARY KEY (id)'),
    constraint(t, 'id_household_id_profile_id_key', 'UNIQUE (id, household_id, profile_id)'),
    constraint(t, 'household_id_profile_id_local_id_key', 'UNIQUE (household_id, profile_id, local_id)'),
  ].join('\n');
}

function tableRest(spec) {
  const t = spec.table;
  const cols = columnsOf(spec);
  const out = [];

  out.push(constraint(t, 'household_id_fkey', 'FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE'));
  out.push(constraint(t, 'profile_id_fkey', `FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE ${spec.profileOnDelete === 'restrict' ? 'RESTRICT' : 'CASCADE'}`));
  out.push(constraint(t, 'local_id_check', `CHECK (local_id ~ ${LOCAL_ID_RE})`));
  out.push(constraint(t, 'scope_check', `CHECK (scope = 'personal'::text)`));
  if (spec.mutable) out.push(constraint(t, 'revision_check', 'CHECK (revision > 0)'));

  if (spec.provenance === 'standard') out.push(...provenanceConstraints(t, true));

  for (const f of spec.fields) {
    if (f.type === 'ref') out.push(...refChecks(t, f));
    else if (f.type === 'money') out.push(moneyChecks(t, f.prefix, f.nullable, f.noDirection));
    else if (f.type === 'link') {
      const target = LINK_TARGET[f.to];
      if (!target) throw new Error(`${t}: unknown link target ${f.to}`);
      if (target.child) {
        const typeCol = f.col.replace(/_id$/, '_type');
        out.push(constraint(t, `${typeCol}_pairing_check`, `CHECK ((${f.col} IS NULL) = (${typeCol} IS NULL))`));
        out.push(constraint(t, `${typeCol}_child_check`, `CHECK (${typeCol} IS NULL OR ${typeCol} = 'child'::text)`));
        out.push(constraint(t, `${f.col}_fkey`,
          `FOREIGN KEY (${f.col}, household_id, ${typeCol})\n    REFERENCES public.household_members(id, household_id, member_type) ON DELETE NO ACTION`));
      } else {
        out.push(constraint(t, `${f.col}_fkey`, `FOREIGN KEY ${fkCols(f.col, target.ownerPrivate)}\n    ${fkTail(target.table, target.ownerPrivate, 'NO ACTION')}`));
      }
    }
  }

  for (const [suffix, body] of spec.checks ?? []) out.push(constraint(t, suffix, `CHECK (${body})`));
  for (const [suffix, columns] of spec.uniques ?? []) out.push(constraint(t, suffix, `UNIQUE ${columns}`));

  // Indexes: the owner boundary, every foreign key's referencing side, and the spec's own.
  out.push(`CREATE INDEX ${ident(`${t}_owner_idx`)} ON public.${t} (household_id, profile_id);`);
  for (const c of cols) {
    const isFk = spec.fields.some((f) =>
      (f.type === 'link' && f.col === c.name) ||
      (f.type === 'ref' && f.kinds.some((k) => `${f.prefix}_${KIND_CLOUD[k].column}` === c.name)));
    if (isFk || c.name === 'source_artifact_id') {
      out.push(`CREATE INDEX ${ident(`${t}_${c.name}_fk_idx`)} ON public.${t} (${c.name}, household_id) WHERE ${c.name} IS NOT NULL;`);
    }
  }
  for (const [suffix, tail, unique] of spec.indexes ?? []) {
    out.push(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${ident(`${t}_${suffix}`)}\n  ${tail};`);
  }

  // Triggers.
  out.push(`CREATE TRIGGER ${ident(`${t}_force_id`)} BEFORE ${spec.mutable ? 'INSERT OR UPDATE' : 'INSERT'} ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();`);
  if (spec.mutable) out.push(`CREATE TRIGGER ${ident(`${t}_set_updated_at`)} BEFORE UPDATE ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();`);
  for (const c of cols.filter((x) => x.derivedFor)) {
    out.push(`CREATE TRIGGER ${ident(`${t}_set_${c.name}`)} BEFORE INSERT OR UPDATE ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION public.set_child_member_type('${c.derivedFor}', '${c.name}');`);
  }
  if (!spec.mutable) out.push(`CREATE TRIGGER ${ident(`${t}_immutable`)} BEFORE UPDATE OR DELETE ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();`);
  for (const [suffix, timing, events, fn] of spec.triggers ?? []) {
    out.push(`CREATE TRIGGER ${ident(`${t}_${suffix}`)} ${timing} ${events} ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION ${fn};`);
  }
  out.push(`CREATE TRIGGER ${ident(`${t}_log_change`)} AFTER ${spec.mutable ? 'INSERT OR UPDATE OR DELETE' : 'INSERT'} ON public.${t}\n  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');`);

  // Policies. Owner-only, member-of-household; and no INSERT/UPDATE policy where the client may not write.
  const own = `(SELECT auth.uid()) = profile_id AND private.is_household_member(household_id)`;
  out.push(`CREATE POLICY ${ident(`${t}_select_own`)} ON public.${t}\n  FOR SELECT TO authenticated\n  USING (${own});`);
  if (!spec.serverWritten) out.push(`CREATE POLICY ${ident(`${t}_insert_own`)} ON public.${t}\n  FOR INSERT TO authenticated\n  WITH CHECK (${own});`);
  if (spec.mutable && cols.some((c) => c.update)) {
    out.push(`CREATE POLICY ${ident(`${t}_update_own`)} ON public.${t}\n  FOR UPDATE TO authenticated\n  USING (${own})\n  WITH CHECK (${own});`);
  }
  return out.join('\n');
}

function tableGrants(spec) {
  const t = spec.table;
  const cols = columnsOf(spec);
  const wrap = (names) => names.join(', ').replace(/(.{1,86})(, |$)/g, '$1$2\n              ').trimEnd();
  const out = [`GRANT SELECT ON public.${t} TO authenticated;`];
  if (!spec.serverWritten) out.push(`GRANT INSERT (${wrap(cols.filter((c) => c.insert).map((c) => c.name))})\n  ON public.${t} TO authenticated;`);
  const upd = cols.filter((c) => c.update).map((c) => c.name);
  if (spec.mutable && upd.length) out.push(`GRANT UPDATE (${wrap(upd)})\n  ON public.${t} TO authenticated;`);
  return out.join('\n');
}

// --------------------------------------------------- the existing nine tables ---

const KEYS_ON_EXISTING = [
  // Every existing table a foundation row can reference gains the composite key the reference needs.
  ['tasks', 'id_household_id_key', 'UNIQUE (id, household_id)'],
  ['events', 'id_household_id_key', 'UNIQUE (id, household_id)'],
  ['household_systems', 'id_household_id_key', 'UNIQUE (id, household_id)'],
  ['meal_plan_entries', 'id_household_id_key', 'UNIQUE (id, household_id)'],
  ['needs_me_items', 'id_household_id_profile_id_key', 'UNIQUE (id, household_id, profile_id)'],
  ['one_move_records', 'id_household_id_profile_id_key', 'UNIQUE (id, household_id, profile_id)'],
  // A household-scoped row (a task, an event…) names its source artifact by (id, household). The artifact itself
  // is owner-only, so the pointer is opaque to any other member, and the owner-private tables use the wider key.
  ['source_artifacts', 'id_household_id_key', 'UNIQUE (id, household_id)'],
];

function existingColumns() {
  const out = [];
  for (const [kind, { table, ownerPrivate }] of Object.entries(PROVENANCE_EXISTING)) {
    const adds = [
      'ADD COLUMN producer           text NOT NULL',
      'ADD COLUMN source_artifact_id uuid',
      'ADD COLUMN confidence         text',
    ];
    for (const f of EXISTING_FACETS[kind] ?? []) {
      if (f.type === 'money') {
        adds.push(`ADD COLUMN ${f.prefix}_amount_minor bigint`, `ADD COLUMN ${f.prefix}_currency text`, `ADD COLUMN ${f.prefix}_direction text`);
      } else {
        adds.push(`ADD COLUMN ${f.col} ${SQL_TYPE[f.type]}${f.nullable ? '' : ' NOT NULL'}${f.def ? ` DEFAULT ${f.def}` : ''}`);
      }
    }
    out.push(`ALTER TABLE public.${table}\n  ${adds.join(',\n  ')};`);
    void ownerPrivate;
  }
  return out.join('\n');
}

function existingConstraints() {
  const out = [];
  for (const [kind, { table, ownerPrivate }] of Object.entries(PROVENANCE_EXISTING)) {
    out.push(...provenanceConstraints(table, ownerPrivate));
    out.push(`CREATE INDEX ${ident(`${table}_source_artifact_fk_idx`)} ON public.${table} (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;`);
    for (const f of EXISTING_FACETS[kind] ?? []) {
      if (f.type === 'money') out.push(moneyChecks(table, f.prefix, true, false));
      else if (f.check) out.push(constraint(table, `${f.col}_check`, `CHECK (${f.check})`));
    }
    for (const [ruleKind, suffix, body] of EXISTING_ROW_CHECKS) {
      if (ruleKind === kind) out.push(constraint(table, suffix, `CHECK (${body})`));
    }
  }
  return out.join('\n');
}

// -------------------------------------------------------------------- output ---

const banner = (name, body) =>
  `-- >>> GENERATED ${name} — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.\n` +
  `-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.\n` +
  `${body.trimEnd()}\n` +
  `-- <<< GENERATED ${name}\n`;

export function generate() {
  const specs = FOUNDATION_SPECS;
  const tables = [
    '-- Phase 1 — the tables. Columns only, in one pass, because the references between them are cyclic:\n' +
      '-- an external reference is written by an execution, and an execution may name an external reference.',
    ...specs.map(tableDdl),
    '-- Phase 2 — the keys every reference depends on: on the new tables, and the composite keys on the tables that already existed.',
    ...specs.map(tableKeys),
    ...KEYS_ON_EXISTING.map(([table, name, body]) => constraint(table, name, body)),
    '',
    '-- Phase 3 — provenance and the commitment facets on the nine tables that already existed. NULL means "not known".',
    existingColumns(),
    '',
    '-- Phase 4 — every foundation table\'s constraints, indexes, triggers and policies.',
    ...specs.map((s) => `-- ${s.table}\n${tableRest(s)}`),
    '',
    '-- Phase 5 — constraints on the nine existing tables\' new columns.',
    existingConstraints(),
  ].join('\n');

  const grants = ['-- Foundation tables. Server-written kinds have SELECT only: the client pulls what the server records.',
    ...specs.map(tableGrants),
    '',
    '-- Provenance and facets on the tables that already existed. A client states where a row came from when it creates it,',
    '-- and may afterwards move only its confidence. `producer` and `source_artifact_id` are fixed at insert.',
    ...Object.entries(PROVENANCE_EXISTING).flatMap(([kind, { table }]) => {
      const facets = (EXISTING_FACETS[kind] ?? []).flatMap((f) =>
        f.type === 'money' ? [`${f.prefix}_amount_minor`, `${f.prefix}_currency`, `${f.prefix}_direction`] : [f.col]);
      // onboarding, discovery and needs-me are created by the client too; every one of the nine states its provenance.
      const insert = ['producer', 'source_artifact_id', 'confidence', ...facets];
      const update = ['confidence', ...facets];
      return [
        `GRANT INSERT (${insert.join(', ')})\n  ON public.${table} TO authenticated;`,
        `GRANT UPDATE (${update.join(', ')})\n  ON public.${table} TO authenticated;`,
      ];
    }),
  ].join('\n');

  return { tables: banner('foundation-tables', tables), grants: banner('foundation-grants', grants) };
}

function region(text, name) {
  const start = text.indexOf(`-- >>> GENERATED ${name}`);
  const endMarker = `-- <<< GENERATED ${name}\n`;
  const end = text.indexOf(endMarker);
  if (start < 0 || end < 0) return null;
  return { start, end: end + endMarker.length };
}

export function splice(text, generated) {
  let out = text;
  for (const name of ['foundation-tables', 'foundation-grants']) {
    const r = region(out, name);
    if (!r) throw new Error(`the migration has no ${name} marker pair`);
    out = out.slice(0, r.start) + generated[name === 'foundation-tables' ? 'tables' : 'grants'] + out.slice(r.end);
  }
  return out;
}

const mode = process.argv[2];
if (mode === '--write' || mode === '--check') {
  const current = readFileSync(MIGRATION, 'utf8');
  const crlf = current.includes('\r\n');
  const normalized = current.replace(/\r\n/g, '\n');
  const next = splice(normalized, generate());
  if (mode === '--check') {
    if (next !== normalized) {
      console.error('the migration differs from what the manifest generates — run --write');
      process.exit(1);
    }
    console.log('foundation SQL is up to date');
  } else {
    writeFileSync(MIGRATION, crlf ? next.replace(/\n/g, '\r\n') : next);
    console.log(`wrote ${MIGRATION}`);
  }
} else if (mode === '--print') {
  const g = generate();
  process.stdout.write(g.tables + '\n' + g.grants);
}
