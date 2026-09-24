// THE MIGRATION CHAIN — one ordered list, read by every local harness (HK-F01-F13 integration, INT13-01).
//
// Before the integration each feature kept its own copy of "the migrations to apply" in run.mjs, private-stack.mjs, run-f12.mjs and
// run-f13.mjs, and each copy knew only its own feature: Feature 09 never registered its migration at all, three feature migrations
// claimed one version (20260922180000), and a stack built from one copy silently lacked a sibling's schema. Every harness now builds
// its databases from this list, and run.mjs refuses a migrations directory that holds a file this list does not name.
//
// Order is the order of application AND the order of the version prefixes: each version is unique and strictly increasing.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, '..', 'migrations');
export const migrationPath = (file) => join(MIGRATIONS_DIR, file);

/** Build 4 phase 1: the reviewed baseline (never edited). */
export const BASELINE = '20260919230054_build4_baseline.sql';
/** Build 4: the shipping migration, applied to Staging. Never edited after shipping; every later change is additive. */
export const SHIPPING = '20260919231500_build4_cloud_schema.sql';

/** Every ADDITIVE migration after the shipping one, in application order, with the build that owns it. */
export const ADDITIVE_CHAIN = [
  { file: '20260921120000_ir01_duration_source_and_claim_v3.sql', owner: 'IR01', label: 'ir01' },
  { file: '20260921160000_f08_meal_slot_and_status.sql', owner: 'F08', label: 'f08' },
  { file: '20260921190000_f05_add_child_after_binding.sql', owner: 'F05', label: 'f05' },
  { file: '20260922180000_f09_task_payment_mechanism.sql', owner: 'F09', label: 'f09' },
  { file: '20260922181000_f10_career_opportunities.sql', owner: 'F10', label: 'f10' },
  { file: '20260922182000_f11_rebuild_focus.sql', owner: 'F11', label: 'f11' },
  { file: '20260922183000_f12_life_records.sql', owner: 'F12', label: 'f12' },
  { file: '20260922200000_f13_people_os.sql', owner: 'F13', label: 'f13' },
  // The F01-F13 integration's own repair (HK13-D24): four owner-private uniqueness rules become per owner.
  { file: '20260922210000_int13_per_owner_uniqueness.sql', owner: 'INT13', label: 'int13' },
  // Post-certification environment convergence: function-body alignment only, no table/data/policy/grant changes.
  { file: '20260924183000_env_function_alignment.sql', owner: 'ENV_ALIGN', label: 'env-align' },
];

/** WAVE3_BASE (363e473) ended at F05: the chain a WAVE3_BASE-era database was built with, and the populated-upgrade starting point. */
export const WAVE3_BASE_CHAIN = ADDITIVE_CHAIN.slice(0, ADDITIVE_CHAIN.findIndex((m) => m.owner === 'F05') + 1);
/** What the F01-F13 integration and governed post-certification convergence add on top of WAVE3_BASE, in order. */
export const WAVE3_TO_F13_CHAIN = ADDITIVE_CHAIN.slice(WAVE3_BASE_CHAIN.length);

/** The owner of an additive migration, by file. */
export const additive = (owner) => {
  const found = ADDITIVE_CHAIN.find((m) => m.owner === owner);
  if (!found) throw new Error(`no additive migration is owned by ${owner}`);
  return found;
};

/** Every migration a fresh database receives, in order (baseline and shipping first). */
export const FULL_CHAIN = [BASELINE, SHIPPING, ...ADDITIVE_CHAIN.map((m) => m.file)];

/**
 * The migrations that existed at WAVE3_BASE (363e473) are applied in real or shared environments — the shipping one on Staging, IR01 and
 * F05 on the shared local database — so their bytes may never change. SHA-256 of each file's LF-normalized text at WAVE3_BASE.
 * (Feature 10 had edited the shipping and the F05 migration in place; the F01-F13 integration restored both, INT13-01.)
 */
export const WAVE3_BASE_SHA256 = {
  [BASELINE]: '8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f',
  [SHIPPING]: '7582e5e6db96b97385a2d9509fd14b40a1dec8af4c52f05e098f77c6567fd4dc',
  '20260921120000_ir01_duration_source_and_claim_v3.sql': '73db663974354f0c968b6b11b0a92f901aff6e5f464ad9bcfc953ff43a1901a4',
  '20260921160000_f08_meal_slot_and_status.sql': 'fdfa8aabd1188346189e03d3bb93efc0054426d98dbac0e691a3f0c3196f1617',
  '20260921190000_f05_add_child_after_binding.sql': '21cdfe205ca6b7ac9fd7923ab924d14aa0f7404a2550e864e3a890a1277d5e87',
};
