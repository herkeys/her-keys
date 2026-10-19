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
  // Google Calendar activation: two service-only tables (RLS on, no client grants). Applied to Staging and Production as written.
  { file: '20260925141432_external_calendar_connections.sql', owner: 'CAL_CONNECTIONS', label: 'calendar' },
  { file: '20261009020000_herkeys_welcome_email_receipts.sql', owner: 'WELCOME_EMAIL', label: 'welcome-email' },
  { file: '20261009060000_v2_account_consents.sql', owner: 'V2_CONSENT', label: 'v2-consent' },
  { file: '20261014002726_account_deletion_lifecycle.sql', owner: 'ACCOUNT_DELETION', label: 'account-deletion' },
  { file: '20261014012518_account_deletion_auth_reconciliation.sql', owner: 'ACCOUNT_DELETION_AUTH', label: 'account-deletion-auth' },
  { file: '20261014014020_account_deletion_terminal_identity.sql', owner: 'ACCOUNT_DELETION_IDENTITY', label: 'account-deletion-identity' },
  { file: '20261014014620_account_deletion_proof_retention.sql', owner: 'ACCOUNT_DELETION_RETENTION', label: 'account-deletion-retention' },
  { file: '20261014015835_account_deletion_cancelled_history_cleanup.sql', owner: 'ACCOUNT_DELETION_HISTORY', label: 'account-deletion-history' },
  { file: '20261014021410_account_deletion_shared_provider_retry.sql', owner: 'ACCOUNT_DELETION_SHARED_RETRY', label: 'account-deletion-shared-retry' },
  { file: '20261014112400_account_deletion_orphan_shared_ownership.sql', owner: 'ACCOUNT_DELETION_OTHER_OWNERS', label: 'account-deletion-other-owners' },
  { file: '20261014113517_account_deletion_household_lock.sql', owner: 'ACCOUNT_DELETION_HOUSEHOLD_LOCK', label: 'account-deletion-household-lock' },
  // Her Keys Premium Stage 1 (A1/A2): service-only entitlement projection, feature manifest, atomic quotas, authorization.
  { file: '20261015120000_premium_entitlement_foundation.sql', owner: 'PREMIUM_FOUNDATION', label: 'premium-foundation' },
  // Her Keys Premium Stage 1 (A4): the shared decision ledger (owner-readable receipts) and service-only operational views.
  { file: '20261015130000_premium_decision_ledger.sql', owner: 'PREMIUM_LEDGER', label: 'premium-ledger' },
  // Premium engineering: dirty and stale server-authoritative subscriber projections must fail closed before paid work.
  { file: '20261015140000_premium_stale_projection_guard.sql', owner: 'PREMIUM_FRESHNESS', label: 'premium-freshness' },
  // Premium launch: actor-bound purchase readiness and independent checkout OFF-by-default control.
  { file: '20261016012000_premium_purchase_readiness.sql', owner: 'PREMIUM_PURCHASE_READINESS', label: 'premium-purchase-readiness' },
  { file: '20261016013000_premium_checkout_independent_activation.sql', owner: 'PREMIUM_CHECKOUT_SWITCH', label: 'premium-checkout-switch' },
  { file: '20261017180000_ai_response_reporting.sql', owner: 'AI_REPORTING', label: 'ai-reporting' },
  { file: '20261017221825_ai_report_review_workflow.sql', owner: 'AI_REPORT_REVIEW', label: 'ai-report-review' },
  { file: '20261019144729_account_deletion_v2_resource_certification.sql', owner: 'ACCOUNT_DELETION_V2', label: 'account-deletion-v2' },
  { file: '20261019151501_account_deletion_optional_welcome_inventory.sql', owner: 'ACCOUNT_DELETION_OPTIONAL_WELCOME', label: 'account-deletion-optional-welcome' },
  { file: '20261019152629_account_deletion_overdue_request_monitor.sql', owner: 'ACCOUNT_DELETION_OVERDUE_MONITOR', label: 'account-deletion-overdue-monitor' },
];

/** WAVE3_BASE (363e473) ended at F05: the chain a WAVE3_BASE-era database was built with, and the populated-upgrade starting point. */
export const WAVE3_BASE_CHAIN = ADDITIVE_CHAIN.slice(0, ADDITIVE_CHAIN.findIndex((m) => m.owner === 'F05') + 1);
/** What the F01-F13 integration adds on top of WAVE3_BASE, through INT13, in order. */
const POST_CERT_START = ADDITIVE_CHAIN.findIndex((m) => m.owner === 'ENV_ALIGN');
export const WAVE3_TO_F13_CHAIN = ADDITIVE_CHAIN.slice(WAVE3_BASE_CHAIN.length, POST_CERT_START);
/** Governed migrations after the F01-F13 certification point. They are still part of FULL_CHAIN. */
export const POST_CERT_CHAIN = ADDITIVE_CHAIN.slice(POST_CERT_START);

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
