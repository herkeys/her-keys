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
  'AA-demo-isolation',
  'AB-loading',
  'AC-recovery',
  'AD-large-system',
  'AE-not-applicable',
  'AF-execution-claims',
  'AH-hub-ordering',
  'AI-legacy-edit',
  'B-create-simple',
  'C-edit-system',
  'D-steps',
  'E-reorder',
  'F-recurrence-saved',
  'F-recurrence-weekly',
  'H-child-unavailable',
  'I-two-children',
  'J-responsibility',
  'K-unknown-person',
  'L-no-recurrence',
  'M-pause-resume',
  'N-template-not-run',
  'R-recurrence-timezone',
  'S-dst',
  'T-unknown-duration',
  'U-dependency',
  'V-lifecycle-unavailable',
  'Y-stale-editor',
  'Z-restart-unsaved',
].sort();
