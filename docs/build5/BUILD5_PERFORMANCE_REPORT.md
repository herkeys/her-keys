# Build 5 performance report

**Verdict:**
- No measurable cost on the JavaScript side, using the dense household fixtures.
- **Device performance (startup, frame times, memory, fold/rotate transitions) was NOT VERIFIED.** There is no device.

## 1. What Build 5 adds at runtime

| Work | When | Cost |
|---|---|---|
| `computeAdaptiveLayout` | Each render of a component using `useAdaptiveLayout`, memoized on width, height, font scale and the four insets | **0.00038 ms** median per call |
| Re-render on resize | `Screen`, `Sheet`, `AdaptiveSplit`, the tabs layout, `ReadyCalendar`, the Life and Systems hubs, consent, the AI frames | Only when the window, font scale or insets change. Pane content is passed as elements, so a resize re-renders the split's wrappers, not the briefing sections. Calendar re-renders `ReadyCalendar`, whose projections are memoized. |
| Calendar context week | Two-pane Day view only | One extra `projectCalendarWeek` per state or date change (below) |
| Providers | — | None. No provider reads window size, so a resize cannot remount account, household, consent, RevenueCat or AI state. |
| Network | — | None. The adaptive layer imports no store or network module (guard test). |

## 2. Measurements

Probe: Node 24.14 main-thread CPU, medians of 5 runs of at least 100 ms each. It uses the `calendarPerformance` dense fixture: 30 commitments and 10 tasks a day for 7 days. Run on the Windows host. The numbers show relative cost, not device latency.

| Measurement | Median |
|---|---|
| Day projection (compact Day view; unchanged) | 0.377 ms |
| Week projection | 1.879 ms |
| Two-pane Day view: day + context week | 1.787 ms (within noise of the week alone) |
| Existing product budgets | single day < 50 ms; seven days < 150 ms (unchanged and still met; `calendarPerformance` passes in the full suite) |

No budget was changed and no performance test was weakened.

## 3. Not verified (device handoff)

Measure these on an iPad 13-inch, an iPad mini and an iPhone Duo, before and after, with Instruments (Time Profiler, Allocations) and the React Native perf monitor:
- cold start to the first Today frame
- Calendar Day ↔ Week switch
- a 500-row household list scroll
- AI streaming with 50 messages
- the tab switch
- rotation and Stage Manager resizing through the 600 and 840 breakpoints
- fold/unfold
- memory after 10 resizes, which should show no growth from remounts

Report NOT VERIFIED until these are run.
