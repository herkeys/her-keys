# Her Keys V2 user journeys — Checkpoint 2 source integration evidence

Date: 2026-10-14. Branch `codex/v2-premium-pass-a`. Evidence classification: **SOURCE_VALIDATED** only. Full feature certification waits for Checkpoint 3 approval; hosted/native evidence is BLOCKED/NOT RUN. No release PASS is awarded here.

| Journey / integration obligation | Source | Staging | Device | Evidence producer / environment |
|---|---|---|---|---|
| Welcome → Free/Premium intent → account → consent → checkout/application | PASS | BLOCKED | NOT RUN | tests/welcomePremiumFlow.test.mjs + mandatory-consent source guard, local |
| Account A→B, same household; no prior snapshot/open sheet | PASS after P0 repair | BLOCKED | NOT RUN | tests/premium/clientProvider.test.mjs every-render observer, local |
| A→B→A with old pending ledger callback | PASS; old record/transition/list calls refused | BLOCKED | NOT RUN | same-household replay test in clientProvider, local |
| Pending deletion cannot initiate computation, purchase or writes before rerender | PASS | BLOCKED | NOT RUN | clientProvider lifecycle-fence test; root guard reads live account/deletion runtime, local |
| Restored A with paid SDK hint waits for a fresh server answer | PASS | BLOCKED | NOT RUN | clientProvider restored-account regression, local |
| Settings/Your Account → Privacy & Data → Back | PASS | BLOCKED | NOT RUN | tests/platformParity/persistentRestore.test.mjs rendered account screen, local |
| Exactly one custom Restore Purchases control; deletion/sign-out/done held while restoring | PASS | BLOCKED | NOT RUN | persistentRestore + restoreControl; onboarding routes to Account rather than mounting another restore transaction, local |
| Anonymous/mismatched/failed SDK identity, restore during account switch | PASS | BLOCKED | NOT RUN | tests/platformParity/restoreIdentity.test.mjs, local scripted native SDK |
| Saved Daily Load receipts / Momentum reviews after expiry | PASS for inherited source behavior under new account fence | BLOCKED | NOT RUN | tests/premiumDomain/dailyLoadUi.test.mjs + momentumUi.test.mjs, local durable store/scripted server |
| Free behavior during Premium backend outage | PASS for tested source fallback | BLOCKED | NOT RUN | clientProvider outage test + existing consumer suite; deletion lifecycle status failure remains separately fail closed, local |
| Permanent account deletion across new Premium resources | FAIL / BLOCKED | BLOCKED | NOT RUN | existing accountDeletion SQL tests fail unclassified_resource; deletion owner #9, local PGlite |
| Village / Co-Parent Plus | BLOCKED | BLOCKED | NOT RUN | approved design contracts and backend handoff #11; no implemented shared-account service/UI |

## Exact source producers

At `7eb6592348422dd54e6b3b5d3377c03b75694078`, local Node 24.14.0: **137 tests / 15 suites / 137 pass / 0 fail / 0 skipped**. Output `v2-premium-pass-a-checkpoint2/client-integration-7eb6592.txt`.

```powershell
node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test tests/premium/clientProvider.test.mjs tests/platformParity/restoreIdentity.test.mjs tests/platformParity/persistentRestore.test.mjs tests/platformParity/restoreControl.test.mjs tests/premiumFeedback.test.mjs tests/welcomePremiumFlow.test.mjs tests/premiumDomain/dailyLoadUi.test.mjs tests/premiumDomain/momentumUi.test.mjs tests/consentRecovery.test.mjs tests/migrationChain.test.mjs
```

At guard-repair source `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17`: **77/77, no skips**, output `v2-premium-pass-a-checkpoint2/guard-repairs-420365a.txt`, local.

```powershell
node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test tests/productionConsentBuildProfile.test.mjs tests/premium/clientState.test.mjs tests/ios/keyboardInsets.test.mjs tests/meals/boundary.test.mjs tests/premiumFeedback.test.mjs
```

The first developing full suite reported 4,655 tests, 4,642 pass and 13 failures (no skipped tests). It ran while the working tree was being repaired, so it is **developmental failure evidence, not exact-SHA certification**. All failures are retained and assigned: new-resource deletion (#9), missing input insets (fixed), CRLF contract scanner (fixed), exact lane accounting (fixed), conditional-consent source assertion (strengthened), and a timing-sensitive existing calendar growth assertion under concurrent local load (not weakened). The final stable SHA must rerun the entire mandatory workflow.

No real subscriber purchase, provider output, webhook, email receipt or hosted database persistence was tested here. Daily Load, Smart Inbox and Momentum end-to-end feature verdicts remain BLOCKED pending the later authorized source lane and hosted readiness. Do not infer real model accuracy from the authored corpus, or savings/performance conclusions from Momentum.
