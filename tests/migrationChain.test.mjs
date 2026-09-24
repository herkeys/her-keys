/**
 * THE MIGRATION CHAIN HOLDS TOGETHER (HK-F01-F13 integration, INT13-01) — a static check, no database needed.
 *
 * Integrating Features 09-13 found four chain defects no single feature could see: three migrations claimed one version
 * (20260922180000); Feature 10 edited two already-applied migrations in place; each additive migration re-declared sync_push and the
 * change-log check with only its OWN tables, so whichever applied last silently removed its siblings'; and Feature 09's migration was in
 * no harness chain. The backend harness proves the applied result (run.mjs); these tests make the same mistakes fail in the app suite,
 * in seconds, before anything is applied anywhere.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADDITIVE_CHAIN,
  FULL_CHAIN,
  MIGRATIONS_DIR,
  POST_CERT_CHAIN,
  WAVE3_BASE_CHAIN,
  WAVE3_BASE_SHA256,
  WAVE3_TO_F13_CHAIN,
  migrationPath,
} from '../supabase/tests/migration-chain.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = (file) => readFileSync(migrationPath(file), 'utf8');
const lf = (file) => text(file).replace(/\r\n/g, '\n');
/** The tables Features 10-13 create. After the whole chain every one must be pushable and loggable. */
const FEATURE_TABLES = ['career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links'];

