# Her Keys — Baseline Front-End Inventory (BEFORE)

Captured on branch `design/01-front-end-system` at K0b (`7e2f80e`), before any
design change. Companion to `migration-ledger.md`. Evidence for every claim is a
repository file; nothing here is assumed.

## 1. Route / navigation structure (actual)

Root stack (`app/_layout.tsx`), every screen behind an access guard
(`src/domain/routeAccess.ts` — domain authority, untouched by this build):

| Route | Presentation | Notes |
|---|---|---|
| `index` | card | Welcome; auto-redirects to onboarding resume step |
| `onboarding/goals` | card | Life systems audit step 1 of 4 (chips) |
| `onboarding/strengths` | card | step 2 of 4 (chips) |
| `onboarding/struggles` | card | step 3 of 4 (chips) |
| `onboarding/talk-it-out` | card | step 4 of 4 (explainer) |
| `onboarding/profile` | card | operating profile review |
| `onboarding/plus` | card | Her Keys+ overview |
| `(app)` | tabs | five tabs, see below |
| `talk-it-out` | **modal** (header "Talk It Out") | TalkItOutView without header |
| `event-editor` | modal (header "Event") | thin wrapper over EventForm |
| `task-editor` | modal (header "Task") | thin wrapper over TaskForm |
| `dev-tools` | card (header "Internal tools") | development surface |
| `sign-in` | modal (header "Your account") | |
| `account-conflict` | card | blocking conflict surface |

Tabs (`app/(app)/_layout.tsx`): **Today, Life, Calendar, Systems, Her Keys AI** —
text-only labels (no icon set is bundled; empty icon slots render as missing
glyphs). Active tint `colors.accent`, inactive `colors.textTertiary`, fixed
height 68 + bottom inset.

Life sub-stack (`app/(app)/life/`): `index` (hub), `home`, `kids`, `meals`,
`money`, `needs-me`, `other-tasks`, `work`.

Expected product areas (Today / Calendar / Life / Systems / Her Keys AI) match
the actual tabs exactly — **no navigation discrepancy to record**. "Talk It
Out" exists in three forms: onboarding step 4, root modal, and the Her Keys AI
tab embeds `TalkItOutView` directly.

## 2. Shared component inventory (10 primitives, `src/design/components/`)

| Component | Role | Consumers (≥2 check) |
|---|---|---|
| `Screen` | SafeArea + optional ScrollView + page padding | nearly every screen |
| `AppText` + `Overline` | typed text variants | everywhere |
| `Button` | primary / secondary / ghost, md / sm | everywhere |
| `Card` | tone surface/subtle/accent/attention/success, optional raised | everywhere |
| `ChipToggle` | selectable chip | onboarding (3 steps), NeedsMeChip |
| `SegmentBar` | discrete progress segments | LoadMeter, onboarding progress |
| `StatusList` | grouped label/value rows with attention dot | Today summary, Life hub |
| `Tag` | tone neutral/attention/success/accent pill label | Talk It Out confidence, statuses |
| `TextField` | labeled input, error text, multiline | profile, event/task forms, NeedsMeQuickAdd |
| `Divider` | hairline rule | mixed into surfaces |

Token file: `src/design/tokens.ts` (colors 19 values, spacing 9, radius 6,
typography 9 variants, 1 elevation). UI utility files: none (`src/utils/` is
empty). No raw hex color appears anywhere outside `tokens.ts` (verified by
grep over `app/` and `src/`).

## 3. Screens and feature UI (actual)

- **Today** (`app/(app)/today.tsx`): greeting hero, day-state line, LoadMeter,
  DailyLoadCard, OneMoveCard, NeedsMeChip, LifeStatusSummary, TimelineList,
  TomorrowPreview, HandledLedger, TalkItOutEntry, PersistenceNotice, SyncNotice.
- **Talk It Out** (`src/features/talk-it-out/`): TalkItOutView (bubbles,
  quick replies, voice placeholder, composer, keyboard avoidance), TalkItOutEntry
  (Today card entry point), engine (scripted prototype conversation).
- **Life** (`app/(app)/life/index.tsx` + feature lists): NeedsMeQuickAdd,
  StatusList hub, per-area screens (Kids/Meals/Money/Home/Work/Needs Me/Other).
