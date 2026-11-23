# Build 5 iPhone Duo UX spec

**Status:**
- **Milestone A** (window-based layout on SDK 57) is implemented and unit-tested.
- **Milestone B** (native rail, hinge, arrangement) needs SDK 58 and was not started.
- **No iPhone Duo, Duo simulator or Xcode 27.1 Device Hub was available, so no row here is native-verified.**

## 1. Sources and their limits

- **Expo, *Supporting iPhone Duo* (2026-10-23):** read. It covers SDK 58 / Xcode 27.1, the 84pt rail inset, the 469pt left Split View window, `NativeTabs` placement, `expo-hinge`, `ArrangementView`, experimental `SplitView`, and orientation locks being a preference on iOS 27.
- **Apple HIG, *Designing for iPhone Duo*:** could not be read (the fetch returned only the page title). Nothing here claims to quote it.
- **Apple screenshot sizes:** outer display 1398 × 2034 px, inner display 2007 × 2853 px.
  - Build 5 *derives* point sizes at an assumed @3x: outer about 466 × 678pt, inner about 669 × 951pt.
  - These are estimates for tests, not device facts.

## 2. How the Duo is classified (Milestone A)

The Duo is the iPhone idiom, so `Platform.isPad` is false on both displays. Build 5 never asks the idiom; it classifies the window.

| Pose / window | Approx. window | Class | Navigation | Content |
|---|---|---|---|---|
| Folded, outer display | 466 × 678 | compact | bottom bar | phone layout, every feature available |
| Unfolded, portrait | 669 × 951 | medium | bottom bar | readable column (not treated as an iPad) |
| Unfolded, landscape | 951 × 669 | expanded | sidebar | one readable column (a primary pane would be under 480pt) |
| Unfolded, landscape, 84pt rail on one side | 867 usable | expanded | sidebar, widened by the leading inset | one column |
| Split View left window | 469 wide | compact | bottom bar | phone layout |

The brief rules out "every unfolded state is an iPad". Here the portrait inner display stays on the bottom bar with one wider readable column.

## 3. Requirements and what Build 5 does

| Requirement | Milestone A | Evidence |
|---|---|---|
| Outer display fully functional | Compact presentation, the same as every iPhone. No feature is hidden at any width. | Class tests; no destination or feature is conditional on width (`build5/adaptiveNavigation`) |
| Inner display adapts | Medium (portrait) and expanded (landscape) rules | `build5/adaptiveLayout` |
| Preserve destination on fold/unfold | One navigator; only options change | Source guard: exactly one `<Tabs>` |
| Preserve selected record, drafts and scroll | `AdaptiveSplit` never remounts its panes. Screen state stays above the split. | Remount tests: drafts in lead, primary and secondary survive compact → expanded → medium → expanded → compact. Mutant M1 (remounting panes) is caught. |
| No network refresh or duplicate subscriptions on a layout change | The adaptive layer imports no store, account, monetization, persistence or network module, and starts no effect | Import guard test |
| No new login, account or household session on a layout change | Providers sit above the navigator and never read window size | Baseline audit §3 |
| No duplicate purchase attempts | The paywall in-flight state stays above the split | `build5/adaptiveNavigation` |
| AI conversation survives | The `TalkItOutView` element stays mounted; only the column style changes | `ipadSupport` (source), the remount test pattern |
| Asymmetric safe areas, rail on either edge | Usable width subtracts left and right separately. `Screen` uses native per-edge `SafeAreaView` padding. The sidebar absorbs its leading inset. | Tests with a rail on the left or right; mutant M5 (symmetric insets) is caught |
| Split View, both sides | A narrow window is compact. Insets are per edge, so a left or right placement pads the correct side. | Class tests. **Native: NT** |
| Partially folded: nothing across the hinge | **Not handled in Milestone A.** Without `expo-hinge`/`ArrangementView` (SDK 58), the hinge position is unknown. The centered dialog sheet appears only on expanded windows. A medium (portrait inner) window keeps a full-width bottom sheet. Either may cross a vertical hinge when partially folded. | **Gap → Milestone B** |
| Rail-aware navigation | **Not in Milestone A.** The JS tab bar does not move into the system rail. Expo discourages custom JS tab bars on Duo. On SDK 58, Expo says custom `TabList`/`Stack` headers "render classically" inside the safe areas. | **Gap → Milestone B (`NativeTabs`)** |
| Orientation | iPhone is declared portrait-only (unchanged, OD-B5-01). On iOS 27 that lock is a preference, and the layout handles any window it is given. | Config tests |

## 4. Milestone B plan (SDK 58, after the migration in `BUILD5_SDK_COMPATIBILITY.md`)

1. Replace the JS `Tabs` with `NativeTabs`, with `preferredPlacement="automatic"` on Duo and `'sidebar'` on iPad. Keep `appTabsScreenOptions` as the compact fallback until the migration is proven. Keep the five destinations.
2. Use `useVerticalBarEdgeIOS()` for any absolutely positioned control. Build 5 has none in the shared shell.
3. Calendar and Today: optionally move `AdaptiveSplit` to `ArrangementView` (split along the fold, stacked otherwise). Keep `AdaptiveSplit` as the fallback for iOS before 27.1.
4. Sheets: use the hinge status to keep dialogs and destructive confirmations off the fold when partially open.
5. Native test pass on the Device Hub Duo: folded, partially open, open, each orientation, Split View on each side, and folding with an unsaved form open.
