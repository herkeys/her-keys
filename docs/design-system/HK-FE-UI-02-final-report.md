# HK-FE-UI-02 — final implementation report

Dusty Mauve + Luxury Black, Airy Edition. Three stacked draft PRs, **none merged, nothing built or deployed.**

## A. Source authority

| | |
|---|---|
| ENTRY_SHA | `ccdcffcf2da254deb4c80e62d8839016fa3ebca1` (verified equal to the remote tip of `repair/v2-production-premium-rollout-readiness-20261016`) |
| Phase 1 | `design/hk-fe-ui-02-foundation` — PR [#27](https://github.com/herkeys/her-keys/pull/27) (draft, base = the pinned branch) |
| Phase 2 | `design/hk-fe-ui-02-core` — PR [#28](https://github.com/herkeys/her-keys/pull/28) (draft, base = Phase 1) |
| Phase 3 | `design/hk-fe-ui-02-premium` — PR [#29](https://github.com/herkeys/her-keys/pull/29) (draft, base = Phase 2) |
| FINAL_SHA | the head of `design/hk-fe-ui-02-premium` (recorded on PR #29) |
| INTEGRATED_DESIGN_BASELINE | the pinned branch (14 commits ahead of the Welcome Tree candidate `ae742a3`, which it contains) |
| REVENUECAT_REPAIR_INTEGRATION_STATUS | **Not integrated, by design.** `integration/premium-paywall-layout-20261015` @ `8cb841c` is not an ancestor of the baseline; it stays a separate dependency owned by the V2 integration manager. No RevenueCat runtime code was cherry-picked or edited. |

**Merge order:** #27 → #28 → #29, each into the previous branch; only the integration manager merges #27 into the V2 line.

## B. What was built

**Tokens** (`src/design/tokens.ts`): the six owner-approved brand colours (pinned by test); documented derived tokens (lilac wash, Berry
pressed/onSoft/highlight, text secondary/muted, control border, disabled pair, scrim, info/pending/risk/success/amber soft fills);
`color.luxury.*`; `color.botanical.*` (owner amendment A1); decoration budget; button elevation; typography weights 600 (system font kept).
**Primitives:** primary-button recipe, focus ring, `Tag` (lilac-legal), `InlineNotice` with icons and a non-AI info tone, `Sheet` scrim,
`TabIcon` selected pill, `Card`/`TextField`/`ChipToggle` via tokens. **AI language:** `AiMark` + dashed/solid/amber/moss structure on every
intelligence component. **Assets (original, View-built, no dependency):** `BotanicalSprig` (sage linework), `CurvedWave`, `IconBadge`,
`KeyBadge`, `PremiumBadge`. **Screens:** Welcome, Premium introduction, account choice, email/password/OTP/recovery, state views,
consent, permissions, the four audit steps, Life Operating Profile, final-step badge; the core app by token plus the tab pill; the
three Stage 1 Premium surfaces + Premium Home + capture review. **Docs:** spec, asset register, impact inventory, three phase reports,
contrast matrix, supersession notes. **Tooling:** contrast matrix generator, impact inventory, lane registrar, rendered-contrast audit,
evidence harnesses.

### Owner amendment A1 (palette-lock exception)
The owner expressly lifted the lock for sage botanical linework (outline 50% / tip 60% / whisper 20%, 30% under Reduce Motion, linework
only, never on controls, cards, headers or navigation). Implemented and **contained by a test** (`botanicalBoundary.test.mjs`). The owner
gave names and opacities, **not hex values**: `#7E9C86 / #5F8A6B / #A8C3AE` are the agent's choice and **need owner confirmation
(OD-UI02-05)**. `Sage Whisper` is defined and unused.

## C. Accessibility

- **Token matrix:** every listed text pairing ≥ 4.5:1 (no large-text exemption); component boundaries ≥ 3:1; pinned owner measurements
  (Berry/off-white 5.10, Mauve/off-white 2.08, Deep Plum/off-white 9.18, Berry/Lilac 4.16); `contrast-matrix.md` is generated from the
  same list the CI gate uses.
- **Rendered audit:** `node scripts-dev/ui02-contrast-audit.mjs` — **65 test processes, 1,184 renders, 13,207 text/icon samples, 0
  failures**, measuring each against the background actually behind it (the Premium panels included, audited before unmount).
  Limits: final state of each render only; translucent layers skipped; the disabled pair is the documented exemption. The audit is
  itself tested.
- **State is never colour alone:** every `InlineNotice` tone has an icon; every AI register has a text label *and* a shape mark; the tab
  selection has a pill; disabled is a readable pair.
- Decoration is hidden from assistive technology, touch-transparent, and absent below 360 dp or above 1.3× text.
- **Known exceptions / gaps:** Dusty Mauve borders on secondary buttons and cards are decorative (the 4.5:1 label identifies the
  control); not verified with a screen reader on a device; reduced-transparency has no gradient or translucent layer to degrade (the
  scrim is the one translucent layer); platform high-contrast is not wired (no portable RN API).

## D. Functional safety

`FUNCTIONAL_LOGIC_MODIFIED=NO`. No file under `src/domain`, `src/platform`, `src/persistence`, `src/store`, `src/monetization`, `supabase/`,
`app/_layout.tsx`, `app.json`, `package.json` or `package-lock.json` changed. Consent/AI-processing/permission copy and the four consent
receipts are byte-locked to the baseline by test. Presentation-only extractions: `ConsentViews.tsx` (gate unchanged), `HeaderBadge`. Two
source-pin tests that read `ConsentFlow.tsx` now read the pair. The Welcome tree still contains no hex colour and no purchase reference.

## E. CI / tests

| | Entry SHA | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| tests | 4,829 | 4,889 | 4,900 | 4,906 |
| pass | 4,818 | 4,878 | 4,889 | 4,895 |
| fail | 11 | 11 | 11 | 11 |

- `tsc --noEmit`: 0 · release identity: PASS · `expo-doctor` 21/21 (Phase 1) · contrast matrix generator: all pass.
- **Inherited failures (11, identical set at every phase, present at the entry SHA):** 8 account-deletion (GitHub issue #9): real SQL state/
  privileges/recovery/purge; all-43-resources isolation ×3; approved shared policy; complete database cleanup; critical lifecycle negative
  controls; purged-requires-Auth-absence. 3 `premiumHome`: purchase interface opens once then waits for the server; cancelling the purchase
  changes nothing and says so; no offering and an SDK error are calm and recoverable (they assert purchase copy the baseline does not render;
  owned by the integration manager).
- **Newly introduced failures: 0.** **Phase 3 note:** the *first* Phase 3 full run also reported two *timing* tests in `calendarPerformance.test.mjs`
  ("measured on dense reference fixtures", "single-day projection … 50 ms") under host memory pressure; the file passed 6/6 twice in
  isolation, no calendar or domain file changed, and the **clean full rerun (4,906 tests, 4,895 pass, 11 fail) shows the failing set identical to the entry SHA**. Recorded as a flake, not hidden.
- **Exact-SHA CI on the three PRs: pending** (GitHub). **Tests not run:** native/device suites; iOS anything; a real store purchase.

## F. Evidence (`docs/design-system/evidence/hk-fe-ui-02/`)

56 source-rendered Android captures in three sets (`android-emulator-expo-go/` 30, `phase2/` 18, `phase3/` 8), each with a manifest/report
stating environment, viewport, and what was *not* captured. All are Expo Go 57.0.9 on a software-GPU emulator — **not** native builds, and
**no timing or frame-rate claim** is made. Harness recipes are committed under `scripts-dev/ui02-evidence/` (temporary stubs for
`expo-router` and `expo-notifications` are *never* committed to the app).

## G. Dispositions

```
HK_FE_UI_02_CONTRACT=PASS                  SOURCE_AUTHORITY=PASS
DESIGN_IMPACT_INVENTORY=COMPLETE           TOKEN_SYSTEM=PASS
SEMANTIC_STATE_MAPPING=PASS                AI_TRUTH_SEMANTICS_PRESERVED=PASS
ACCESSIBILITY_CONTRAST=PASS                RESPONSIVE_LAYOUT_CHECKS=PASS (decoration budget, scrolling bodies; 320dp captures for 3 screens)
WELCOME_TREE_SOURCE_MIGRATION=PASS         CONSENT_AND_PERMISSIONS_PRESENTATION=PASS
LIFE_SYSTEMS_AUDIT_PRESENTATION=PASS       CORE_APP_SOURCE_MIGRATION=PASS
PREMIUM_SOURCE_MIGRATION=PASS              FUNCTIONAL_REGRESSION_CHECKS=PASS (no new failures; 11 inherited)
EXACT_SHA_CI=PENDING                       VISUAL_EVIDENCE_PACKAGE=INCOMPLETE (see H)
ANDROID_NATIVE_VISUAL_CERTIFICATION=NOT_RUN
IOS_NATIVE_VISUAL_CERTIFICATION=NOT_RUN
READY_FOR_OWNER_VISUAL_REVIEW=YES
READY_FOR_V2_SOURCE_INTEGRATION=YES, after exact-SHA CI is green and the integration manager reconciles the RevenueCat repair branch
READY_FOR_NEW_INTERNAL_EAS_BUILD=YES for a design-candidate build, by the owner's separate authorisation (none was started)
READY_FOR_PRODUCTION_RELEASE=NO
```

Subjective qualities — **owner approval is requested, not self-certified:** brightness/airiness, femininity, luxury, warmth, and whether the
sage linework (A1) at its chosen hexes and weight reads as intended.

## H. Remaining issues

| Issue | Class |
|---|---|
| **Life Operating Profile with insights** and the **final Premium decision** screen: appearance unverified (profile captured only in its empty state; final step not rendered) — *visual verification pending* | Native-device verification |
| Premium **review sheets** (Daily Load proposals, Momentum patterns/next step), capture review cards, Premium Home attention/expired states, confirmation sheets, Your Account/Settings: structural tests only | Native-device verification |
| iOS rendering of everything; native Android build; dark-system-preference and native splash black→light transition | Native-device verification / Product-owner decision (OD-UI02-03) |
| Sage hex values `#7E9C86 / #5F8A6B / #A8C3AE` and `Sage Whisper` use | Product-owner decision (OD-UI02-05) |
| Custom display serif; true Bézier botanicals (need an SVG library) | Product-owner decisions (OD-UI02-01, -02) |
| Pinker cream for the "needs you" amber cards | Product-owner decision (OD-UI02-06) |
| 3 `premiumHome` + 8 account-deletion inherited failures; RevenueCat repair branch integration | Integration blocker / RevenueCat dependency |
| Catalogue prices, introductory trial terms, live store products: none shown or hard-coded | RevenueCat/store dependency |
| Compact (<360 dp) consent capture not obtained | Visual defect check pending |
| Two `calendarPerformance` timing tests flaked once under memory pressure | Environment |
| Public release | Public-release blocker (not authorised) |
