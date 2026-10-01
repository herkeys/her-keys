# HK_FRONTEND_POLISH_HANDOFF — Frontend UI / Motion Polish Pass (HK-FE-UI-02)

For the BACKEND / INTEGRATION AGENT. This pass was presentation-only: no
backend, database, API, persistence, auth, RevenueCat, domain, routing or
feature-logic change was made.

## 1. BUILD IDENTITY

START_SHA=f87aaee560abc3ede4d02a076312118c9d1b0cec
END_SHA=<filled at commit time — see `git rev-parse HEAD` on branch>
BRANCH=audit/ios-android-platform-parity

## 2. SUMMARY

The pass made the existing product feel more finished without changing what it
does:

- The bottom tab bar now has one coherent icon family (Ionicons: outline at
  rest, filled when selected) with a restrained selected-state emphasis
  (quick rise + 8% scale, ease-out, 120 ms). The "Her Keys AI" tab label
  shortens to "AI". Tab count, order, names and routes are unchanged.
- The launch experience now bridges the black/gold app icon into the warm
  in-app interface: the native splash is deep charcoal (#0B0A08) with a gold
  brand mark derived from the approved app icon (`assets/splash-brand.png`),
  and the splash fades (250 ms) into the app instead of snapping. Welcome
  carries one quiet gold key mark in a soft gold disc, then the warm interior
  takes over. The app was NOT rethemed black/gold.
- A small motion language now exists (`src/design/motion.ts`): QUICK (120 ms),
  STANDARD (200 ms), DELIBERATE (320 ms), all ease-out, all built on the core
  Animated API, all collapsing to immediate state changes under Reduce Motion.
- Today's One Move now owns its screen: its RecommendationBlock is the single
  raised surface, and completion settles in with a deliberate fade/rise plus a
  quiet check mark — no confetti, no delay to the action.
- The Daily Load meter's segments settle (200 ms per segment, 30 ms stagger)
  instead of snapping when the load reading changes. Calculation untouched.
- Kids, Money, Meals and Work now open with the shared `HubHeader` pattern
  (title + one lede). Work's doubled "WORK NOW / TODAY" overlines are fixed.
- EmptyState gained a quiet open-ring mark and a standard entrance; every
  existing empty state inherits it without call-site changes.
- Brand tokens (charcoal/gold) were added for brand moments only; no existing
  color, spacing, type or elevation token changed value.

## 3. FILE-BY-FILE CHANGE MAP

FILE=app.json
COMPONENT=Expo config
CHANGE=Configured the expo-splash-screen plugin (charcoal background, derived
gold brand mark, 220px, contain, same in dark mode); registered the expo-font
plugin (auto-added by `expo install expo-font`).
WHY=Launch/brand continuity (Phase 3).
BEHAVIORAL_IMPACT=Native splash appearance and its fade; no runtime logic.
BACKEND_IMPACT=NONE

FILE=package.json / package-lock.json
COMPONENT=Dependencies
CHANGE=Added `expo-splash-screen` (~57.0.9), `@expo/vector-icons` (^15.0.2),
`expo-font` (~57.x, required peer of vector-icons) — all via `npx expo install`
on the SDK 57 line. No existing package was upgraded or removed.
WHY=Splash configuration and the single icon family.
BEHAVIORAL_IMPACT=NONE beyond what the new UI uses.
BACKEND_IMPACT=NONE

FILE=app/_layout.tsx
COMPONENT=Root layout
CHANGE=Imports `expo-splash-screen` and calls
`SplashScreen.setOptions({ duration: 250, fade: true })` at module scope. The
existing preventAutoHide/hide lifecycle is unchanged.
WHY=The charcoal splash fades into the warm interior.
BEHAVIORAL_IMPACT=Splash hide animation only.
BACKEND_IMPACT=NONE

FILE=app/(app)/_layout.tsx
COMPONENT=Tab navigator layout
CHANGE=Added per-tab icons (one Ionicons family, outline/filled) through the
new `TabIcon` component with a QUICK selected-state emphasis; renamed the AI
tab's title to "AI"; added `tabBarAllowFontScaling: false` (narrow, documented
cap: the tab bar height is fixed at 68pt + inset, so scaled labels would clip).
WHY=Phase 2 navigation polish; Phase 12 fixed-chrome protection.
BEHAVIORAL_IMPACT=Tab presentation only; routes and structure identical.
BACKEND_IMPACT=NONE

