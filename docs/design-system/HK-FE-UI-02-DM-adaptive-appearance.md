# HK-FE-UI-02-DM — Adaptive Appearance (Light / Dark / System)

Status: source complete on `design/hk-fe-ui-02-adaptive-appearance-20261016` (stacked on `design/hk-fe-ui-02-premium` @ `ca9e792`).
Supersedes: HK-FE-UI-02 spec §8 "Light-mode policy" and the IOS-D02 "light-only" native-config rule (both recorded as superseded
below, not silently edited away). Native device certification: **NOT RUN**.

## 1. What the owner gets

Her Keys offers **Light**, **Dark** and **System** in *Your Account → Appearance*.

* Fresh install = **System** (follows the phone, live, while the app is open).
* A manual **Light** or **Dark** choice overrides the phone, in both directions, immediately, with no restart.
* The choice is remembered across restarts, sign-out/sign-in, and account changes. It is a property of **this device**, not of
  an account: it is never sent to Supabase, never part of the household/sync payload, never read by RevenueCat or consent code.
* A missing, corrupt, unreadable, or slow store resolves to **System**; startup never waits on it for more than 1.2 s and account
  initialisation is never gated by it.
* Light mode is the approved HK-FE-UI-02 look and is **pixel-token identical** to before (proved deterministically — §7).

## 2. Architecture (one adaptive design system, not a second app)

```
app/_layout.tsx
 └ SafeAreaProvider
   └ AppearanceProvider  (src/design/theme/ThemeProvider.tsx)   ← preference + resolved scheme + Theme
     ├ SystemChrome      (src/design/theme/SystemChrome.tsx)    ← StatusBar style, system background (expo-system-ui)
     └ ThemedNavigation  (src/design/theme/SystemChrome.tsx)    ← expo-router ThemeProvider with token-derived colours
        └ the existing providers and navigators, unchanged and NOT remounted on a theme change
```

| Module | Role |
|---|---|
| `src/design/theme/appearance.ts` | Pure: preference type, storage key `herkeys.appearance.preference.v1`, `parseStoredPreference` (exact `{"v":1,"preference":…}` shape only), `resolveScheme(preference, device)`, bounded `loadPreference`, `savePreference`. No React, no native imports. |
| `src/design/theme/palettes.ts` | `darkColor` (same token *keys* as Light), `darkElevation`, `lightTheme`/`darkTheme`/`themes`. Light **is** the original `color` export. |
| `src/design/theme/ThemeProvider.tsx` | `AppearanceProvider`, `useAppearance()` (preference + setPreference + scheme), `useTheme()` (resolved tokens). Hydrates once; covers the first frame with an opaque ground-coloured veil until the saved preference is known (no Light flash before a saved Dark). Hands the OS the manual override via `Appearance.setColorScheme` so native alerts, keyboards and the status bar agree. |
| `src/design/theme/createThemedStyles.ts` | `createThemedStyles(factory)` → hook returning a cached StyleSheet per scheme; `themed(factory)` → memoised module-scope helper. |
| `src/platform/appearanceStorage.ts` | The AsyncStorage-backed port (own key). |
| `src/features/account/AppearanceSection.tsx` | The selector (radiogroup). |
| `src/design/tokens.ts` | Unchanged values. Adds the `ColorTokens` type and `flatColors()`; the static `color/colors/elevation/interaction` exports remain as the **Light** definition and are import-restricted (see §6). |

**Resolution:** `scheme = preference === 'system' ? (deviceScheme ?? 'light') : preference`.
**Re-render, not remount:** theme state lives in React context; a change re-renders consumers in place, so navigation state,
scroll positions, text entered in forms, and the auth/consent/purchase flows are preserved (tested: mount counts and local state
survive Light → Dark → System).

### Migration approach (DM-02 … DM-05)

Roughly 126 files read static colour tokens at module scope. `scripts-dev/ui02dm-migrate-theme.mjs` (a TypeScript-AST codemod)
rewrote them mechanically: component bodies call `useTheme()`; module-scope `StyleSheet.create` became `createThemedStyles`
hooks; a handful of module-level constants and helpers (Button, Card, Tag, SegmentBar, system states, intelligence blocks,
DeleteAccountPanel field style, DayInsights, Premium Daily Load, HomeItemRow, the Botanical wave) were converted by hand to take the
theme. `scripts-dev/ui02dm-impact-inventory.mjs` produced the before/after inventory
(`HK-FE-UI-02-DM-impact-inventory.generated.md`). No logic, copy, layout, or state-machine line was changed in feature files; the
non-theme diff lines in account/consent/welcome/onboarding/monetization/app are only: the `}));` closing of a themed style factory,
the provider wiring in `app/_layout.tsx`, and the Appearance section mount in `AccountPanel`.

