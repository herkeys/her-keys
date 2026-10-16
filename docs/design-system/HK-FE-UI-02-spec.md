# HK-FE-UI-02 — Dusty Mauve + Luxury Black, Airy Edition

Status: **Phase 1 (foundation + Welcome tree + onboarding) implemented and submitted for owner visual review.** Phases 2 (core
Free app) and 3 (Premium surfaces) are **not started** — the brief requires the Phase 1 checkpoint to be reviewed first.

Scope is **visual presentation only.** No authentication, RevenueCat, household, persistence, backend, pricing or account-deletion
behaviour is changed anywhere in this specification or its implementation.

## 1. Relationship to HK-FE-UI-01 (Paper and Ink)

**Still valid (preserved verbatim):** canonical token names (`color.*`, flat `colors.*`, `typography`, `spacing`, `radius`,
`sizing`, `elevation`, `interaction`, `motion`); the spacing scale `2/4/8/12/16/20/24/32/40`; the 44 pt touch floor (48 on
Android controls); the system-font decision; the motion budget; "hierarchy by contrast, not borders"; the persistence rule
(no visual token in persisted state, sync payloads, entitlement or schema); the intelligence-component **contracts** (props,
domain bindings, "invent nothing the domain does not store", no chain-of-thought, no invented confidence tier); the `Screen`,
`Sheet`, `TextField` and button-variant structure.

**Superseded:** the palette *values* (clay, ivory, parchment, umber, gold/charcoal brand bridge); "plum is reserved for AI"
(owner decision 2 in `owner-decisions.md`); the `ai.action = clay` family; the contrast-matrix pair list and its effective 3:1
floor; the gold launch-bridge mark on Welcome.

Anything not listed as superseded is unchanged. Wave 2 feature documents under `docs/builds/` that mention clay or Paper-and-Ink
are **historical records and were not rewritten**; see §10.

## 2. Palette

### 2.1 Brand (owner approved, exact)

| Token | Hex | Role |
|---|---|---|
| `brandPalette.berryPlum` → `color.action.primary` | `#A24E7A` | Primary actions, emphasis, focus edge |
| `brandPalette.dustyMauve` → `color.action.primaryBorder`, `color.ai.insightBorder`, botanicals | `#C7A6BB` | Decoration, borders, icon backgrounds — **never ordinary text** |
| `brandPalette.softLilac` → `color.surface.tint`, `color.action.primarySoft` | `#EADFEA` | Selected rows, icon wells, supporting cards |
| `brandPalette.warmOffWhite` → `color.background` | `#FDF8F5` | Application background |
| `brandPalette.deepPlumGray` → `color.text.primary`, `status.info`, `ai.insight`, `neutral.deep` | `#5A3A55` | Headlines, text, icons, navigation |
| `brandPalette.luxuryBlack` → `color.luxury.black` | `#1E1B1D` | Small premium details only |

There is no seventh brand hue. `tests/design-system/contrast.test.mjs` pins the six hexes and asserts that nothing in `color`
falls in the 165°–265° (blue/teal) hue band.

### 2.2 Derived tokens (each has one documented purpose)

| Token | Hex | Purpose | Key measurement |
|---|---|---|---|
| `surface.primary/elevated` | `#FFFFFF` | Lifted card surface | — |
| `surface.secondary` (lilac wash) | `#F6EEF4` | Quiet settled surface | Berry text 4.72:1 |
| `action.primaryPressed` / `action.onSoft` | `#873F65` | Pressed Berry fill; the Berry-family text legal on Soft Lilac | white on it 7.17:1; on Lilac 5.54:1 |
| `action.primaryHighlight` | `#B36E92` | Opaque 1 px top edge of the primary button (Berry 18% toward white) | — |
| `text.secondary` | `#6A4D64` | Supporting text | 6.97:1 off-white, 5.68:1 Lilac |
| `text.muted` | `#6F5669` | Metadata, placeholder, disabled text | 6.20:1 off-white, 5.06:1 Lilac |
| `text.inverse` | `#FFFFFF` | Text on Berry | 5.37:1 |
| `border.control` | `#86627D` | Control boundary | ≥3:1 on white, off-white, Lilac (4.00) |
| `border.default/subtle`, `track` | `#E9DCE6`, `#F1E7EE`, `#E6D8E2` | Decorative hairlines and unfilled tracks | not identifiers |
| `action.disabled` | `#E6DAE3` | Disabled fill (a real, readable pair, not opacity) | text on it 4.83:1 |
| `luxury.rim`, `luxury.glint` | `#3A3538`, `#6B6268` | Lighter rim/glint so a black badge reads as polished | — |
| `luxury.glyph` | `#C7A6BB` | Glyph on a black badge | 7.81:1 |
| `scrim` | `#2A1A27` | Plum-black sheet scrim, applied at `opacity.scrim` (0.45) | never behind measured text |

