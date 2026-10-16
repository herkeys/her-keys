# HK-FE-UI-02 — Phase 2 report: core Free application

Branch `design/hk-fe-ui-02-core` (stacked on `design/hk-fe-ui-02-foundation`, PR #27). Presentation only.

## What "migrated" means here

A screen is not migrated because its accent colour changed. Phase 2 reviewed every core surface for contrast, density, legibility,
hierarchy, action placement, error-state clarity, responsive behaviour and navigation presentation — by **measurement** (rendered
contrast across every screen the suite renders) and by **looking** (real screens on an emulator).

## Owner amendment A1 (palette-lock exception)

The owner expressly broke the palette lock to add **sage botanical linework**. Implemented as outline-only strokes (50% / 60% / 30%),
contained by a test (`botanicalBoundary.test.mjs`): sage may be read by `Botanical.tsx` only. Hex values are the agent's choice and
await confirmation (OD-UI02-05). See spec §2.5. The six brand colours and every other rule are unchanged.

## Changes (all presentation-only)

| Surface | Change |
|---|---|
| Navigation (`app/(app)/_layout.tsx` consumers, `TabIcon`) | Selected tab sits in a Soft Lilac pill: selection by shape and fill as well as tint. Tint pairs: Berry on white 5.37:1 (labels), inactive muted 6.54:1 |
| Botanicals | Sage linework (A1) |
| Account deletion panel | Two grey `#999` literals → control-border token, surface and text tokens (style attribute only; deletion logic untouched) |
| Everything else in Today, Calendar, Life, Systems, Talk It Out, the Life sub-hubs | **No code change was needed after review**: they were already token-driven and the audit and captures showed no defect |

## Measurement: rendered-contrast audit

`node scripts-dev/ui02-contrast-audit.mjs` wraps `react-test-renderer`, and after every test measures each `Text` and icon against the
opaque background actually behind it in the renderer's **final state**.

| | |
|---|---|
| Test processes that render | 38 |
| Renders audited | 788 |
| Text/icon samples measured | 9,190 |
| Failures | **0** |
| Screens covered by existing tests | Co-parent, Meals, Calendar (day/week/actions/hardening/a11y), Home OS, Kids, Today (guarantees, attention, components, dependencies), Money, Rebuild, People, Life Admin, Welcome shell, the shared components |
| Limits | initial/final state only; translucent layers skipped (counted); disabled pair exempt; Premium feature tests are not included (they use a separate stub loader) — covered in Phase 3 |

The audit is itself tested (`tests/design-system/contrastAudit.test.mjs`: it finds Berry-on-Lilac, uses the nearest opaque background,
exempts the documented disabled pair, skips translucency).

## Evidence: real screens on an Android emulator

`docs/design-system/evidence/hk-fe-ui-02/phase2/` — **18 captures** of the *real* screens running on the *real* demo household,
with the *real* `app/(app)/_layout.tsx` tab bar. Environment: fresh AVD `HerKeys_UI02` (API 37, 3 GB RAM, software GPU), Expo Go 57.0.9,
Metro from the design worktree. The baseline app root cannot mount in this Expo Go (`expo-notifications 57.0.23` needs a native module
Expo Go lacks), so `scripts-dev/ui02-evidence/core/` provides a **temporary** harness: the real stores/providers + inert stubs for
`expo-router` and `expo-notifications`. Account and Premium providers are real but signed-out. Nothing about a screen is mocked.

| # | Capture | Notes |
|---|---|---|
| 01 | Today (real tab bar, pill selected) | attention card, Why-this evidence, estimated load |
| 02 | Life | hub rows, capture card |
| 03 | Calendar | day view, `WHAT I RECOMMEND` + `NEEDS YOUR YES` language in situ |
| 04 | Systems | |
| 05 | Talk It Out | opening prompt and starters |
| 06 | **Life Operating Profile** (real route, real onboarding context) | **Empty-selection state only** — the demo household has no audit answers; the insight list state is not captured |
| 07–14 | Kids, Money, Meals, Home, Work, People, Rebuild, Needs Me | |
| 15–17 | Welcome and Premium introduction **with sage botanicals**; asset sheet | supersede the Phase 1 mauve-sprig captures of the same screens |
| 18 | Shared component states | |

Captures were checked for OS dialogs and the launcher; two were retaken.

### Not captured / still unverified

- **Final Premium decision** (`app/onboarding/plus.tsx`): still not rendered (hook-heavy, purchase-sequencing source pins).
- Your Account / Settings (needs a bound account), the Life Operating Profile **with** insights, Smart Inbox, Calendar week view,
  scrolled/long-content states, error and offline states in situ, compact-width captures of core screens.
- **iOS and native Android builds: not run.** `ANDROID_NATIVE_VISUAL_CERTIFICATION=NOT_RUN`, `IOS_NATIVE_VISUAL_CERTIFICATION=NOT_RUN`.

## Observations (not defects) for the owner

- The "needs you" cards use the retained dark-warm-amber family on a warm cream fill; it reads as a functional caution beside the mauve
  system. A pinker cream is possible without changing text contrast — owner preference (OD-UI02-06).
- The Talk It Out opening bubble and replies carry no AI register mark (only staged messages have a label); unchanged semantics.

## Verification

See the PR. Phase-2 suite result is recorded in the PR description; the full-suite failure set is compared to the entry SHA.
