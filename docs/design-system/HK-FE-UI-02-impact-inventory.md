# HK-FE-UI-02 — Phase 0: source authority and design impact inventory

Status: **Phase 0 complete.** Presentation-only. No functional boundary is touched by anything in this document.

## 1. Source authority (verified, not assumed)

| Item | Value |
|---|---|
| Repository | `herkeys/her-keys` (remote `origin`, fetched 2026-10-15 before any edit) |
| Authoritative design baseline (ENTRY SHA) | `ccdcffcf2da254deb4c80e62d8839016fa3ebca1` |
| Baseline branch | `repair/v2-production-premium-rollout-readiness-20261016` — `origin/` tip **equals** the pinned SHA |
| Earlier Welcome Tree candidate | `candidate/welcome-tree-premium-android-internal-20261016` @ `ae742a36292e126fea976d6d032bee430c873abd` — verified **ancestor** of the baseline; baseline is **14 commits ahead** |
| Premium Stage 1 UI / backend cert / SDK identity fence | `integration/premium-stage1-feature-ui-20261016`, `repair/premium-journey-backend-cert-20261016`, `repair/premium-sdk-identity-fence-20261015` — all verified **ancestors** of the baseline |
| Separate RevenueCat repair | `integration/premium-paywall-layout-20261015` @ `8cb841c2d0b22e0586901075f485e4c3d18c55ee` — verified **NOT an ancestor** of the baseline |
| Open PR owning the baseline | #26 (`repair/v2-production-premium-rollout-readiness-20261016` → `candidate/welcome-tree-premium-android-internal-20261016`) |
| Design worktree | `C:\Users\jsmit\Her-Keys-UI02`, branch `design/hk-fe-ui-02-foundation`, created from the pinned SHA; the other worktrees were not touched |

**RevenueCat repair is a separate integration dependency owned by the V2 integration manager.** It is not part of this design
baseline. This workstream does not merge that branch and does not cherry-pick any RevenueCat runtime change. (PR #23 targets that
branch; it is likewise outside this workstream.)

Concurrent-change check: the pinned SHA was equal to the remote tip at fetch time. Other worktrees (`Her-Keys-PW01`,
`Her-Keys-P1`, `Her-Keys-WA01`, `Her-Keys-P0A`) hold other branches; none shares a working tree with this one. Shared design files
(`src/design/**`) will be re-checked against the remote before each push.

## 2. What exists today (HK-FE-UI-01 "Paper and Ink")

- `src/design/tokens.ts` — one `palette` object feeds two exported views: canonical `color.*` and the legacy flat `colors.*`
  (used by 70 files). Spacing `2/4/8/12/16/20/24/32/40`, radii `8/12/16/20/28/pill`, one type hierarchy (system font), one
  elevation (`raised`), `interaction`, `motion`, `sizing` (44 pt floor, 48 control height, 20 screen margin).
- `src/design/components/*` — `AppText/Overline`, `Screen`, `Card`, `Button`, `Tag`, `Divider`, `ChipToggle`, `SegmentBar`,
  `StatusList`, `TextField`, `systemStates` (incl. `InlineNotice`), `Sheet`, `intelligence` (the AI presentation system),
  `animated`, `HubHeader`, `TabIcon`.
- Contract tests: `tests/design-system/contrast.test.mjs` (WCAG matrix), `components/primitives.test.mjs`,
  `components/intelligence.test.mjs`; generator `scripts-dev/gen-contrast-matrix.mjs`; human docs under `docs/design-system/`.
- **No hard-coded hex outside `tokens.ts`** except two `#999` borders in `account/DeleteAccountPanel.tsx` and the scrim `rgba` in
  `Sheet.tsx` (see the generated inventory). The system is therefore *token-driven*: replacing token values re-skins the
  application, which is exactly why every consumer must nonetheless be reviewed, not assumed.

