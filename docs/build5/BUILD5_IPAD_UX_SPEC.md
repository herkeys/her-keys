# Build 5 iPad UX spec (as implemented)

This describes what Build 5 implemented, not intentions. Where something was not built it says so. Nothing here has been seen on an iPad or simulator yet (`BUILD5_RESPONSIVE_TEST_MATRIX.md`).

## 1. Principle

One meaningful thing at a time, with more room. A wide window shows related information together, and adds no new cards, statistics or controls. Every surface uses the existing tokens:
- palette, type scale and radii
- the light and dark themes
- the Soft Lilac / on-soft berry pairing for selected rows

## 2. Size classes: the window decides, not the device

`src/design/adaptive/sizeClass.ts`. Usable width is the window width minus the left and right insets, divided by the Dynamic Type scale (capped at 2x).

| Class | Usable width | Navigation | Content |
|---|---|---|---|
| compact | < 600 | bottom tab bar (unchanged) | one column, exactly as before Build 5 |
| medium | 600 to 839 | bottom tab bar | one column, readable 680pt measure, bottom sheet capped at 680 |
| expanded | ≥ 840 | **leading sidebar** | two panes where a screen defines them and the primary pane can be at least 480pt × text scale. Otherwise one readable column. Sheets become centered dialog cards. |

**Typical iPad windows, in points** (Apple logical sizes; not device-verified):

| Window | Class | Layout |
|---|---|---|
| iPad mini, portrait (744) | medium | bottom bar, one column |
| iPad mini, landscape (1133) | expanded | sidebar, **two panes** (primary about 501) |
| iPad 11-inch, portrait (834) | medium | bottom bar, one column |
| iPad 11-inch, landscape (1194) | expanded | sidebar, **two panes** |
| iPad 13-inch, portrait (1032) | expanded | sidebar, one readable column (primary would be under 480) |
| iPad 13-inch, landscape (1376) | expanded | sidebar, **two panes** (secondary about 395) |
| Split View: 1/3 window (320) | compact | phone layout |
| Split View: 1/2 window (678) | medium | bottom bar, one column |
| Small Stage Manager window (560) | compact | phone layout |

**At larger text sizes:**
- A 13-inch landscape iPad keeps two panes at xxxL (1.35x).
- It drops to one column at 1.6x.
- It drops to medium (the bottom bar returns) at 2x.

Larger text makes the layout simpler, never denser.

## 3. Navigation

`app/(app)/_layout.tsx` and `src/design/adaptive/appTabs.tsx`.

- **One `Tabs` navigator in every class.** Only its screen options change. Because of that, a resize, rotation, Split View change or Stage Manager drag keeps:
  - the selected destination
  - each tab's stack (Life → Kids → a record)
  - every mounted screen
- **Expanded windows:** `tabBarPosition: 'left'`, the UIKit sidebar variant with labels beside the icons.
  - 240pt wide, plus any leading inset it absorbs.
  - Rows are at least 44pt.
  - Labels scale with Dynamic Type, because the sidebar has no fixed height.
  - The selected row is on-soft berry on Soft Lilac, and resting rows are secondary text on the surface. Both are at least 4.5:1 in light and dark (tested).
- **Compact and medium:** the bottom bar's options are identical to the pre-Build-5 options (tested field by field).
- **Destinations:** the same five, in the same order: Today, Life, Calendar, Systems, AI. No feature hierarchy differs between devices.
- **Not done:** native iPadOS `UITabBarController` sidebar. That needs SDK 58 `NativeTabs` (`BUILD5_SDK_COMPATIBILITY.md`).

## 4. Screens

`AdaptiveSplit` renders `lead` (full width), `primary` and `secondary`. It never remounts its content: the panes are keyed children of one container in every layout.

### Today
- **Lead:** the header, with the persistence and sync notices and the account entry.
- **Primary:** the load meter, weather and the composed briefing sections, in the order the view model chose. This includes One Move and the Daily Load decision.
- **Secondary:** tomorrow's reminder, Momentum (Premium) and the Talk It Out entry.
- **Stacked:** the exact pre-Build-5 order.

### Calendar
- **Lead:** the title, the demo tag, Add event, the degraded notice, the Day/Week switch and the day navigator.
- **Primary:** the week overview (Week view) or the day schedule (Day view).
- **Secondary:**
  - the Google Calendar panel
  - an open preview, so a proposed move is read beside the schedule it changes
  - the "preview is gone" line
  - in two-pane Day view only, the week around the selected day as context. Choosing a day there selects it and stays in Day view.
- **Stacked:** lead, secondary, primary. This is the pre-Build-5 order.
- **Unchanged:** presentation state (view, selected date, preview, busy flag) lives in `ReadyCalendar` above the split. Calendar math, date selection, ownership routing (co-parent handoffs) and editing are untouched.

### Life hub
- **Lead:** the title and the Needs Me quick-add. The lead never moves, so a half-typed capture survives a resize.
- **Primary:** Where things stand.
- **Secondary:** Just for you (owner-private areas: counts and dates only, as before).

### Systems hub
- **Primary:** the Systems hub.
- **Secondary:** the Premium card, when not entitled.
- The paywall action and its in-flight state live above the split, so a resize while the paywall is open cannot start a second one.

### AI / Talk It Out
- A readable 680pt column on windows wider than compact.
- The conversation view stays mounted in every layout, so the conversation, streaming state and composer draft survive a resize.
- **Not built:** the optional context panel (owner decision OD-B5-02).

### Consent, Welcome, sign-in, account, deletion, onboarding, editors, OCR and Life Admin
- Readable column on wider-than-compact windows.
- Expanded windows show `Sheet` as a centered dialog card: 560pt maximum, every corner rounded, no drag handle. The scrim and the explicit buttons still close it.

### Household modules (Kids, Home, Money, Meals, Work, Co-parenting)
- Readable column only. List/detail is **not built** in Build 5 (baseline audit §6).

## 5. Landscape and multitasking

- iPad already declares all four orientations and does not require full screen (unchanged).
- Layout follows the window on every render. It never uses a device check, an orientation lock or `Platform.isPad`.
- External keyboard, pointer and trackpad: no custom handling was added. The sidebar rows are standard navigator buttons, and nothing relies on hover. **NT.**