## 3. Palettes

### Light (locked, unchanged)

Warm Off-White `#FDF8F5` ground · white cards · Soft Lilac `#EADFEA` tint · Deep Plum Gray `#5A3A55` text · Berry Plum `#A24E7A`
action · Dusty Mauve `#C7A6BB` decoration/border/glyph · Luxury Black `#1E1B1D` badge. (Owner brand colours, exact.)

### Dark — "Midnight Plum"

| Role | Value | Note |
|---|---|---|
| background | `#211B25` | Owner candidate. Never pure black. |
| surface.primary / secondary / elevated / tint | `#302633` / `#2A222E` / `#382C3B` / `#403344` | Surface steps carry depth, not shadow. |
| text.primary / secondary / muted / inverse | `#F7F1F6` / `#D1C2D0` / `#B8A6B7` / `#211B25` | Owner candidates for the first two. |
| action.primary (luminous Berry) | `#CC84AC` | **Tuned from the candidate `#BE729C`**: that value is 4.1:1 as *text* on a card, but the same token is the link / secondary-label colour. `#CC84AC` is ≥ 4.5:1 on every surface where Berry text is allowed and gives the filled-button dark-ink label 6:1. Same hue family as Berry (tested within 12°). |
| action.primaryPressed / highlight / onSoft | `#DB9CBD` / `#E6B2CD` / `#E8B3CF` | |
| border.control | `#9C879C` | ≥ 3:1 on background, cards and tint. |
| status (attention / risk / success / waiting / info) | `#E6C07F` / `#F0A698` / `#A8D1B0` / `#CDB8CC` / `#F1E4EF` | Lighter desaturated siblings on deep tinted fills; each still ships with its icon and words. |
| luxury black badge | `#161219` + rim `#6A5A6E`, glyph `#C7A6BB` | Lifted off the ground by a visible rim, still a micro-detail. |
| botanical sage | `#7E9C86 / #5F8A6B / #A8C3AE` | Unchanged, decoration only. |

No new brand hue, **no blue/teal** anywhere (hue-tested over every token), sage never carries meaning.

### Contrast evidence

* `docs/design-system/contrast-matrix.md` — generated; Light and Dark each measure the **same** pair list at 4.5:1 (no large-text
  exemption) and boundaries at 3:1. 152 PASS, 0 FAIL.
* `tests/design-system/contrast.test.mjs` (Light, unchanged) and `contrastDark.test.mjs` (Dark: matrix, boundaries, ground,
  hue, button label rest/pressed, disabled pair, luxury glyph, AI family keys, token-key parity with Light, elevation).
* Rendered audit — `node scripts-dev/ui02-contrast-audit.mjs --scheme light|dark` measures the colour of every text/icon against the
  background actually behind it in every real render the suite produces. Results are in the final report.

## 4. AI truth semantics are preserved in both themes

Meaning is carried by **shape and words**, with colour only reinforcing it:

* unconfirmed reading → **dashed** outline + "HER KEYS NOTICED"
* recommendation → **solid rail** + "HER KEYS RECOMMENDS" (and "NEEDS YOUR YES" when approval is required)
* needs approval → amber hand mark + words
* confirmed → moss check mark

`tests/design-system/darkSemantics.test.mjs` renders all 74 named components/screens under Light and Dark, normalises *only* colour
values and shadow strength, and requires the trees to be identical: same elements, text, accessibility roles/labels/states, border
styles, icons and test ids. It additionally asserts dashed/rail/check structure in both schemes.

## 5. The selector (Your Account → Appearance)

`AppearanceSection` is a labelled `radiogroup` of three `radio` rows (Light, Dark, System), each with `accessibilityHint`,
`accessibilityState={{checked, selected}}`, a minimum 44-pt row, and selection shown by a **filled checkmark glyph and a heavier
outline** (never colour alone). The System row adds a polite live note — "Your phone is currently using Dark." — that updates when
the phone changes. It needs no account and is offered to Free and Premium alike.

**Pre-auth reach.** Settings (Your Account) is reachable only after sign-in, so there is no selector on Welcome/auth/consent. Those
screens are fully themed and follow the saved preference (or System). Adding a pre-auth control is a product decision, not built.

