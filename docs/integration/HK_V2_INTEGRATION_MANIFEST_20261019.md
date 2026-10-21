# Shared integration manifest — October 19, 2026

| Field | Exact value |
|---|---|
| Repository | `herkeys/her-keys` |
| Repair branch | `repair/v2-shared-defect-closeout-20261019` |
| Base / merge base | `559e50cdc99e7858b2b259f330a0fe2f8aa87513` |
| Final executable repair SHA | `c66caeccc72951d46470eef8eb94fb8fe388f239` |
| Draft PR | [#38](https://github.com/herkeys/her-keys/pull/38) |
| PR target | `repair/v2-ai-reporting-and-prod-convergence-20261017` (PR #35) |
| Final documentation-inclusive SHA | PR #38 `headRefOid`, pinned verbatim in its final machine-readable integration report after this evidence commit is pushed |
| Source exact-SHA CI | [39213517785](https://github.com/herkeys/her-keys/actions/runs/39213517785): 5,193 / 5,185 pass / 8 inherited failures; all other gates PASS |
| Latest exact-head CI | Use the direct run URL in PR #38's final report; require `headSha == headRefOid` |
| Backend migrations / staging deployments | NONE / NONE |
| Production promotions authorized or performed | NONE |
| New test regressions / confirmed shared repairs remaining | 0 / 0 |

A commit cannot embed its own full SHA. This manifest pins the immutable executable repair; PR #38's final report pins the subsequent documentation-inclusive head and direct exact-head Actions run. Resolve both before integration:

```powershell
git fetch origin --prune
gh pr view 38 --json isDraft,headRefOid,baseRefName,url
git rev-parse origin/repair/v2-shared-defect-closeout-20261019
gh run list --branch repair/v2-shared-defect-closeout-20261019 --limit 5 --json headSha,url,status,conclusion
```

## Executable/source changed files

```text
.github/workflows/v2-integration-validation.yml
scripts-dev/meals-boundary-scan.cjs
src/features/ai-safety/AiReportPanel.tsx
src/features/momentum/premium/momentumFlow.ts
src/monetization/PremiumStateProvider.tsx
src/monetization/premiumLedgerClient.ts
src/monetization/premiumRequestOwner.ts
src/monetization/premiumServerClient.ts
src/monetization/premiumTypes.ts
tests/aiReportPanelRuntime.test.mjs
tests/premium/clientProvider.test.mjs
tests/premium/transportAccountBoundary.test.mjs
tests/premiumDomain/momentumFlow.test.mjs
tests/premiumCheckoutSwitch.test.mjs
tests/premiumHome/home.test.mjs
```

Documentation/evidence additions: the four `HK_V2_*_20261019.md` integration documents and `docs/integration/evidence/shared-closeout-20261019/{live-readback.json,negative-probes.json,premium-home-entry-0.txt,premium-home-entry-1.txt,premium-home-entry-2.txt,report-before.txt,transport-before.txt,momentum-limit-before.txt,calendar-recheck.txt,focused-final.txt,full-comparison.txt,executable-ci.json,executable-ci-summary.txt}`. Use `git diff --name-only 559e50cdc99e7858b2b259f330a0fe2f8aa87513 <final-head>` for the authoritative complete path set.

## Dependencies and deterministic convergence

1. Fetch and compare the nominated exact refs. Confirm PR #32 `d775b1fadea6e4d5b1da4a8e81738f539231a5e5`, #34 `23c5c279796d11ed37fe3c977d40112d3aa995bf` and #35 `559e50cdc99e7858b2b259f330a0fe2f8aa87513` are retained. They are ancestors here, not changes to import again wholesale. If any base advances, inspect its delta and repeat validation before deciding order; do not reset another worktree.
2. Build Manager chooses integration order for the reviewed stack: PR #32 → #34 → #35 → #38, respecting their existing earlier dependencies. Compare each exact diff; do not merge overlapping historical branches wholesale. No merge was performed during this sprint.
3. iOS owner separately reviews PR #37 at `3bbc68b590c1ba160c2cb0e96e3488d873984c9d`, based on the same #35 SHA. Its `app.json`/native-test changes do not overlap this repair's executable path set. Build Manager integrates that sibling and verifies resolved identities/purpose copy; this sprint does not authorize that merge.
4. On the actual converged Build 2 checkout, run `npm ci`, TypeScript, backend boundary, full tests, launch contracts, release identity, Expo install compatibility, Doctor and resolved public/introspect config using the existing workflow. Require exact pushed-head evidence. Preserve all eight independent inherited failures until their separate owner repairs them; never waive the suite.
5. Re-read backend state against `live-readback.json`; preserve checkout OFF and mandatory consent. No new backend artifact or migration is required for these shared fixes. Backend owner records inherited deployed-helper/environment differences before any independently approved promotion. Reporting migrations are already installed.
6. Complete the eight platform/external handoffs, confirm operational reviewer/privacy decisions, and obtain separate Build Manager build authorization and approved branch/provenance. This repair branch is not release-allowlisted. Do not start EAS from this manifest.

No platform files, account-deletion source/tests/fixtures/registry, `app.json`, package/lockfile or release identity script differ from the base. There are no new dependency or lockfile conflicts. The only safety-scanner/config changes are exact path ownership reasons and enabling the existing validation-only workflow on the requested repair branch.
