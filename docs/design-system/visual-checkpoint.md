# HK-FE-UI-01 — OWNER VISUAL CHECKPOINT

Status: **HK-FE-UI-01 = VISUAL CHECKPOINT** (interim; awaiting owner approval
to continue per section 19). Branch `design/01-front-end-system`, no push, no PR.

## K-series commits so far

| Commit | Content |
|---|---|
| `ac938b8` K0 | Verified owner app.json infrastructure checkpoint (android package, EAS owner/project) — kept out of design commits per entry gate |
| `7e2f80e` K0b | Expo SDK patch drift fixed (owner-authorized 2026-09-20): expo 57.0.24, expo-constants 57.0.19, expo-router 57.0.22. Expo Doctor 20/21 → 21/21 |
| `dfa4e2f` K1 | Inventory + migration ledger + permanent tokens + typography + contrast matrix/test + BEFORE screenshots |
| `0b2c6d1` K2 | Shell refinement + core primitives + system states + gallery + component test floor |
| `d0f121e` K2 | AFTER screenshots (in-app evidence of the system running) |

Entry evidence (all re-verified this build): HEAD `0510e46` → K0 base;
TypeScript green; app tests 705 → 790; backend harness 684/684; shipping
migration SHA-256 `1e9169de…8a7cb` unchanged; baseline SHA-256
`8bc38d66…f16f` unchanged; local fingerprint `199ed4d4…de27` / 3613 facts
unchanged. No foundation file touched except the additive
`gallery: 'internal'` entry in the routing guard table (routing authority
pattern preserved — the guard table remains the single authority).

## Token summary (`src/design/tokens.ts`)

- **Direction**: PAPER AND INK / NEXT CHAPTER. Warm ivory ground `#F7F5F1`
  (preserved), white lifted surfaces, near-black ink `#1F1E1B` (preserved).
- **Accent**: sage `#35594F` → restrained clay `#9C4A2F` (the one
  terracotta-family accent the direction names; the sage-dominant identity is
  explicitly avoided). Deep plum `#4B3241` available as a grounded neutral,
  used sparingly.
- **Semantic groups**: `surface.*`, `text.*`, `action.*`,
  `status.attention/risk/success/waiting`, `ai.insight/inference/
  confirmation/action` (color families reserved for K3's intelligence
  language; meaning never carried by color alone).
- **New**: interaction states (disabled is a real color pair, not opacity),
  motion timing (120/200/320ms, ease-out only), sizing (touch floors, icon
  rungs), opacity states.
- **Persistence rule honored**: tokens are presentation-only; nothing visual
  in AppState/envelope/sync/cloud (designIndependence test still green).
- Legacy flat names kept as aliases so frozen surfaces compile and inherit.

## Typography summary

One permanent hierarchy: display 31/37 · screenTitle 22/29 · sectionTitle &
cardTitle 17/24 · body 15/22 · supporting 14/20 · metadata 13/18 · label
(uppercase eyebrow) · actionLabel · statusLabel. System font only — a custom
display face was evaluated and rejected (Expo loading/licensing complexity,
section 4). Legacy rung names remain as aliases until their surfaces migrate.

## Shell changes

- `Screen`: bottom clearance now inset-aware (tab bar + system nav), keyboard-
  safe tap handling, non-scroll variant.
- Tabs: structure and text-only decision preserved; colors re-valued through
  tokens (active tab now clay).
- `gallery` route registered under the existing `'internal'` guard (same gate
  as dev-tools), wrapped in `Stack.Protected`; gated by `__DEV__`; reachable
  only from dev-tools; no tab entry.

## Shared primitives (all with contract tests)

Refined: Button (disabled = real colors), ChipToggle, Card, Tag, TextField
(3:1 identifying border, explicit focus), Screen, AppText/Overline, StatusList.
New: LoadingState, EmptyState, ErrorState, OfflineState, InlineNotice (fixed
tone union), Sheet, ConfirmationSheet (both paths always labeled).
Component floor: 27 render/props contract tests via react-test-renderer +
esbuild (dev-only, justified in ledger §F; RN stub — layout/visuals verified
in-app, not in unit tests).

## Contrast results

58 measured pairings, **all PASS WCAG AA** (weakest: clay on claySoft 4.85:1;
muted on ivory 6.10:1; inverse on clay 5.82:1; disabled pair 3.91:1 —
stricter than the WCAG exemption). Control-identifying border ≥3:1 on both
adjacent surfaces. Full matrix: `docs/design-system/contrast-matrix.md`,
gated by `tests/design-system/contrast.test.mjs`.

## Screenshots

- BEFORE (9): `docs/design-system/before/` — Welcome, onboarding goals,
  onboarding profile, Today, Life, Talk It Out entry/clarify/result/resolution.
  Reproduction path recorded in `baseline-ui-inventory.md` §7.
- AFTER (11): `docs/design-system/after/` — same surfaces plus the dev gallery
  (palette, type ramp, surfaces, buttons, states, confirmation sheet) and
  onboarding goals with selections.

## Ledger status

`migration-ledger.md` is current: token groups migrated or preserved with
recorded values; primitives MIGRATED/PRESERVED as listed above; screens
Today / Talk It Out / onboarding(goals) / Life remain NOT-STARTED (K4–K7,
after approval); Calendar, Systems and all other feature surfaces PRESERVED
under the design freeze. **Zero REPLACE classifications** — the sage accent
was a token revalue, not a component replacement.

## Unresolved visual questions for the owner

1. **Clay warmth**: is `#9C4A2F` the right register of terracotta, or should
   the accent lean slightly deeper (`#8F4227`) or lighter (`#A85636`)? All
   three pass AA; it's a taste call.
2. **Plum usage**: plum currently appears only in the gallery/AI-insight
   family. Should it carry any recurring product surface (e.g. Her Keys AI
   chrome), or stay reserved?
3. **Selected chip fill**: selected chips are solid clay with ivory text —
   confident and clear, but the strongest color moment in onboarding. Accept,
   or prefer a clay-outline treatment?
4. **SegmentBar tone**: filled load segments now read clay/umber. Keep, or
   should capacity keep a more neutral ink tone so clay stays reserved for
   actions?

## What has NOT started (per section 19)

AI semantic presentation components (K3) and the four screen migrations
(K4–K7) begin only after owner approval.
