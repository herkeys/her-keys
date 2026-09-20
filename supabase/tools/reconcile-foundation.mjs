#!/usr/bin/env node
// Her Keys — foundation fingerprint reconciliation (B4-FOUNDATION-BUILDOUT-01).
//
// Two `--mode detail` captures of the schema fingerprint (before and after the buildout) go in; every added,
// removed or changed fact comes out ATTRIBUTED to the reason it exists. A change with no reason is drift, and
// this exits non-zero on it — the same rule the fingerprint tool states ("any dimension change outside the
// enumeration is drift, not design"), applied fact by fact rather than dimension by dimension.
//
//   node supabase/tools/reconcile-foundation.mjs <pre.detail.txt> <post.detail.txt> [--json out.json]
//
// A capture is the tab-separated output of `schema-fingerprint.mjs print-sql --mode detail` (dimension <TAB> line).
// The two captures must come from the SAME environment; the digests are compared by the tool, not here.

import { readFileSync, writeFileSync } from 'node:fs';

const [prePath, postPath, ...rest] = process.argv.slice(2);
if (!prePath || !postPath) {
  console.error('usage: reconcile-foundation.mjs <pre.detail.txt> <post.detail.txt> [--json out.json]');
  process.exit(2);
}
const jsonOut = rest[0] === '--json' ? rest[1] : null;

const read = (path) => {
  const facts = new Map();
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const tab = raw.indexOf('\t');
    if (tab < 0) continue;
    const dimension = raw.slice(0, tab);
    const line = raw.slice(tab + 1);
    if (!dimension || dimension.startsWith('info.')) continue;
    if (!facts.has(dimension)) facts.set(dimension, new Set());
    facts.get(dimension).add(line);
  }
  return facts;
};

// ------------------------------------------------------------ what a change is FOR --------------------------------

/** The eighteen foundation tables, each with the primitive that requires it and the FE rows that depend on it. */
const FOUNDATION_TABLES = {
  source_artifacts: ['B4-FE01-002', 'FE-01 FE-04 FE-05'],
  interpretations: ['B4-FE01-003', 'FE-04 FE-05'],
  external_references: ['B4-FE01-004', 'FE-20 FE-21 FE-22'],
  behavior_observations: ['B4-FE01-006', 'FE-06 FE-12 FE-16 FE-26'],
  automation_authorities: ['B4-FE01-007', 'FE-02 FE-13 FE-14'],
  action_intents: ['B4-FE01-008', 'FE-02 FE-13 FE-15'],
  intent_decisions: ['B4-FE01-009', 'FE-02 FE-14'],
  action_executions: ['B4-FE01-010', 'FE-02 FE-16'],
  action_outcomes: ['B4-FE01-011', 'FE-16'],
  household_people: ['B4-FE01-013', 'FE-11 FE-23 FE-27'],
  responsibilities: ['B4-FE01-014', 'FE-11 FE-12'],
  dependencies: ['B4-FE01-017', 'FE-10 FE-18'],
  recurrence_rules: ['B4-FE01-018', 'FE-25'],
  goals: ['B4-FE01-021', 'FE-10'],
  system_steps: ['B4-FE01-022', 'FE-25'],
  capacity_profiles: ['B4-FE01-016', 'FE-07'],
  patterns: ['B4-FE01-023', 'FE-26'],
  evidence_links: ['B4-FE01-024', 'FE-19'],
};

/** The nine tables that already existed, and what each gained. */
const EXISTING_TABLES = {
  household_categories: ['B4-FE01-001/-005', 'FE-01', 'stored provenance'],
  events: ['B4-FE01-001/-015', 'FE-01 FE-03', 'stored provenance; commitment facets; events.source retired'],
  tasks: ['B4-FE01-001/-015/-020', 'FE-01 FE-03 FE-24', 'stored provenance; commitment facets; exact value'],
  household_systems: ['B4-FE01-001/-015', 'FE-01 FE-25', 'stored provenance; autonomy mode and effort'],
  meal_plan_entries: ['B4-FE01-001/-015', 'FE-01 FE-03', 'stored provenance; preparation and energy'],
  needs_me_items: ['B4-FE01-001/-027', 'FE-01', 'stored provenance; composite key for typed references'],
  one_move_records: ['B4-FE01-001/-027', 'FE-01 FE-09', 'stored provenance; five typed targets; composite target keys'],
  discovery_records: ['B4-FE01-001', 'FE-01', 'stored provenance'],
  onboarding_state: ['B4-FE01-001', 'FE-01', 'stored provenance'],
  household_members: ['B4-FE01-027', 'FE-11', 'none — unchanged (a child is proven through its existing composite key)'],
  change_log: ['B4-FE01-029', 'FE-01..FE-27', 'entity_table check widened to the eighteen new tables'],
  account_claims: ['—', '—', 'unchanged'],
  action_records: ['B4-FE01-010', 'FE-02', 'immutable-ledger trigger message made table-generic'],
};