FILE=app/index.tsx
COMPONENT=Welcome
CHANGE=Added a small gold key mark (Ionicons `key-outline` in brand gold on a
gold-soft disc) above the existing overline, and wrapped the body in a
DELIBERATE FadeIn. Copy, flow and `recordStep` behavior unchanged.
WHY=The splash → Welcome brand bridge.
BEHAVIORAL_IMPACT=Visual only.
BACKEND_IMPACT=NONE

FILE=src/design/tokens.ts
COMPONENT=Design tokens
CHANGE=Added palette.brandCharcoal (#0B0A08), palette.brandGold (#C9A24B),
palette.brandGoldSoft (#E9DDBE) and the `color.brand` group. NO existing token
changed.
WHY=Brand-moment colors, explicitly not action colors.
BEHAVIORAL_IMPACT=NONE
BACKEND_IMPACT=NONE

FILE=src/design/motion.ts (NEW)
COMPONENT=Motion language
CHANGE=New module: motionDuration (quick/standard/deliberate from the existing
motion tokens), `useReduceMotion()` (AccessibilityInfo, live subscription),
`durationFor()`, `useTiming()`.
WHY=Phase 4.
BEHAVIORAL_IMPACT=NONE by itself.
BACKEND_IMPACT=NONE

FILE=src/design/components/animated.tsx (NEW)
COMPONENT=FadeIn
CHANGE=New shared entrance primitive: opacity + small translateY (default 6dp),
speeds from the motion language, honors Reduce Motion.
WHY=Meaningful entrances without a new animation dependency.
BEHAVIORAL_IMPACT=NONE by itself.
BACKEND_IMPACT=NONE

FILE=src/design/components/HubHeader.tsx (NEW)
COMPONENT=HubHeader
CHANGE=New shared hub opening: screenTitle + one optional supporting lede.
WHY=Phase 6 hub consistency.
BEHAVIORAL_IMPACT=NONE by itself.
BACKEND_IMPACT=NONE

FILE=src/design/components/TabIcon.tsx (NEW)
COMPONENT=TabIcon
CHANGE=New tab icon primitive: one Ionicons spec (outline/filled), QUICK
rise/scale emphasis on selection, Reduce Motion swaps instantly.
WHY=Phase 2.
BEHAVIORAL_IMPACT=NONE by itself.
BACKEND_IMPACT=NONE

FILE=src/design/components/index.ts
COMPONENT=Barrel
CHANGE=Exports animated, HubHeader, TabIcon.
WHY=Discoverability.
BEHAVIORAL_IMPACT=NONE
BACKEND_IMPACT=NONE

FILE=src/design/components/intelligence.tsx
COMPONENT=RecommendationBlock
CHANGE=New optional prop `raised?: boolean` (default false) passed to Card.
WHY=Lets the One Move be the one raised surface.
BEHAVIORAL_IMPACT=Default rendering unchanged.
BACKEND_IMPACT=NONE

FILE=src/design/components/SegmentBar.tsx
COMPONENT=SegmentBar
CHANGE=New optional prop `animated?: boolean` (default false). When set, fill
changes interpolate track→tone per segment over STANDARD with a 30 ms
positional delay (JS driver — color interpolation; ≤ a handful of segments).
Reduce Motion jumps instantly.
WHY=Daily Load changes settle instead of snapping.
BEHAVIORAL_IMPACT=Default rendering pixel-identical to before.
BACKEND_IMPACT=NONE

FILE=src/design/components/systemStates.tsx
COMPONENT=EmptyState
CHANGE=Wrapped in FadeIn (STANDARD) and gained a 26px open-ring "quiet mark"
(hidden from accessibility). Props unchanged; LoadingState/ErrorState/
OfflineState/InlineNotice untouched.
WHY=Phase 7 empty-state polish, inherited everywhere.
BEHAVIORAL_IMPACT=Every EmptyState entrance animates once.
BACKEND_IMPACT=NONE

FILE=src/features/daily-load/LoadMeter.tsx
COMPONENT=LoadMeter
CHANGE=Passes `animated` to SegmentBar.
WHY=Phase 5 load transitions.
BEHAVIORAL_IMPACT=Presentation only; load math/thresholds untouched.
BACKEND_IMPACT=NONE

FILE=src/features/one-move/OneMoveCard.tsx
COMPONENT=OneMoveCard
CHANGE=Selected state: RecommendationBlock now `raised`, wrapped in FadeIn.
Completed state: FadeIn (DELIBERATE) + a moss check mark beside the overline
(sized by padding, never a fixed height — the large-text guard still passes).
Copy and completion logic unchanged.
WHY=Phase 5 visual priority + completion acknowledgment.
BEHAVIORAL_IMPACT=Presentation only.
BACKEND_IMPACT=NONE

FILE=src/features/today/TodayBriefing.tsx
COMPONENT=TodayBriefing
CHANGE=Composition sections render inside FadeIn with a capped stagger
(min(index,4) × 40 ms). Order, projection, and all logic unchanged.
WHY=Phase 10 empty→populated continuity on the flagship screen.
BEHAVIORAL_IMPACT=Entrance animation only.
BACKEND_IMPACT=NONE

FILE=src/features/work/WorkOverview.tsx
COMPONENT=WorkOverview
CHANGE=Added `HubHeader` ("Work" + one lede); removed the doubled
"Work now" overline; the single "Today" overline still heads today's events.
Verdict, lists and CareerNext unchanged.
WHY=Phase 6.
BEHAVIORAL_IMPACT=Presentation only.
BACKEND_IMPACT=NONE

FILE=src/features/kids/views/KidsHubView.tsx
COMPONENT=KidsHubView
CHANGE=Added `HubHeader` ("Kids" + the existing HUB.intro as lede, also in the
empty branch); the standalone intro text row was removed (it became the lede).
WHY=Phase 6.
BEHAVIORAL_IMPACT=Presentation only.
BACKEND_IMPACT=NONE

FILE=src/features/money/MoneyBody.tsx
COMPONENT=MoneyBody
CHANGE=Added `HubHeader` ("Money" + one lede) at the top of the resolved body.
WHY=Phase 6.
BEHAVIORAL_IMPACT=Presentation only.
BACKEND_IMPACT=NONE

FILE=src/features/meals/MealsBody.tsx
COMPONENT=MealsBody
CHANGE=Added `HubHeader` ("Meals" + MEAL_COPY.hubLede) at the top of the
resolved body.
WHY=Phase 6.
BEHAVIORAL_IMPACT=Presentation only.
BACKEND_IMPACT=NONE

FILE=src/features/meals/mealCopy.ts
COMPONENT=MEAL_COPY
CHANGE=Added `hubLede: 'The coming days at the table, and the work that goes
with them.'` (kept in the audited copy module; passes the Meals copy audit —
no claim words, no forbidden classes).
WHY=Copy belongs in the audited module.
BEHAVIORAL_IMPACT=NONE
BACKEND_IMPACT=NONE

FILE=tests/support/rn-stub.tsx
COMPONENT=Test floor
CHANGE=The react-native stub gained Easing, AccessibilityInfo (Reduce Motion
off) and a minimal Animated (Value/interpolate/timing/View) so components using
the motion primitives mount in node --test.
WHY=Test floor completeness.
BEHAVIORAL_IMPACT=Tests only.
BACKEND_IMPACT=NONE

FILE=tests/support/icon-stub.tsx (NEW)
COMPONENT=Test floor
CHANGE=Stub for @expo/vector-icons (Ionicons renders as a named stub element).
WHY=Test floor completeness.
BEHAVIORAL_IMPACT=Tests only.
BACKEND_IMPACT=NONE

FILE=tests/support/register-jsx.mjs
COMPONENT=Test floor
CHANGE=Redirects `@expo/vector-icons` imports to the icon stub.
WHY=Test floor completeness.
BEHAVIORAL_IMPACT=Tests only.
BACKEND_IMPACT=NONE

FILE=tests/hk-f01f13/lifeHub.test.mjs
COMPONENT=Shell guard test
CHANGE=The tab-shell assertion now expects `ai:AI` (the task-authorized label
shortening); tab set, order and count assertions unchanged.
WHY=Legitimate UI expectation update.
BEHAVIORAL_IMPACT=Tests only.
BACKEND_IMPACT=NONE

FILE=tests/meals/boundary.test.mjs
COMPONENT=Boundary accounting test
CHANGE=BV6 expectations updated for the newly registered HK-FE-UI-02 lane:
app/_layout.tsx lanes [F10, REFINEMENTS, POLISH]; WorkOverview shared lanes
[F10, POLISH]; MealsBody now names the polish lane (the unexplained-file check
moved to mealsView.ts).
WHY=The change-accounting register gained a lane; the assertions name it.
BEHAVIORAL_IMPACT=Tests only.
BACKEND_IMPACT=NONE

FILE=scripts-dev/meals-boundary-scan.cjs
COMPONENT=Boundary scan register
CHANGE=Registered the `HK-FE-UI-02` lane (owned paths + per-file reasons),
including an explicit out-of-scope note for the pre-existing untracked
credentials.json (never read, staged or committed).
WHY=Every post-checkpoint change must be explained by a lane.
BEHAVIORAL_IMPACT=Scan accounting only.
BACKEND_IMPACT=NONE

FILE=assets/splash-brand.png (NEW)
COMPONENT=Derived brand asset
CHANGE=The gold heart-key mark cropped from the approved app icon
(her-keys-4-house.png), 512×512, near-black field that blends into the
charcoal splash. The app icon itself is untouched.
WHY=Phase 3 / Phase 9 derived splash mark.
BEHAVIORAL_IMPACT=Splash appearance.
BACKEND_IMPACT=NONE

## 4. COMPONENT CONTRACT MAP

COMPONENT=RecommendationBlock
OLD_PROPS=body, approvalRequired, actionLabel?, meta?, onApprove?, onShowAlternative?, onNotToday?, style?
NEW_PROPS=same + raised?: boolean (default false)
PROP_SIGNATURE_CHANGED=YES (additive optional prop)
DEFAULT_BEHAVIOR_CHANGED=NO

COMPONENT=SegmentBar
OLD_PROPS=filled, total, tone?, style?
NEW_PROPS=same + animated?: boolean (default false)
PROP_SIGNATURE_CHANGED=YES (additive optional prop)
DEFAULT_BEHAVIOR_CHANGED=NO

COMPONENT=EmptyState
OLD_PROPS=title, body, actionLabel?, onAction?, style?
NEW_PROPS=unchanged
PROP_SIGNATURE_CHANGED=NO
DEFAULT_BEHAVIOR_CHANGED=YES (visual only: quiet mark + one STANDARD entrance)

COMPONENT=Card / Button / Sheet / StatusList / AppText / ChipToggle / Tag /
TextField / Divider / InsightBlock / WhyThis / ClarificationPrompt /
InterpretationReview / ConfidenceBadge / ProvenanceLabel / ActionStateBlock
PROP_SIGNATURE_CHANGED=NO
DEFAULT_BEHAVIOR_CHANGED=NO

NEW COMPONENTS=FadeIn (animated.tsx), HubHeader, TabIcon, plus hooks in
src/design/motion.ts (useReduceMotion, useTiming, durationFor, motionDuration).

## 5. DATA CONTRACT MAP

SCREEN=Welcome (app/index.tsx)
DATA_SOURCE=OnboardingContext (unchanged)
EXISTING_FIELDS_USED=resumeStep, recordStep
NEW_FIELDS_REQUIRED=NONE
QUERY_CHANGED=NO
MUTATION_CHANGED=NO
PERSISTENCE_CHANGED=NO

SCREEN=Today
DATA_SOURCE=useTodayView / buildTodayView (unchanged)
EXISTING_FIELDS_USED=all as before
NEW_FIELDS_REQUIRED=NONE
QUERY_CHANGED=NO
MUTATION_CHANGED=NO
PERSISTENCE_CHANGED=NO

SCREEN=One Move card
DATA_SOURCE=OneMoveSection view model (unchanged)
EXISTING_FIELDS_USED=all as before
NEW_FIELDS_REQUIRED=NONE
QUERY_CHANGED=NO
MUTATION_CHANGED=NO
PERSISTENCE_CHANGED=NO

SCREEN=Life / Kids / Money / Meals / Work hubs
DATA_SOURCE=existing projections (unchanged)
EXISTING_FIELDS_USED=all as before (Kids reuses HUB.intro as the lede)
NEW_FIELDS_REQUIRED=NONE
QUERY_CHANGED=NO
MUTATION_CHANGED=NO
PERSISTENCE_CHANGED=NO

## 6. ROUTING MAP

ROUTES_CHANGED=NO
ROUTE_NAMES_CHANGED=NO (the AI tab's display title changed; the route name is
still `ai`)
NAVIGATION_STRUCTURE_CHANGED=NO

## 7. STATE MAP

New LOCAL UI-only state (none persisted, none in AppState):

- FadeIn: one Animated.Value per instance (entrance progress, 0→1).
- TabIcon: one Animated.Value per tab (selection emphasis, 0/1).
- AnimatedSegment (SegmentBar): one Animated.Value per segment (fill progress).
- useReduceMotion: local boolean state mirroring the OS Reduce Motion setting.

No persisted application state, no drafts, no sync-evidence changes.

## 8. BACKEND DEPENDENCIES

BACKEND_DEPENDENCY_DISCOVERED=NONE

## 9. ASSET MAP

ADDED: assets/splash-brand.png — gold brand mark derived (crop/resize) from the
approved app icon assets/her-keys-4-house.png.
MODIFIED: none. The approved app icon, adaptive foreground, monochrome and
favicon are byte-identical.
ICONS: runtime icons come from the bundled Ionicons font (@expo/vector-icons);
no icon image assets were added.
RETIRED: assets/splash-icon.png (the default template grid) is no longer
referenced by any config; the file is left in place unmodified.

## 10. VISUAL BEHAVIOR MAP

- Tab selection: 120 ms ease-out; translateY 0→-1.5dp, scale 1→1.08; icon
  swaps outline→filled; color handled by the navigator tint. Reduce Motion:
  instant swap, no movement.
- Splash → app: native fade 250 ms (iOS fade; Android system crossfade).
- Welcome: DELIBERATE (320 ms) fade + 6dp rise of the body block.
- Today sections: STANDARD (200 ms) fade + 6dp rise, staggered 40 ms, capped
  at the 5th section.
- One Move completion: DELIBERATE (320 ms) fade + rise into the resolved card.
- Load meter: per-segment track→tone color interpolation, 200 ms, 30 ms
  positional delay, JS driver.
- EmptyState: STANDARD (200 ms) fade + 6dp rise.
- Reduce Motion (all of the above): duration 0 — content simply appears.

## 11. INTEGRATION CERTIFICATION

DATABASE_CHANGES=NO
SUPABASE_CHANGES=NO
EDGE_FUNCTION_CHANGES=NO
API_CONTRACT_CHANGES=NO
DOMAIN_LOGIC_CHANGES=NO
PERSISTENCE_CHANGES=NO
AUTH_CHANGES=NO
REVENUECAT_CHANGES=NO
BACKEND_ENV_CHANGES=NO

## 12. TEST IMPACT

TESTS_UPDATED=tests/hk-f01f13/lifeHub.test.mjs (AI tab label expectation),
tests/meals/boundary.test.mjs (lane-accounting expectations for the new
registered lane). No unrelated guard weakened.
NEW_TESTS=none (test floor extended instead: rn-stub Animated/Easing/
AccessibilityInfo surface, icon-stub, register-jsx redirection).
VISUAL_REGRESSION_CHECKS=contrast suite green (no token values changed);
OneMoveCard large-text source guard green.
MANUAL_QA=No emulator/simulator was available on this machine (Windows, no adb
device). Rendered visual QA and before/after screenshots are therefore NOT
captured in this pass; code-level checks (typecheck, 3574/3574 tests, expo
config resolution, expo-doctor) all pass. Recommend one rendered pass on
device before release, focused on: tab bar icons/emphasis, splash fade, One
Move completion settle, hub headers, and a large-text smoke pass.

KNOWN PRE-EXISTING (not introduced here, deliberately not "fixed" per change
control): expo install --check reports patch-level mismatches for expo
(~57.0.26 wanted, 57.0.25 installed), expo-constants and expo-router — all
predate this pass.

## 13. BACKEND AGENT INSTRUCTIONS

BACKEND_ACTION_REQUIRED=NO

Nothing to wire. No query, mutation, persistence, auth, entitlement or
environment surface changed. The only new runtime dependencies are
presentation packages on the SDK 57 line; the next native build (EAS, run by
others) will pick up expo-splash-screen's config plugin automatically.