## 6. Guardrails (tests that keep Dark from regressing)

`tests/design-system/themeBoundary.test.mjs`: no `app/` or `src/` file (other than `tokens.ts` and the theme module) imports the
Light-only `color/colors/elevation/interaction` values or contains a hex/rgb(a) literal; no non-visual domain/state/persistence/
monetization/external/data/notifications/config module imports the theme; only `ThemeProvider.tsx` and `SystemChrome.tsx` read the
device scheme, mount the StatusBar or call expo-system-ui; the preference store uses AsyncStorage only, with its own key, and no
backend/account/household/purchase reference; nothing in the persisted household state mentions appearance.

## 7. Light-mode regression proof

`tests/design-system/fixtures/light-baseline.json` holds 74 fully resolved render trees (every shared primitive, every AI register,
badges, decoration, every Welcome/auth scene, onboarding, consent views), captured from the **pre-migration** source `ca9e792`
(`scripts-dev/ui02dm-light-baseline.mjs`). `lightRegression.test.mjs` requires the migrated source to reproduce them exactly:
with no provider, under a Light provider, and under a manual Light choice while the device is Dark; and requires that **no
Light-only colour appears in any Dark tree** and that Dark actually differs in ≥ 60 renders (so the leak test cannot pass vacuously).

## 8. Expo / native configuration

| Item | Change | Needs a new native build? |
|---|---|---|
| `app.json` `userInterfaceStyle` | `light` → `automatic` | **Yes** (Android `uiMode` / manifest) |
| iOS `UIUserInterfaceStyle` | hand-written `Light` removed; resolved plist = `Automatic` | **Yes** |
| `expo-system-ui` | added via `npx expo install` → `~57.0.4` (needed by Android for `userInterfaceStyle` and for the root background) | **Yes** (native module) |
| Status bar | `expo-status-bar` style follows the resolved scheme (`SystemChrome`) | No (JS) |
| Navigation theme | token-derived light/dark theme in `ThemedNavigation` | No (JS) |
| System root background | `expo-system-ui` `setBackgroundColorAsync(ground)` (lazy, failure-tolerant) so overscroll/keyboard resize never flashes the wrong colour | No (JS, module must be in the binary) |
| Splash | `expo-splash-screen` plugin: Light = Warm Off-White + brand tile; `dark` = near-black `#0B0A08` + the original approved artwork | **Yes** |

**Native splash limitation (documented, not hidden).** The launch screen is drawn by the OS before any JavaScript, so it can follow
only the *phone's* appearance, never the app's manual choice. A user who forces Dark on a Light phone sees the Light splash and then
Dark UI (and the reverse). The first React frame is covered by the veil so the hand-over does not flash the wrong ground. The Light
splash uses `assets/splash-brand-tile.png`, a *derived* asset (same approved artwork with rounded transparent corners; produced by
`scripts-dev/ui02dm-make-splash-tile.mjs`, no recolouring) so the brand mark is not a black rectangle on the off-white launch screen.
`lockfile` was re-normalised with npm 10.9.4 (21-line diff) to keep CI's `npm ci` green.

**Not themable by us:** native OS surfaces we do not draw — the RevenueCat/StoreKit/Play purchase sheets, the system permission
dialogs, the Google/Apple sign-in sheets — follow the phone (or the override handed to the OS via `Appearance.setColorScheme`).

## 9. Superseded policies (recorded)

* HK-FE-UI-02 spec §8 "Light-only for this release" → superseded by this document. (The text in §8 is annotated, not deleted.)
* `tests/ios/nativeConfig.test.mjs` IOS-D02 "forced Light" assertions → replaced by the "adaptive appearance" block (automatic style,
  Automatic plist, `expo-system-ui` present, only the provider/system-chrome modules read the scheme, light+dark splash on both
  platforms, derived tile asset is RGBA 512²).

## 10. Integration dependencies (recorded, not cherry-picked)

* RevenueCat repair `8cb841c` and AI-consent PR #30 are **not** in this branch (restricted by the brief). Both touch surfaces this
  work themes only presentationally; when they land, their new/changed `.tsx` files must use `useTheme()`/`createThemedStyles`
  — `themeBoundary.test.mjs` will fail loudly if they import static `color`.
* Account-deletion workstream (#9) is deferred and untouched. Its 8 failing tests, and the 3 `premiumHome` failures, are inherited
  from `ca9e792` and are reported separately in the final report.