Generated per-file inventory (token families, hard-coded literals, platform code, reachability):
[`HK-FE-UI-02-impact-inventory.generated.md`](HK-FE-UI-02-impact-inventory.generated.md), produced by
`scripts-dev/ui02-impact-inventory.mjs`.

Key counts from the generator at the pinned SHA: **180** design-touching files, **all reachable** from `app/**` through the static
import graph (nothing in the design layer is dead code); **70** files read the legacy flat `colors.*` view; **11** read
`color.action.primary`; **3** read `color.ai.*` (`intelligence.tsx`, `systemStates.tsx`, `talk-it-out/capture/CaptureCards.tsx`);
**2** read `color.brand.*` (the two Welcome views that carry the gold launch bridge); only `Platform` code in 3 files.

## 3. Impact classification

Legend — **PRESERVE** (no change needed), **REFINE** (token/primitive-level change, then reviewed), **REPLACE** (the current
treatment cannot satisfy the new contract by refinement), **OUT OF SCOPE**.

| Surface | Class | Reason / what changes |
|---|---|---|
| `tokens.ts` palette values | **REPLACE** | Clay/ivory/parchment/gold → Dusty Mauve family. Different hues; a recolour by alias would leave a forbidden brown/terracotta residue (`claySoft`, `clayBorder`, `umber`, `brandGold`). Canonical **names** are preserved so consumers keep compiling. |
| `tokens.ts` structure (spacing, radii, sizing, motion, interaction) | **PRESERVE** | Spacing scale, 44 pt floor, screen margin and motion budget are re-used verbatim as required. Radii are unchanged. |
| `tokens.ts` typography | **REFINE** | System font retained (no custom face). Display/screen-title weight softened (700 → 600) for the airy register; sizes/line-heights unchanged so no layout reflow. |
| `tokens.ts` elevation | **REFINE** | One plum-tinted soft lift + a small button lift; still one dominant surface per screen. |
| New tokens | **ADD** | `action.primaryPressed/primaryHighlight/onSoft`, `brand.*` six-colour record, `luxury.*` accents, `surface.tint`, semantic soft fills re-derived, `decoration` budget. Each derived token has a documented purpose (spec §4). |
| `Button` | **REFINE → recipe** | Berry fill + opaque top-edge highlight + darker-plum lower edge + pill + controlled elevation + pressed colour (not opacity-only). Static, non-gradient, reduced-transparency-safe by construction. |
| `TextField`, `Card`, `Tag`, `ChipToggle`, `SegmentBar`, `Divider`, `StatusList`, `HubHeader`, `TabIcon`, `animated` | **REFINE** | Pick up tokens; `Tag` accent and any "berry text on tinted fill" switch to `action.onSoft` (Berry on Soft Lilac is 4.16:1 — fails for small text). |
| `Sheet` | **REFINE** | Scrim `rgba` re-expressed via a token (plum-black scrim); no behaviour change. |
| `systemStates` (`InlineNotice`, empty/loading/error) | **REFINE** | Information tone becomes Deep Plum Gray with an information icon — no longer "AI plum". |
| `intelligence.tsx` (AI presentation system) | **REPLACE (treatment), PRESERVE (contract)** | Plum is no longer a selective AI colour, so colour can no longer identify AI. Each component gains a structural, icon-plus-label treatment (see the semantic migration table). Props, domain bindings and truth/authorization meaning are unchanged. |
| Welcome tree — `welcome/*` (Welcome, Premium intro, Account choice, Email, Password, OTP, Recovery, states, provider buttons, gallery preview) | **REPLACE (visual composition), PRESERVE (state machine/copy/behaviour)** | The gold-on-ivory brand mark and flat layout cannot express the approved mockup; views are recomposed with botanical/wave/badge decoration. `model.ts`, `copy.ts` copy meaning, callbacks and navigation are untouched. |
| Consent — `consent/ConsentFlow.tsx` | **REFINE** | Spacing/typography/control visibility only. No legal or consent wording changes; receipts untouched. |
| Onboarding — `onboarding/OnboardingScaffold.tsx`, `app/onboarding/*` | **REFINE** | Progress, header decoration and surfaces; answers/persistence/calculation untouched. |
| Final Premium decision — `app/onboarding/plus.tsx` | **REFINE** | Presentation only; purchase-readiness and entitlement checks untouched. |
| Core Free app (Today, Calendar, Life, Systems, Talk It Out, Settings, account, sheets) | **REFINE (Phase 2)** | Re-skinned automatically by token values; each reviewed in Phase 2 *after* owner checkpoint approval. |
| Premium features (Daily Load, Smart Inbox, Momentum, `premium/PremiumHome`, paywall presentation) | **REFINE (Phase 3)** | After Phase 2. Paywall presentation only; no RevenueCat logic. |
| `account/DeleteAccountPanel.tsx` hex `#999` borders | **REFINE (Phase 2)** | Style literals → tokens only. Deletion behaviour is not touched (spec §20). |
| Native splash / app icon / `app.json` | **OUT OF SCOPE** | Needs separate approval. The black-splash → light-app transition is documented as a later brand-asset item. |
| Dark mode counterpart | **OUT OF SCOPE** | Light-mode-only release (spec §11); mismatches are listed, not built. |

