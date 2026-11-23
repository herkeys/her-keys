# Build 5 responsive test matrix

**Legend:**
- **PASS (unit):** proven under the Node harness with the project's react-native stub. No native layout engine is involved.
- **NOT RUN:** not executed. Needs the named host.
- No row is marked PASS for native behavior.

**Host for this build:** Windows 11. No macOS, Xcode, Device Hub, iPad or iPhone Duo.

## 1. Automated (run in this build)

| # | Required focus | Test | Result |
|---|---|---|---|
| 1 | Compact layout | `build5/adaptiveLayout`: classes, Android lock, compact panes add no styles. `lightRegression`: 74 light trees unchanged. | PASS (unit) |
| 2 | Medium layout | `build5/adaptiveLayout`: medium windows never split and never show the sidebar; readable column | PASS (unit) |
| 3 | Expanded layout | `build5/adaptiveLayout`: two panes only when both fit; secondary pane 320–400; workspace cap | PASS (unit) |
| 4 | Runtime window resizing | `build5/adaptiveLayout`: compact → expanded → medium → expanded → compact on one mounted tree | PASS (unit) |
| 5 | Navigation-state preservation | `build5/adaptiveNavigation`: one `<Tabs>`, five destinations, options-only switch | PASS (source + options) |
| 6 | Form-state preservation | `build5/adaptiveLayout`: drafts in lead, primary and secondary survive every resize. Mutant M1 is caught. | PASS (unit) |
| 7 | Asymmetric safe-area padding | `build5/adaptiveLayout`: rail on the left or right, sidebar absorbs the leading inset, `Screen` edges, bottom inset. Mutants M3 and M5 are caught. | PASS (unit) |
| 8 | Sidebar collapse/expansion | `build5/adaptiveNavigation`: bottom bar is byte-equal to pre-Build-5; sidebar options; 2x text returns to the bottom bar | PASS (unit) |
| 9 | Modal sizing | `ios/ipadSupport`: compact/Android sheet unchanged, medium capped card, expanded dialog | PASS (unit) |
| 10 | Keyboard avoidance | `ios/keyboardInsets` (existing) and `Screen` keeps `automaticallyAdjustKeyboardInsets` | PASS (source). Native: NOT RUN |
| 11 | Dynamic Type | `build5/adaptiveLayout`: divisor, two panes at 1.35x, one column at 1.6x, medium at 2x; sidebar labels scale. Mutant M4 is caught. | PASS (unit) |
| 12 | Light/dark appearance | `build5/adaptiveNavigation`: sidebar selected and resting contrast ≥ 4.5:1 in both themes; `lightRegression`; `contrastDark` | PASS (unit) |
| 13 | Orientation changes | Class tests on portrait/landscape pairs; `ios/ipadSupport` orientation plist | PASS (unit). Native: NOT RUN |
| 14 | Account isolation during navigation changes | `build5/adaptiveNavigation`: the adaptive layer imports no store/account/monetization/persistence/network; providers above the navigator (baseline audit §3); paywall state above the split | PASS (source) |
| 15 | Android compatibility | `build5/adaptiveLayout` Android lock (phone, tablet, foldable); platform-parity registry PC-B5-01; Android export | PASS (unit + export). Device: NOT RUN |

**Mutation check:** 5 of 5 mutants caught:
- M1: panes remount
- M2: Android adaptive
- M3: sidebar ignores the inset
- M4: Dynamic Type ignored
- M5: symmetric insets

**Full suite:** see `BUILD5_RELEASE_READINESS.md`.

## 2. Native matrix: NOT RUN (handoff)

**Requirements:**
- macOS with Xcode 26.6 (SDK 57) for iPhone and iPad.
- Xcode 27.1 Device Hub for iPhone Duo. It needs an SDK 58 build to exercise the Duo APIs. A Milestone A build can still be run on the Duo simulator to check the window-based layout.
- A development build. Expo Go cannot mount the app root (expo-notifications needs a native module).

| Device or configuration | Scenarios | Status |
|---|---|---|
| Standard iPhone | Portrait; all five destinations; core workflows (below) | NOT RUN |
| iPhone Pro Max | Portrait; AX text sizes; forms | NOT RUN |
| iPhone Duo, folded | Outer display; every primary action; bottom bar | NOT RUN |
| iPhone Duo, unfolded | Portrait (medium, bottom bar) and landscape (sidebar) | NOT RUN |
| iPhone Duo, partially folded | Sheets and dialogs vs the hinge (**known gap**, Milestone B) | NOT RUN |
| iPhone Duo, landscape | Rail placement vs the JS tab bar (**known gap**, Milestone B) | NOT RUN |
| iPhone Duo, Split View | Left and right windows; asymmetric insets | NOT RUN |
| iPhone Duo, transition | Fold/unfold with an unsaved task form, a Talk It Out draft, a Calendar preview | NOT RUN |
| iPad mini | Portrait (medium) and landscape (two panes) | NOT RUN |
| iPad 11-inch | Portrait, landscape, 1/3, 1/2 and 2/3 Split View, Slide Over | NOT RUN |
| iPad 13-inch | Portrait (sidebar, one column), landscape (two panes), Stage Manager resizing through every breakpoint | NOT RUN |
| Android phone | Shared-component regression (bottom bar, Screen, Sheet, consent) | NOT RUN (export only) |

**Interaction tests, for each row above:**
- sign in (Apple, Google, email)
- onboarding
- Calendar day selection
- edit an event
- edit a task
- open and close every sheet
- an AI conversation with streaming
- complete One Move
- connect Google Calendar
- open the Premium paywall
- Restore Purchases
- open account deletion
- background → foreground on each tab
- fold/unfold or resize with a form open
- sign out or switch accounts while a two-pane layout is showing

**Evidence to keep:**
- a screenshot per row
- the Metro first log line (to prove the right checkout, see the worktree gotchas)
- the device and OS build
