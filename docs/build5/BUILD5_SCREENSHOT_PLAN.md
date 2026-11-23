# Build 5 screenshot plan

**Status:**
- This is a plan only. No screenshot was captured, generated or uploaded.
- Build 4's App Store Connect assets are untouched.
- Capture only after the native matrix in `BUILD5_RESPONSIVE_TEST_MATRIX.md` passes on the final UI.

## 1. Sizes

Reference: App Store Connect screenshot specifications (developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). Re-check the page on capture day.

| Set | Size (px) | Requirement status (per the Build 5 brief, as of November 2026) |
|---|---|---|
| iPhone 6.9-inch (current required iPhone size) | the size Apple lists on capture day | Required |
| iPad 13-inch | 2064 × 2752 or 2752 × 2064 | Required for an iPad-supporting app |
| iPhone Duo, outer display | 1398 × 2034 or 2034 × 1398 | **Not yet required.** Apple says it becomes required in April 2027 for apps built with the iOS 27.1 SDK or later. Prepared early. |
| iPhone Duo, inner display | 2007 × 2853 or 2853 × 2007 | Same as above |

- Build 5 still builds with the iOS 26 SDK (SDK 57, Xcode 26.6).
- The Duo sets are not a submission requirement for Build 5. Do not describe them as one.

## 2. Shot list

Every shot is a real implemented screen, and each one is exported individually. Use only the **demo household** (`state.origin === 'demo'`, labelled in Calendar) or a dedicated Staging screenshot account. Never use real customer records.

| # | Screen | iPhone | iPad 13 (landscape) | Duo outer | Duo inner |
|---|---|---|---|---|---|
| 1 | Today: briefing, One Move, Daily Load | ✓ | two panes + sidebar | ✓ | portrait, readable column |
| 2 | Calendar: day schedule beside the preview and the week | ✓ (stacked) | two panes | ✓ | landscape, sidebar |
| 3 | Life hub: household beside Just for you | ✓ | two panes | ✓ | ✓ |
| 4 | Talk It Out conversation | ✓ | readable column | ✓ | ✓ |
| 5 | Systems hub | ✓ | two panes | — | — |
| 6 | Sheet as a dialog (a confirmation) | — | ✓ | — | — |

**Claims to avoid:**
- no "works with" wording for Google Calendar beyond what is shipped
- no Premium feature shown as available while `checkout_enabled` is false
- no Duo rail or hinge features (Milestone B is not built)

## 3. Capture procedure (macOS)

1. Build a development or preview build from the Build 5 candidate SHA.
2. Use the simulator or Device Hub at exact device sizes. Set the status bar with `xcrun simctl status_bar … override`.
3. Seed the demo household.
4. Capture with `xcrun simctl io <device> screenshot`.
5. Verify every file's pixel dimensions against the table.
6. Store the files under `release-evidence/build5/screenshots/<set>/` (local, not committed until reviewed).