### 2.3 Functional (not brand)

| State | Token | Hex | Soft fill | Text on soft |
|---|---|---|---|---|
| Error / risk | `status.risk` | `#8A3B2C` (retained) | `#F9E8E4` | 6.45:1 |
| Success | `status.success` | `#33523F` (retained) | `#E7EEE6` | 7.34:1 |
| Warning / attention | `status.attention` | `#6E4C0E` (retained) | `#F8EFDD` | 6.80:1 |
| Pending | `status.waiting` | `#66516A` (neutral plum-gray, replaces umber) | `#EFE8EE` | 5.91:1 |
| Information | `status.info` | `#5A3A55` (+ information icon) | `#F6EEF4` | 8.50:1 |
| Disabled | `action.disabled`/`disabledText` | see above | — | 4.83:1 |

Every `InlineNotice` tone now carries an icon (information, caution, check, clock) so state is never colour alone.

**Data visualisation.** Inspected for this phase: Daily Load's `LoadMeter` and `SegmentBar` use neutral/accent fills with labels
(no multi-series chart exists in Phase 1 surfaces). No chart colour was added. Calendar and Momentum visualisations are
Phase 2/3 and will be checked there; any collision will be documented rather than silently added to the brand system.

### 2.4 Contrast contract

`tests/design-system/contrastPairs.mjs` is the single pair list shared by the CI gate and by
`scripts-dev/gen-contrast-matrix.mjs` (→ `contrast-matrix.md`). **Every** text pairing is held to 4.5:1. (HK-FE-UI-01's test
computed its floor so that every pairing silently degraded to the 3:1 large-text floor; that looseness is removed.) Berry on Soft
Lilac (4.16:1) is explicitly **not** an allowed pairing and has a negative test; Dusty Mauve is asserted never to be a text token.

## 3. Primary button recipe (spec §7)

Berry `#A24E7A` body · 1 px **opaque** top-edge highlight `#B36E92` drawn as an inset line (so pill rounding stays clean) · 1 px
darker-plum edge `#873F65` (border) · full pill · `elevation.button` (Berry-tinted, opacity 0.22, radius 8) · white text · pressed
state swaps the fill to `#873F65` (text 7.17:1) · disabled is `#E6DAE3` fill with `#6F5669` text and no lift · **no gradient and no
translucent layer anywhere**, so the "static non-gradient" and "reduced-transparency" fallbacks are the rendering itself.
Luxury Black is not part of any button (asserted by `decoration.test.mjs`). No native gradient dependency was added.

## 4. Icons, botanicals and badges

Single icon family: Ionicons (already in the app), outline at rest, in Soft Lilac wells. Original, locally maintained, View-built
decoration (`Botanical.tsx`: `BotanicalSprig`, `CurvedWave`; `Badges.tsx`: `IconBadge`, `KeyBadge`, `PremiumBadge`). No SVG library,
image, font or other dependency was added (an SVG library would be a native dependency and needs separate approval — stop-condition
11). Asset register: `HK-FE-UI-02-asset-register.md`.

Rules enforced in code and tests: decoration is faint (`opacity.decoration` 0.4), hidden from assistive technology
(`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`), touch-transparent, and placed only in
corners/empty regions. It renders **nothing** below 360 dp window width or above 1.3× font scale (`useDecorationVisible`), and the
form-step header badges (`HeaderBadge`) additionally yield on windows shorter than 640 dp.

## 5. Layout, density and compact behaviour