- **Calendar / Systems**: feature surfaces behind the same tabs; **not in this
  build's migration scope** (design freeze section 22) — inventoried only.
- **Onboarding**: OnboardingScaffold (progress header, hero title, description,
  content slot, continue button) + per-step chip screens + profile + plus.

## 4. AI / Talk It Out UI semantics (as built)

Message model (`src/types/talkItOut.ts`): `stage` vocabulary
listen / hypothesis / refinement / clarify / result / next-step / unmatched;
`confidenceLabel` (display string, e.g. "Possible pattern"); `evidence[]`
("Based on" list); `recalled` topic/answer marker for rebuilt conversations.
Stages render as labeled bubbles — "A THEORY", "ONE QUESTION", "WHAT THAT
CHANGES", "WHAT I THINK IS HAPPENING", "ONE MOVE" — with clarified/next-step
stages emphasized (accent label color, title weight). This maps cleanly onto
the frozen Build 4 producer/confidence vocabulary; the full traceability table
is produced in K3 (this build's section 13), not here.

## 5. Accessibility helpers (actual)

No central a11y helper module. Accessibility is inline on the interactive
primitives: `accessibilityRole="button"` and `accessibilityState` on
Button/ChipToggle/StatusList rows, `accessibilityLabel` derived from content
(11 call sites), TextField labels, KeyboardAvoidingView in Talk It Out and the
forms. Attention is never color-alone in StatusList (dot + text). Touch floors:
buttons ≥ 44 px (sm) / 50 px (md), chips 48 px, list rows 56 px.
No dynamic-type scaling, no focus-ring treatment, no contrast measurement
existed before this build — all introduced by the permanent system (K1/K2).

## 6. Loading / error / offline / animation (actual)

- **Animations: none.** No `Animated`, no `LayoutAnimation`, no animation
  dependency anywhere in `app/` or `src/`.
- **Loading: no spinner or skeleton component exists.** Splash is held until
  state settles (`SplashScreen.preventAutoHideAsync`), which is the only
  loading treatment.
- **Offline/sync: `SyncNotice` and `PersistenceNotice`** (Today) surface sync
  and save state; domain sync lives in `src/domain/sync/` (out of scope).
- **Error: TextField error text** (form level); no shared ErrorState/
  EmptyState/OfflineState component exists.
- These gaps are filled by the permanent system's SYSTEM STATES family (K2).

## 7. BEFORE screenshots

Device: `HerKeys_Runtime` Android emulator (Pixel 8 Pro skin, 1344×2992),
Expo Go 57.0.9, Metro dev bundle of `design/01-front-end-system` @ K0b.
App state: fresh emulator-local install; app's own first-run onboarding and
demo data (no source or seed data was modified). Dev-overlay artifacts
(Expo settings button, occasional "Cannot connect to Expo CLI" toast) are
tooling artifacts, not app UI.

Reproduction path (each step by UI automation; nothing pre-seeded):

1. `00-welcome.png` — first launch → Welcome (fresh state).
2. `01-onboarding-goals.png` — tap **Begin** → onboarding goals (nothing selected).
3. `02-onboarding-profile.png` — goals: select "A calmer household" + "Reduced
   stress" → Continue; strengths: select "Cooking" → Continue; struggles:
   select "Overcommitting" → Continue; step 4 → "See my profile".
4. `03-today.png` — profile → Continue → Her Keys+ → "Continue without
   Her Keys+" → lands on Today tab.
5. `04-life.png` — Life tab.
6. `05-talk-it-out-entry.png` — "Her Keys AI" tab (TalkItOutView, entry state).
7. `06-talk-it-out-clarify.png` — quick reply "I'm always behind".
8. `07-talk-it-out-result.png` — quick reply "After school pickup".
9. `08-talk-it-out-resolution.png` — quick reply "Everything at once" (result:
   confidence chip "POSSIBLE PATTERN", "BASED ON" evidence, "ONE MOVE").

To reproduce after design changes: same emulator, wipe app data (or fresh
AVD snapshot), repeat the identical tap sequence. The scripted conversation
path is deterministic (engine is scripted).
