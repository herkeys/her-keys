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

| Component | Class | Evidence | Issue / action |
|---|---|---|---|
| `Screen` | **REFINE** | Screen.tsx | Concept (safe area + scroll + margins) correct; add keyboard-aware behavior, bottom-inset handling, optional title treatment, and a non-scroll variant contract for sheets/modals. |
| `AppText` / `Overline` | **REFINE** | AppText.tsx | Keep the typed-text concept; variants remapped to permanent hierarchy; semantic color defaults come from tokens, not call-site hex (already true). |
| `Button` | **REFINE** | Button.tsx:57-68 | Variant model (primary/secondary/ghost) maps to permanent primary/secondary/tertiary + text button. Disabled at opacity 0.35 fails AA — replace with a token-backed disabled state that keeps text ≥4.5:1. Ghost needs a real tertiary treatment (not just transparent). |
| `Card` | **REFINE** | Card.tsx | Tone model survives; tones re-keyed to semantic status tokens; `raised` stays single-surface-only. |
| `ChipToggle` | **REFINE** | ChipToggle.tsx | Selected state inverts to accent bg + inverse text — survives revalue; keep, plus add FilterChip sibling when K2 primitives land (search/filter justified only if ≥2 surfaces consume). |
| `SegmentBar` | **PRESERVE** | SegmentBar.tsx | "About this much, not measurement" rationale is exactly the calm-precision direction; contrast of filled segments re-measured in matrix. |
| `StatusList` | **PRESERVE** | StatusList.tsx | Label/value rows + attention dot (never color-alone) already match the system; visual re-key to tokens only. |
| `Tag` | **REFINE** | Tag.tsx | Tones re-keyed to status/AI semantic tokens; uppercase overline stays for status labels. |
| `TextField` | **REFINE** | TextField.tsx | Solid labeled input; add explicit focus state token and disabled state; error treatment survives. |
| `Divider` | **PRESERVE** | Divider.tsx | Hairline; re-key to border token. |

Primitives the system lacks (created in K2, not replacements — nothing to
classify): IconButton, ListRow/DetailRow/MetadataRow, StatusBadge, ValueDisplay,
LoadingState/Skeleton, EmptyState, ErrorState, OfflineState, InlineNotice,
ConfirmationState, Modal/Sheet/ConfirmationSheet. Each is justified by ≥2
plausible consumers in the candidate families (section 11) and gets a
render/props contract test (section 12).

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
| Today (`app/(app)/today.tsx` + today features) | **REFINE** (migrates K4) | NOT-STARTED |
| Talk It Out (`app/talk-it-out.tsx`, ai tab, TalkItOutView) | **REFINE** (migrates K5) | NOT-STARTED |
| Onboarding surface — chosen route **`/onboarding/goals`** (most comprehensively exercises inputs/selectable controls/action hierarchy; recorded here per section 17 before any edit) | **REFINE** (migrates K6) | NOT-STARTED |
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

- Tests before: 705 app tests, 0 component tests.
- Removed: none (none will be removed without a named reason).
- Component test floor added in K2: render/props contract per canonical
  primitive. Requires `react-test-renderer` — **no renderer exists in the
  current stack** (devDependencies: typescript only; node --test cannot mount
  RN components). Justified per section 26: direct implementation need, existing
  stack cannot satisfy, no runtime cost (dev-only).
