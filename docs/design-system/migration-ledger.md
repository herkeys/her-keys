# Her Keys — Front-End Inheritance & Migration Ledger

Living artifact of HK-FE-UI-01. Resumable: a STOP must leave this file honest
about what has and has not migrated. Statuses: NOT-STARTED · PENDING ·
MIGRATED · PRESERVED · DROPPED-WITH-REASON.

Classification of every existing route/screen/shared component/token group /
interaction primitive: PRESERVE / REFINE / REPLACE.

Rules honored: every REFINE/REPLACE cites file, evidence, issue; every REPLACE
states its allowed reason and whether REFINE could achieve the same outcome.
No REPLACE is used where REFINE suffices.

## A. Token groups (`src/design/tokens.ts`)

| Token group | Class | Evidence | Issue / action |
|---|---|---|---|
| `colors.background` #F7F5F1 (warm ivory) | **PRESERVE** | tokens.ts:11 | Already the approved paper foundation. |
| `colors.surface` #FFFFFF / `surfaceSubtle` #F0EBE2 | **PRESERVE** | tokens.ts:13-15 | Correct lifted/quiet surface pair. |
| `colors.border` / `borderSubtle` | **PRESERVE** | tokens.ts:17-18 | Hairline discipline already matches direction. |
| `colors.textPrimary` #1F1E1B (near-black ink) | **PRESERVE** | tokens.ts:20 | Approved strong dark ink. |
| `colors.textSecondary` #5F5C54, `textTertiary` #6B6659 | **REFINE** | tokens.ts:21-22 | Roles map to text.secondary/text.muted but tertiary (#6B6659 on #F7F5F1 ≈ 4.6:1) sits at the AA floor and is used for small metadata; re-measure and revalue as one muted ramp with verified ratios. |
| `colors.accent` #35594F sage + `accentSoft`/`accentBorder` | **REFINE** | tokens.ts:26-28 | Sage is the dominant action color app-wide; approved direction explicitly avoids a sage-dominant identity and names a restrained clay/terracotta accent instead. The *semantic role* (Her Keys' own voice: primary action) is correct — revalue the family, keep every consumer untouched. REFINE achieves this; REPLACE would not. |
| `colors.attention` #6E4C0E amber family | **REFINE** | tokens.ts:31-33 | Role ("something needs a decision", deliberately not red) is right and matches calm-does-not-mean-vague. Revalue within the grounded warm family after contrast measurement; add `status.risk` and `status.waiting` companions the approved status set requires. |
| `colors.success` #2F5147 | **REFINE** | tokens.ts:36-38 | Reads as a second sage — distinguish success from the (revalued) accent family so settled state and Her Keys' voice never collide. |
| `colors.track` #E6E0D5 | **PRESERVE** | tokens.ts:41 | Unfilled segment track; not a text surface. |
| (missing) focus/pressed/disabled tokens, opacity states | **REFINE** (add) | tokens.ts has none | Pressed = ad-hoc `opacity: 0.75` in Button/ChipToggle; disabled = `opacity: 0.35` (fails AA). Canonicalize interaction states as tokens. |
| (missing) `status.risk`, `status.waiting`, AI semantic colors | **REFINE** (add) | tokens.ts has none | Approved semantic sets (status.attention/risk/success/waiting, ai.insight/inference/confirmation/action) need tokens before K3's intelligence presentation. |
| `spacing` (9 steps) | **PRESERVE** | tokens.ts:44-54 | Scale is disciplined; kept 1:1. |
| `radius` (6 steps + pill) | **PRESERVE** | tokens.ts:56-63 | Used with restraint (md cards/chips, lg surfaces, pill buttons); not "rounded-everything". |
| `typography` (9 variants) | **REFINE** | tokens.ts:65-76 | Remap variant names to the permanent hierarchy (display/screenTitle/sectionTitle/cardTitle/body/supporting/metadata/label/actionLabel/statusLabel); values largely survive; add the missing label/action/status rungs. No custom font (loading/licensing complexity not justified). |
| `elevation.raised` | **PRESERVE** | tokens.ts:79-86 | One soft elevation reserved for the dominant surface — matches restraint direction. |

## B. Shared primitives (`src/design/components/`)

| Component | Class | Status |
|---|---|---|
| `Screen` | REFINE | **MIGRATED** (K2): bottom-inset-aware clearance, keyboard-safe taps, non-scroll variant |
| `AppText` / `Overline` | REFINE | **MIGRATED** (K1/K2): canonical rungs + legacy aliases, semantic label color |
| `Button` | REFINE | **MIGRATED** (K2): disabled is a real color pair (no opacity), ghost stays transparent when disabled, touch floors from sizing tokens |
| `Card` | REFINE | **MIGRATED** (K2): tones re-keyed to semantic status families |
| `ChipToggle` | REFINE | **MIGRATED** (K2): semantic action tokens, pressed opacity token |
| `SegmentBar` | PRESERVE | **PRESERVED** (re-valued through tokens) |
| `StatusList` | PRESERVE | **PRESERVED** (+ optional style prop, K2) |
| `Tag` | REFINE | **MIGRATED** (K2): tones re-keyed to semantic families |
| `TextField` | REFINE | **MIGRATED** (K2): control-identifying border (3:1), explicit focus state, editable=false declared state |
| `Divider` | PRESERVE | PRESERVED |
| `LoadingState` / `EmptyState` / `ErrorState` / `OfflineState` / `InlineNotice` | (new, §11 SYSTEM STATES) | **MIGRATED** (K2): text-first states; InlineNotice derives treatment from a fixed tone union |
| `Sheet` / `ConfirmationSheet` | (new, §11 OVERLAYS) | **MIGRATED** (K2): scrim dismiss + close control, both confirmation paths explicitly labeled |
| `InsightBlock` / `RecommendationBlock` / `WhyThis` / `ClarificationPrompt` / `InterpretationReview` / `ConfidenceBadge` / `ProvenanceLabel` / `ActionStateBlock` | (new, §15 INTELLIGENCE) | **MIGRATED** (K3): one application-wide intelligence language; every treatment traces to frozen domain semantics ([ai-traceability](ai-traceability.md)); `Card` gains the `risk` tone the failed-action state requires |