/** Routines added, replaced or re-signed, each with its authority. */
const FUNCTIONS = {
  resolve_household_context: ['B4-FE01-031 / ADR-023', 'explicit household context; replaces the LIMIT-1 current_household_id'],
  current_household_id: ['B4-FE01-031 / ADR-023', 'REMOVED — a coin flip presented as an answer'],
  set_child_member_type: ['B4-FE01-014 / NHR-01', 'a child is proven a child structurally'],
  enforce_single_column_transition: ['B4-FE01-002/-007', 'set-once retract / revoke'],
  freeze_decided_interpretation: ['B4-FE01-003', 'a decided reading is history'],
  guard_withdrawal: ['B4-FE01-009', 'a withdrawal withdraws an approval'],
  forbid_dependency_cycle: ['B4-FE01-017', 'a requirement cycle is never stored'],
  guard_execution_authorization: ['B4-FE01-010', 'the authorization boundary; mirrors executionAuthorization()'],
  claim_artifact_id: ['B4-FE01-002', 'claim v2: an artifact a claimed row names must arrive with the claim'],
  claim_local_household: ['B4-FE01-001/-002/-015', 'claim payload version 2'],
  claim_result: ['B4-FE01-002', 'the id map carries source artifacts'],
  bootstrap_account: ['B4-FE01-001', 'the rows the server lays down state their provenance'],
  insert_starter_categories: ['B4-FE01-001', 'starters are system-derived'],
  sync_pull: ['B4-FE01-031 / ADR-023', 'names its household'],
  sync_push: ['B4-FE01-029', 'allow-list widened to the foundation tables'],
  forbid_ledger_mutation: ['B4-FE01-010', 'immutable-ledger message names the table'],
};

const PUBLIC = /\bpublic\.([a-z_]+)/g;
const tablesIn = (line) => [...line.matchAll(PUBLIC)].map((m) => m[1]);
const functionOf = (line) => {
  const m = line.match(/\b(?:public|private)\.([a-z_]+)\(/) ?? line.match(/^(?:public|private)\.([a-z_]+)\|/) ?? line.match(/\bfunction\|?[^|]*\|?([a-z_]+)\(/);
  return m ? m[1] : null;
};

/** What object does this fact belong to, and why does it exist? Null means: no reason found. */
function attribute(dimension, line) {
  const fn = dimension === 'functions' || dimension === 'privileges.functions' || line.includes('|function|') ? functionOf(line) : null;
  if (fn && FUNCTIONS[fn]) return { object: `function ${fn}`, authority: FUNCTIONS[fn][0], why: FUNCTIONS[fn][1] };

  for (const table of tablesIn(line)) {
    if (FOUNDATION_TABLES[table]) return { object: table, authority: FOUNDATION_TABLES[table][0], why: `new table; ${FOUNDATION_TABLES[table][1]}` };
  }
  for (const table of tablesIn(line)) {
    if (EXISTING_TABLES[table]) return { object: table, authority: EXISTING_TABLES[table][0], why: EXISTING_TABLES[table][2] };
  }
  // The generic `private`/`public` routines and helper privileges that the migration touches as a whole.
  if (dimension.startsWith('privileges.effective')) {
    for (const table of tablesIn(line)) if (FOUNDATION_TABLES[table] || EXISTING_TABLES[table]) return attribute('relations', `public.${table}`);
  }
  return null;
}

// ----------------------------------------------------------------- the diff ---------------------------------------

const pre = read(prePath);
const post = read(postPath);
const dimensions = [...new Set([...pre.keys(), ...post.keys()])].sort();

const report = { dimensions: [], unexplained: [] };
const byObject = new Map();

for (const dimension of dimensions) {
  const before = pre.get(dimension) ?? new Set();
  const after = post.get(dimension) ?? new Set();
  const added = [...after].filter((l) => !before.has(l));
  const removed = [...before].filter((l) => !after.has(l));
  const row = { dimension, before: before.size, after: after.size, added: added.length, removed: removed.length, explained: 0, unexplained: 0 };
  for (const [kind, lines] of [['added', added], ['removed', removed]]) {
    for (const line of lines) {
      const why = attribute(dimension, line);
      if (why === null) {
        row.unexplained += 1;
        report.unexplained.push({ dimension, kind, line });
        continue;
      }
      row.explained += 1;
      const key = why.object;
      if (!byObject.has(key)) byObject.set(key, { object: key, authority: why.authority, why: why.why, added: {}, removed: {} });
      const entry = byObject.get(key);
      entry[kind][dimension] = (entry[kind][dimension] ?? 0) + 1;
    }
  }
  report.dimensions.push(row);
}
report.objects = [...byObject.values()].sort((a, b) => a.object.localeCompare(b.object));

// ---------------------------------------------------------------- the output --------------------------------------
const pad = (v, n) => String(v).padEnd(n);
console.log(`${pad('dimension', 24)}${pad('before', 8)}${pad('after', 8)}${pad('+', 7)}${pad('-', 6)}${pad('explained', 11)}unexplained`);
let totalAdded = 0, totalRemoved = 0, totalExplained = 0, totalUnexplained = 0;
for (const r of report.dimensions) {
  console.log(`${pad(r.dimension, 24)}${pad(r.before, 8)}${pad(r.after, 8)}${pad(r.added, 7)}${pad(r.removed, 6)}${pad(r.explained, 11)}${r.unexplained}`);
  totalAdded += r.added; totalRemoved += r.removed; totalExplained += r.explained; totalUnexplained += r.unexplained;
}
console.log(`${pad('TOTAL', 24)}${pad('', 16)}${pad(totalAdded, 7)}${pad(totalRemoved, 6)}${pad(totalExplained, 11)}${totalUnexplained}`);
console.log(`\n${report.objects.length} objects account for every change.`);
if (report.unexplained.length > 0) {
  console.log('\nUNEXPLAINED (drift, not design):');
  for (const u of report.unexplained.slice(0, 40)) console.log(`  [${u.dimension}] ${u.kind}: ${u.line.slice(0, 200)}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ totals: { added: totalAdded, removed: totalRemoved, explained: totalExplained, unexplained: totalUnexplained }, ...report }, null, 2));
process.exit(totalUnexplained === 0 ? 0 : 1);
