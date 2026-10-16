# HK-FE-UI-02 — Phase 3 report: Premium surfaces

Branch `design/hk-fe-ui-02-premium` (stacked on `design/hk-fe-ui-02-core`, PR #28). Presentation only: **no RevenueCat purchase logic,
entitlement check, checkout, reconciliation, identity read, price or trial term was touched**, and none is shown or hard-coded.

## Premium positioning

Premium reads as incrementally more elevated than Free, inside the same system: a small Luxury Black **Premium badge** (a 40 dp disc with
a lighter rim, one glint line and a Dusty Mauve sparkle) beside the existing "Her Keys Premium" tag; Soft-Lilac icon wells for the three
real tools; the same Berry primary button. There is no black surface, no black card and no gloss on any control. A test asserts that the
Daily Load card contains **exactly one** Luxury Black element, the badge.

## Truth structure, per feature

The brief requires each feature to keep its states visually distinct. Labels and copy were **not** changed; structure was added.

| Feature | State | Presentation |
|---|---|---|
| **Daily Load** | Workload observation (pressures, evidence gaps, "what was considered") | Plain text sections, **no AI mark** (a recorded fact is not an AI reading) |
| | Proposed change | Card with the solid Berry rail + lightbulb mark (the recommendation structure) — nothing has happened |
| | User approval | Its own explicit control (`Approve this change` → a separate confirmation sheet stating the scope) — unchanged |
| | Applied change + result | A **receipt** row: neutral receipt glyph and its own sentence, beside **Undo**. Deliberately **not** the solid confirmed check: an undone receipt must not read as confirmed |
| **Smart Inbox** (capture review in Talk It Out) | Submitted source | Plain subtle card (unchanged) |
| | AI extraction awaiting her decision | Dashed outline + `understood` mark + existing eyebrow and confidence badge |
| | Uncertain interpretation / clarification | Dashed outline + `asks` mark |
| | User correction, approved, persisted | Unchanged controls; nothing is shown as saved until the existing flow says so |
| **Momentum** | Recorded observations ("This week") and calculated changes | Plain text |
| | Inferred patterns | **Dashed outline + `noticed` mark** beside the existing tier tag (possible / likely / established words unchanged) |
| | Insufficient evidence | A waiting notice (clock icon) carrying the existing sentence — no pattern, score or accomplishment implied |
| | Next step | Solid Berry rail + lightbulb mark; approval stays a separate action; once approved the existing success sentence appears |
| **Premium Home** (Your Account) | status / tools | Premium badge, per-tool icon wells; status tags, copy and the single Restore control placement unchanged. **No price** anywhere |
| **Paywall** | The RevenueCat paywall is the store's native interface and is not styled by the app. `PaywallNoticeView` already renders through `InlineNotice` (now icon-bearing) | — |

No invented accomplishments, time savings or AI certainty exist in any copy: the copy files were not edited (asserted by the existing
`momentumCopy` and Premium UI tests, which all still pass).

## Tests added

`tests/premiumDomain/dailyLoadUi.test.mjs` (+3) and `momentumUi.test.mjs` (+3): one Luxury Black element only; a proposal carries the
`suggests` mark and never the `confirmed` mark; the review's observations carry no mark; the receipt uses the neutral glyph with Undo and no
`confirmed` mark; Momentum patterns are dashed with the `noticed` mark; the next step has the rail and mark; nothing is `confirmed`; a thin
week is a waiting notice with no marks. All run through the real components and the real stores.

## Evidence (`docs/design-system/evidence/hk-fe-ui-02/phase3/`)

Real Premium components rendered with **fixed, inert api objects built from the real copy builders** (`premiumCopyFor`,
`premiumHomeCopyFor`, `capabilityViews`); no server, store or purchase is involved. Same emulator/Expo Go environment as Phase 2.

| Capture | State |
|---|---|
| `p3-01` Premium Home — active | "Her Keys Premium is on", three tools READY, Manage subscription |
| `p3-02` Premium Home — free | "You're on the Free plan", **See Her Keys Premium**, tools "Part of Her Keys Premium"; no price |
| `p3-03` Premium Home — verification pending | |
| `p3-04` Daily Load card — usable, with a receipt and Undo | |
| `p3-05` Daily Load card — upgrade | |
| `p3-06` / `p3-07` Momentum card — usable / upgrade | |
| `p3-08` Today with the real tab bar | regression check after Phase 3 |

### Not captured (visual verification pending)

The **review sheets** — Daily Load pressures and proposals with the Berry rail, Momentum patterns and next step, the capture review
cards — need a full household review object; they are asserted structurally above but **not rendered visually**. Smart Inbox's capture
cards, the Premium Home *attention/expired/revoked* states, the confirmation sheet, and any native paywall are likewise not captured.
No native Android or iOS build was run. **A real store purchase, restore or subscription state was never exercised.**

## Commercial honesty

No subscription price, introductory trial or active store product is shown or hard-coded anywhere in this workstream. Prices and
approved introductory terms must come from the verified commercial configuration (RevenueCat offering) at runtime; where they are not
available the existing "not available to purchase right now" states render (the three inherited `premiumHome` test failures concern that
copy and are untouched).