## 4. Existing semantic components mapped

Every intelligence component (`InsightBlock`, `RecommendationBlock`, `WhyThis`, `ClarificationPrompt`, `InterpretationReview`,
`ConfidenceBadge`, `ProvenanceLabel`, `ActionStateBlock`) and its durable source is already traced in
[`ai-traceability.md`](ai-traceability.md). The old → new treatment table lives in
[`HK-FE-UI-02-spec.md`](HK-FE-UI-02-spec.md) §6.

Downstream guards that encode the old palette's meaning and need an explicit, documented update (not a silent rewrite):

| Test / doc | Encodes | Disposition |
|---|---|---|
| `tests/design-system/contrast.test.mjs` | `action.primary` text on `action.primarySoft` ≥ 4.5 | Berry on Soft Lilac is 4.16:1 by owner palette; the pairing is **removed from the allowed list and replaced by a negative test** plus `action.onSoft` on `primarySoft`. The matrix is expanded, not reduced. |
| `tests/hk-f01f13/designGuard.test.mjs` | "plum = AI; an error must not be plum" | The *intent* (a failure/refusal must not be rendered as the AI/info register) is preserved; the colour rationale in its comment is superseded. |
| `tests/welcomeAuthShell.test.mjs` | "no invented hex colors in welcome sources" | Kept as-is and still enforced — decorative assets take colours from tokens. |
| `docs/design-system/owner-decisions.md` decision 2 (plum reserved for AI) | AI = plum | Superseded by HK-FE-UI-02 §6 (explicit-label + structure rule). |
| Wave 2 / feature docs under `docs/builds/` that name clay / paper-and-ink | Obsolete visual vocabulary | **Not rewritten.** Listed with supersession references in the spec §10 so future agents do not rebuild features with clay components. |

## 5. Phase-zero gate

```
SOURCE_AUTHORITY=PASS
DESIGN_IMPACT_INVENTORY=COMPLETE
EXISTING_SEMANTIC_COMPONENTS_MAPPED=YES
BACKWARD_COMPATIBILITY_PLAN=APPROVED_FOR_IMPLEMENTATION
FUNCTIONAL_BOUNDARY_CHANGES=NONE
```

Backward-compatibility plan (what makes the above true): canonical token **names** (`color.*`, `colors.*`, `typography.*`,
`spacing`, `radius`, `sizing`, `elevation`, `interaction`, `motion`) and every component prop signature are preserved; only
values and internals change. New API is additive. Removed names (`color.brand.gold`, `color.brand.charcoal`, `color.brand.goldSoft`)
have exactly two consumers, both inside the Welcome tree being recomposed in Phase 1; `tsc` gates the rest.