/** The quoted table names inside the LAST `marker ... end` span of a file, or null when the file does not declare it. */
function lastList(sql, marker, end) {
  const at = sql.lastIndexOf(marker);
  if (at < 0) return null;
  const stop = sql.indexOf(end, at);
  return [...sql.slice(at, stop).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}
const changeLogList = (sql) => lastList(sql, 'ADD CONSTRAINT change_log_entity_table_check', ']));');
const ownerPrivateList = (sql) => lastList(sql, "WHEN p_entity_table = ANY (ARRAY[", "]) THEN 'profile_id'");
const noRevisionList = (sql) => lastList(sql, 'v_has_revision := p_entity_table <> ALL (ARRAY[', ']);');

describe('the migration chain', () => {
  test('the migrations directory holds exactly the registered chain, in order, and nothing else', () => {
    const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(onDisk, FULL_CHAIN);
  });

  test('every migration version is unique and strictly increasing (no two files claim one version)', () => {
    const versions = FULL_CHAIN.map((f) => f.split('_')[0]);
    assert.equal(new Set(versions).size, versions.length, versions.join(', '));
    for (let i = 1; i < versions.length; i += 1) assert.ok(versions[i - 1] < versions[i], `${versions[i - 1]} !< ${versions[i]}`);
  });

  test('no migration that existed at WAVE3_BASE has changed by a single byte (an applied migration is never edited)', () => {
    assert.deepEqual(Object.keys(WAVE3_BASE_SHA256).sort(), [FULL_CHAIN[0], FULL_CHAIN[1], ...WAVE3_BASE_CHAIN.map((m) => m.file)].sort());
    for (const [file, sha] of Object.entries(WAVE3_BASE_SHA256)) {
      assert.equal(createHash('sha256').update(lf(file)).digest('hex'), sha, file);
    }
  });

  test('every migration the integration adds is LF on disk, pinned LF by .gitattributes, and opens, closes and asserts', () => {
    const attributes = readFileSync(join(REPO, '.gitattributes'), 'utf8');
    for (const { file } of WAVE3_TO_F13_CHAIN) {
      const sql = text(file);
      assert.ok(!sql.includes('\r'), `${file} holds a carriage return`);
      assert.ok(attributes.includes(`supabase/migrations/${file} text eol=lf`), `${file} is not pinned LF`);
      assert.match(sql, /^\s*BEGIN;\s*$/m, file);
      assert.ok(sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'), `${file} does not end with the fail-closed assertion`);
    }
  });
});

describe('post-certification migration governance', () => {
  test('the environment-alignment migration stays registered, additive, and function-only at the schema level', () => {
    assert.deepEqual(POST_CERT_CHAIN.map((m) => [m.owner, m.file]), [
      ['ENV_ALIGN', '20260924183000_env_function_alignment.sql'],
    ]);
    const sql = lf(POST_CERT_CHAIN[0].file);
    const executable = sql.replace(/--.*$/gm, '');
    assert.match(sql, /^\s*BEGIN;\s*$/m);
    assert.ok(sql.trim().endsWith('COMMIT;'));
    assert.match(executable, /CREATE OR REPLACE FUNCTION/);
    assert.doesNotMatch(executable, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b|\bTRUNCATE\b|\bCREATE\s+(?:UNIQUE\s+)?INDEX\b|\bADD\s+CONSTRAINT\b|\bGRANT\b|\bREVOKE\b/i);
  });
});

describe('a re-declaration never drops an earlier registration', () => {
  // Walk the chain in order. Each file that re-declares the change-log check or sync_push must carry EVERY name the previous
  // declaration carried: a later migration may add, never silently take away.
  const declarations = (read) => {
    const out = [];
    for (const file of FULL_CHAIN) {
      const list = read(lf(file));
      if (list !== null) out.push({ file, list });
    }
    return out;
  };

  for (const [what, read] of [['change_log_entity_table_check', changeLogList], ['the sync_push owner-private allow-list', ownerPrivateList], ['the sync_push no-revision list', noRevisionList]]) {
    test(`${what}: each re-declaration is a superset of the one before it`, () => {
      const decls = declarations(read);
      assert.ok(decls.length >= 2, `${what} is declared ${decls.length} time(s)`);
      for (let i = 1; i < decls.length; i += 1) {
        const dropped = decls[i - 1].list.filter((name) => !decls[i].list.includes(name));
        assert.deepEqual(dropped, [], `${decls[i].file} dropped ${dropped.join(', ')} that ${decls[i - 1].file} declared`);
      }
    });
  }

  test('after the whole chain, the change-log check and the sync_push allow-list name every feature table', () => {
    const lastLog = declarations(changeLogList).at(-1).list;
    const lastPush = declarations(ownerPrivateList).at(-1).list;
    assert.deepEqual(FEATURE_TABLES.filter((t) => !lastLog.includes(t)), []);
    assert.deepEqual(FEATURE_TABLES.filter((t) => !lastPush.includes(t)), []);
  });

  test('HK13-D24: after the whole chain, each owner-private uniqueness rule is PER OWNER (its last definition names profile_id)', () => {
    const lastDefinition = (name) => {
      let last = null;
      for (const file of FULL_CHAIN) {
        const code = lf(file).replace(/--.*$/gm, '');
        const index = [...code.matchAll(new RegExp(`CREATE UNIQUE INDEX ${name}\\s+ON public\\.\\w+ \\(([^;]*?)\\)(?: WHERE[^;]*)?;`, 'g'))].at(-1);
        const constraint = [...code.matchAll(new RegExp(`ADD CONSTRAINT ${name} UNIQUE \\(([^)]*)\\)`, 'g'))].at(-1);
        if (index || constraint) last = { file, columns: (index ?? constraint)[1] };
      }
      return last;
    };
    for (const name of ['responsibilities_one_live_owner_uq', 'dependencies_live_edge_uq', 'recurrence_rules_one_active_rule_uq', 'system_steps_system_position_key']) {
      const last = lastDefinition(name);
      assert.ok(last, `${name} is defined somewhere in the chain`);
      assert.match(last.columns, /\bprofile_id\b/, `${name}, last defined in ${last.file}: (${last.columns}) spans the household`);
    }
  });

  test('each feature migration registers its own tables in the SAME file that creates them (so every prefix of the chain works)', () => {
    for (const { file } of ADDITIVE_CHAIN) {
      const sql = lf(file);
      const created = [...sql.replace(/--.*$/gm, '').matchAll(/CREATE TABLE public\.(\w+)/g)].map((m) => m[1]);
      if (created.length === 0) continue;
      assert.deepEqual(created.filter((t) => !changeLogList(sql).includes(t)), [], `${file}: change log`);
      assert.deepEqual(created.filter((t) => !ownerPrivateList(sql).includes(t)), [], `${file}: sync_push`);
    }
  });
});
