# HK-FE-UI-02 — Phase 1 implementation report (foundation + Welcome tree + onboarding)

## A. Source authority

| Field | Value |
|---|---|
| ENTRY_SHA | `ccdcffcf2da254deb4c80e62d8839016fa3ebca1` (equals `origin/repair/v2-production-premium-rollout-readiness-20261016` at fetch) |
| BRANCH | `design/hk-fe-ui-02-foundation` |
| Phase 1 FINAL_SHA | recorded in the PR description (the commit that carries this file) |
| INTEGRATED_DESIGN_BASELINE | the pinned branch above (14 commits ahead of `candidate/welcome-tree-premium-android-internal-20261016` @ `ae742a3`, which it contains) |
| REVENUECAT_REPAIR_INTEGRATION_STATUS | **Not integrated, by design.** `integration/premium-paywall-layout-20261015` @ `8cb841c` is verified *not* an ancestor of the baseline; it remains a separate dependency owned by the V2 integration manager. No RevenueCat runtime change was cherry-picked. |

Owner visual approval of the Phase 1 direction and images was received; it is an approval of the aesthetic, not a certification of
the screenshots or an exception to functional testing.

## B. Commits

| Commit | Content |
|---|---|
| D00 `2b7618d` | Source authority, impact inventory + generator |
| D01 | Token contract; contrast pair list/generator/tests (4.5:1 for every pairing, owner measurements pinned) |
| D02 | Button recipe, Tag, Sheet, TextField, InlineNotice, shape-coded AI language |
| D03 | View-built botanical/wave/badge assets + tests |
| D04 | Welcome, Premium introduction, auth steps, state presentations |
| D05 | Consent/permissions, Life Operating Profile, final Premium step badge, lilac-legal labels |
| D05b | Consent view extraction, evidence harness, gallery scenes |
| D05c | Compact-width scroll fix, `ConsentViews.tsx`, spec/asset register/supersession |
| D09 | 30 evidence captures + manifest, capture recipe, boundary-scan lane |

## C. Phase-one disposition

```
HK_FE_UI_02_FOUNDATION=PASS
WELCOME_TREE_PRESENTATION=PASS (source + 30 Android emulator captures; native device NOT RUN)
ONBOARDING_PRESENTATION=PASS for goals/strengths/struggles/Talk It Out introduction (captured);
                         Life Operating Profile and final Premium decision = STRUCTURAL ONLY, VISUAL VERIFICATION PENDING
SEMANTIC_TOKEN_CONTRACTS=PASS
CONTRAST=PASS (every listed pairing >= 4.5:1; boundaries >= 3:1)
SOURCE_REGRESSIONS=PASS (no new failures vs the entry SHA)
VISUAL_EVIDENCE=INCOMPLETE (see manifest: 2 screens, iOS, native builds, compact consent not captured)
READY_FOR_OWNER_VISUAL_REVIEW=YES (already approved)
FUNCTIONAL_LOGIC_MODIFIED=NO
```

## D. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `verify:release-identity` | `RELEASE_IDENTITY=PASS` (versionCode 2, buildNumber 2 unchanged) |
| `expo-doctor` | 21/21 checks passed |
| Contrast matrix | regenerated, `allPass = true`; `tests/design-system/contrast.test.mjs` green |
| Full app suite (`npm test`) at Phase 1 close | **4889 tests, 4878 pass, 11 fail** |
| Entry SHA suite (baseline, same machine) | 4829 tests, 4818 pass, 11 fail |
| New failures | **none** — the failing set is byte-identical to the baseline set |
| Added tests | +60 (AI-truth semantics, decoration budget, button recipe, legal-copy lock, palette contract) |
| Boundary scan (`tests/meals/boundary.test.mjs`) | green after the design lane was registered by `scripts-dev/ui02-register-lane.mjs` (the first full run failed it: unregistered changed files) |
| Dependencies | `package.json` / `package-lock.json` unchanged |
| Exact-SHA CI | pending on the PR (draft) |

### Inherited failures (present at the entry SHA, not caused by this workstream)

**Account deletion — 8 (GitHub issue #9, shared Docker DB / SQL lifecycle):**
1. `account deletion: real SQL state, privileges, recovery and purge`
2. `all 43 registered resources: former_member and unrelated isolation`
3. `all 43 registered resources: shared and unrelated isolation`
4. `all 43 registered resources: single and unrelated isolation`
5. `approved shared policy deletes private records, restricts ambiguous records and preserves the other adult`
6. `complete database cleanup preserves the other account`
7. `critical lifecycle negative controls detect unsafe guard mutations`
8. `purged requires Auth absence and independent resource evidence`

**`premiumHome` — 3 (under the `buying` suite, which node:test also reports as failed):**
1. `See Her Keys Premium opens the store purchase interface once, then waits for the SERVER before claiming anything`
2. `cancelling the purchase changes nothing and says so`
3. `no offering and an SDK error are calm and recoverable`

They assert purchase copy ("No purchase was made", "isn't available to purchase right now") that the baseline's Premium home does not render.
They are RevenueCat/Premium presentation tests owned by the integration manager; **not fixed here** (fixing them would change
purchase-state copy/logic, outside this authority).

Newly introduced failures: **0**. Fixed failures: 0. Tests not run: native/device suites. External verification blockers: RevenueCat repair
branch not integrated; Expo Go 57.0.9 lacks `ExpoTopicSubscriptionModule`.

## E. Functional safety

`FUNCTIONAL_LOGIC_MODIFIED=NO`. No file under `src/domain`, `src/platform`, `src/persistence`, `src/store`, `src/monetization`,
`supabase/`, `app/_layout.tsx` or `app.json` was changed. The two source-pin tests that read `ConsentFlow.tsx`
(`onboardingLayout`, the new legal lock) now read the pair `ConsentFlow.tsx` + `ConsentViews.tsx`: the gate, ledger calls, receipts and
inset computation did not move. All consent, AI-processing and permission sentences and the four receipts are byte-locked against the
baseline (`tests/design-system/legalCopyLock.test.mjs`). The welcome sources still contain no hex literal and no purchase reference.

## F. Findings fixed during Phase 1

1. HK-FE-UI-01's contrast test silently enforced 3:1 for every pairing; replaced by an explicit 4.5:1 matrix.
2. Berry on Soft Lilac (4.16:1) was used for small labels on the onboarding Talk It Out card and the Talk It Out entry; both now use the
   lilac-legal `action.onSoft` (5.54:1).
3. Premium introduction title pushed off a 568 dp screen (found in the 320 dp capture): bodies now scroll.
4. Consent gate had no background of its own (it relied on the root); it now supplies Warm Off-White.

## G. Remaining issues

| Issue | Class |
|---|---|
| Life Operating Profile and final Premium decision appearance unverified on any device | Native-device verification |
| iOS rendering of everything | Native-device verification |
| Dark system preference / native splash black→light transition | Product-owner decision (OD-UI02-03) |
| Paywall catalogue prices/trial copy are not hard-coded anywhere (none shown) | RevenueCat/store dependency |
| View-built botanicals are intentionally simple; a true vector illustration would need an SVG library | Product-owner decision (OD-UI02-02) |
| Custom display typeface | Product-owner decision (OD-UI02-01) |
| `DeleteAccountPanel.tsx` has two `#999` literals (styling only) | Visual defect — Phase 2 |
| Expo Go 57.0.9 cannot mount the real app root | Native-device verification |