## C. Shell / navigation

| Item | Class | Evidence | Issue / action |
|---|---|---|---|
| Root stack + access guards | **PRESERVE** | app/_layout.tsx | Routing is domain authority (`routeAccess.ts`); not visual; untouched. |
| Five-tab structure & names | **PRESERVE** | app/(app)/_layout.tsx | Matches expected product areas exactly. |
| Text-only tab treatment | **REFINE** | app/(app)/_layout.tsx | Decision (no icon set bundled) is sound; typography/active-state/height re-keyed to tokens; keep text-only. |
| Modal presentations (talk-it-out, editors, sign-in) | **PRESERVE** concept | app/_layout.tsx:95-103 | Sheet/modal conventions refined in K2 as shared primitives; route wiring untouched. |
| `OnboardingScaffold` | **REFINE** | OnboardingScaffold.tsx | Correct scaffold (progress + hero + content + single action); progress bar + typography re-keyed; continue-action hierarchy kept. |

## D. Screens

| Screen | Class | Status |
|---|---|---|
| Today (`app/(app)/today.tsx` + today features) | **REFINE** | **MIGRATED** (K4): full surface already consumed the permanent primitives; K4 finished the migration — canonical type rungs on the header, `LoadMeter` capacity segments neutral ink with amber label only for tight/full (owner decision 4), One Move renders in the K3 intelligence language (RecommendationBlock + WhyThis; withheld = selective InsightBlock; completed = her decision, success tone), Daily Load evidence unified through `WhyThis`, ad-hoc pressed opacities replaced by the `interaction.pressedOpacity` token |
| Talk It Out (`app/talk-it-out.tsx`, ai tab, TalkItOutView) | **REFINE** | **MIGRATED** (K5): canonical type rungs; result confidence renders the typed `ConfidenceLevel` the engine now attaches (`possible`) through `ConfidenceBadge` — the free-form display string no longer drives a clay Tag, so no confidence tier outside possible/likely/established can appear; evidence unified through `WhyThis`; clarify/next-step keep the clay accent as the conversation's decisive interaction moments; composer touch floors + pressed opacity + input type from tokens |
| Onboarding surface — chosen route **`/onboarding/goals`** (most comprehensively exercises inputs/selectable controls/action hierarchy; recorded here per section 17 before any edit) | **REFINE** | **MIGRATED** (K6): shared scaffold to canonical rungs (display title, supporting description, statusLabel step counter); step progress deliberately keeps the clay accent — it is path navigation, not a capacity/state visualization (owner decision 4); goals chips gain the standard spacing gap; selectable controls already render the approved solid-clay selected state (owner decision 3); continue action is a real disabled state until a selection exists |
| Life (`app/(app)/life/index.tsx` + lists) | **REFINE** (migrates K7) | NOT-STARTED |
| Calendar, Systems, Kids/Meals/Money/Home/Work/Needs Me/Other, editors, sign-in, account-conflict, welcome, plus | **PRESERVE** (frozen until their feature builds) | PRESERVED |
| dev-tools | **PRESERVE** (development surface; not product UI) | PRESERVED |

## E. REPLACE log

**No component or screen is classified REPLACE.** The one candidate — the sage
accent family — is a token revalue (REFINE), because the component architecture
consuming it is structurally sound; replacing components to change a color
would be replacement merely preferred, which the build rules forbid. No
prototype-only, duplicated, or structurally weak front-end element was found:
the existing system is small, single-sourced through `tokens.ts`, and has no
duplicate primitives (verified: no raw hex outside tokens, one primitive per
role).

## F. Test accounting

- Tests before this build: 705 app tests, 0 component tests.
- After K1: 763 (+58 contrast-matrix tests).
- After K2: 790 (+27 primitive contract tests: render + props, disabled/
  selected/pressed, accessibility role/state, semantic treatments derived from
  allowed input unions).
- Removed: none.
- Component test floor: `react-test-renderer@19.2.3` (exact React match) +
  `esbuild` (dev-only). Justified per section 26: node --test cannot mount RN
  component trees (JSX + Flow sources), the test floor is mandatory, and both
  are zero runtime cost. Real RN sources are NOT executed in tests — a typed
  stub renders the tree and tests assert the props contract; layout and visual
  output are verified in the running app (gallery + screenshots). Honest
  scope, recorded here.