Spacing scale, screen margin (20) and 44/48 touch targets unchanged. Welcome/auth steps keep their functional spacing first:
decoration is removed before any functional spacing is reduced. Subscription disclosures (`COPY.premium.note`) stay in the footer
and are never covered. Forms get no ornament behind them.

## 6. AI truth language — semantic migration table

HK-FE-UI-01 used plum to mark "Her Keys noticed" readings. Plum is now a brand colour, so **colour no longer identifies AI.** Every
register keeps its text label, gains an `AiMark` whose **shape** carries the epistemic status, and keeps a distinct structure:

- dashed outline = Her Keys' reading, **not confirmed by her**
- solid tint tile + solid Berry rail = a **recommendation** she may act on
- amber hand = **needs her approval** before anything runs
- solid moss check = **confirmed / done**

| OLD component / treatment | NEW component / treatment | Domain semantic | Required label (unchanged text) | Contrast proof | Test |
|---|---|---|---|---|---|
| `InsightBlock`: parchment card, 3 px plum-left rail, plum eyebrow | Lilac-wash card, **dashed** Dusty Mauve outline, dashed-circle sparkle mark, Deep Plum Gray eyebrow | INFERENCE (unconfirmed reading) | "HER KEYS NOTICED" | `ai.insight` on `ai.insightSoft` 8.50:1 | `intelligence.test.mjs` › InsightBlock; › HK-FE-UI-02 AI truth semantics |
| `RecommendationBlock` (suggested): clay eyebrow, plain card | White card, solid 4 px Berry rail, solid lightbulb tile, Berry eyebrow | RECOMMENDATION | "WHAT I RECOMMEND" | Berry on white 5.37:1 | › a recommendation is structurally NOT a fact… |
| `RecommendationBlock` (approval required): amber pill | Same + amber-hand mark inside the amber pill | RECOMMENDATION → needs DECISION | "NEEDS YOUR YES" | `status.attention` on `attentionSoft` 6.80:1 | › approval-required and suggested are structurally different |
| `ClarificationPrompt` | Dashed card + dashed-circle chat mark | INFERENCE awaiting confirmation | "HER KEYS NEEDS ONE THING" / "I think this means:" | `ai.insight` on white 9.67:1 | › every register carries an explicit text label AND a mark |
| `InterpretationReview` | Dashed card + dashed-tile document mark | INFERENCE → DECISION on accept | "WHAT I UNDERSTOOD" | `ai.insight` on white 9.67:1 | › unconfirmed readings share the dashed outline |
| `ConfidenceBadge` possible/likely | Amber badge + `help-circle` icon | INFERENCE (uncertainty) | "POSSIBLE" / "LIKELY" | 6.80:1 | › uncertain confidence reads as a question mark… |
| `ConfidenceBadge` established | Moss badge + `checkmark-circle` | confirmed/established | "ESTABLISHED" | `ai.confirmation` on soft 7.34:1 | same |
| `ProvenanceLabel` | unchanged (muted text) | FACT (source) | "You said" / "Her Keys inferred this" / "Source unknown" | `text.muted` ≥5.06:1 on every light surface | existing provenance tests |
| `WhyThis` | unchanged (neutral dotted evidence list) | FACT (evidence) | "WHY THIS" | `text.secondary` 6.97:1 | existing test |
| `ActionStateBlock` proposed | Attention card + amber-hand mark | RECOMMENDATION → DECISION | "NEEDS YOUR YES" | 6.80:1 | › an action proposal never looks like completed work |
| `ActionStateBlock` approved/attempted | Subtle card, **no mark, no check** | DECISION (prepared) | "READY — WILL RUN" / "RUNNING NOW" | `status.waiting` 6.75:1 | same |
| `ActionStateBlock` succeeded (+outcome) | Success card + solid moss check | EXECUTION + OUTCOME | "DONE — …" | 7.34:1 | same |
| `ActionStateBlock` failed / declined / withdrawn | Risk / quiet cards, no check | EXECUTION failed / DECISION | "DIDN'T WORK — NEEDS YOU" / "YOU SAID NO" / "WITHDRAWN" | 6.45:1 / 5.06:1 | existing tests |
| `InlineNotice` `info` (was AI plum) | Deep Plum Gray + information icon; **not** an AI register | neutral information | n/a | 8.50:1 | primitives › InlineNotice |
| Life Operating Profile (onboarding) | Dashed outline + `understood` mark beside "LIFE OPERATING PROFILE"; copy "starting hypotheses, not conclusions" unchanged | INFERENCE (unconfirmed reading) | existing overline + lede | `text.secondary` on white 7.35:1 | gallery evidence 22/23; route source test `onboardingLayout` |

