/**
 * Every structural-evidence artifact a Feature 04 scenario is expected to produce.
 *
 * The manifest is the second half of the regeneration check: each scenario compares its regenerated
 * evidence with the committed file (a mismatch fails), and `evidence.manifest.test.mjs` fails if a
 * committed file exists that no scenario owns, or a scenario's file is missing. Evidence therefore
 * cannot drift away from behavior, and dead evidence cannot linger.
 */
export const EVIDENCE_MANIFEST = [
  'A-empty',
  'AB-loading',
  'AC-recovery',
  'AD-large-system',
  'AE-not-applicable',
  'AF-execution-claims',
  'AH-hub-ordering',
  'F-recurrence-weekly',
  'L-no-recurrence',
  'N-template-not-run',
  'R-recurrence-timezone',
  'S-dst',
  'T-unknown-duration',
  'U-dependency',
].sort();