Labels were deliberately **not** reworded (e.g. "What I recommend" was not renamed "Her Keys suggests"): the existing labels already
name the register, other tests/fixtures pin them, and changing copy is outside a presentation change.

The domain bindings in `ai-traceability.md` are unchanged. `ai-traceability.md` rows that describe "plum" or "clay" treatments are
superseded by the table above (see also its supersession note).

## 7. Typography

System font retained; no custom face introduced (no licensed Expo-bundled display face is approved, and a font asset needs owner
approval — brief §10). Display and screen titles move from 700 to 600 weight with generous line heights; **sizes and line heights
are unchanged**, so nothing reflows. Deep Plum Gray is the principal text anchor; secondary and metadata are the 5.06:1+ derived
plums. No script fonts.

## 8. Light-mode policy

Light-only for this release. Enforced today by `app.json` (`userInterfaceStyle: "light"`, iOS `UIUserInterfaceStyle: Light`); this
workstream did not edit `app.json`. Known/likely mismatches to carry to a later brand-asset pass (listed, not built): the **native
splash is charcoal with the gold brand mark** and cross-fades into the Warm Off-White app (a black→light transition); the Expo
Go gear and any OS permission/keyboard surfaces follow the system. **Not verified on a physical device** (see evidence).

## 9. Motion and performance

No new animation was added. Existing `FadeIn` (deliberate/quick) is reused; reduced motion is respected by the existing primitives.
Decorations are static Views (a handful of boxes), no blur, no images, no gradient. Primary-button pressed state is a fill swap, not
an animation.

## 10. Downstream documents that still describe Paper-and-Ink

Not rewritten; **superseded for visual vocabulary by this document** — future agents must not rebuild features with clay
components: `owner-decisions.md` (decision 2, plum reserved), `ai-traceability.md` (plum/clay treatments), `visual-checkpoint.md`,
`HK-FE-UI-01-final-report.md`, `migration-ledger.md`, and `docs/builds/HK-FE-UI-01-PERMANENT.txt`, `HK_FEATURE_01_TODAY.md`,
`HK_FEATURE_04_SYSTEMS_ROUTINES.md`, `HK_FEATURE_08_MEALS.md`, `HK_FEATURE_09_MONEY.md`, `HK_FEATURE_11_ME_REBUILD.md`.
Code comments in `daily-load/LoadMeter.tsx`, `talk-it-out/TalkItOutView.tsx` and `people/copy.ts` still say "clay"/"paper and
ink" (cosmetic, Phase 2).

## 11. Phase 1 migration ledger (what changed)

| Commit | Content |
|---|---|
| D00 | Source authority + impact inventory |
| D01 | `tokens.ts` palette contract; contrast pair list, generator, tests |
| D02 | `Button`, `Tag`, `Sheet`, `TextField`, `systemStates`, `intelligence` |
| D03 | `Botanical.tsx`, `Badges.tsx` + tests |
| D04 | Welcome, Premium introduction, auth steps, state presentations, provider button |
| D05 | Consent/permissions views, Life Operating Profile, final Premium step badge, lilac-legal labels |
| D05b | Consent view extraction, evidence harness (`src/dev/Ui02Evidence.tsx`), gallery |
| D09 | Evidence, docs, boundary-scan lane registration |

## 12. What is explicitly NOT done in Phase 1

Today, Calendar, Life, Systems, Talk It Out conversation, Settings/Account, shared sheets in feature screens, Daily Load, Smart
Inbox, Momentum, the Premium Home and the paywall presentation are re-skinned only by token values and have **not** been reviewed
(Phase 2/3). `DeleteAccountPanel.tsx` still has two `#999` literals (styling-only fix deferred; deletion behaviour is out of scope).
