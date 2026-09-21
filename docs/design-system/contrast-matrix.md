# Her Keys — WCAG AA Contrast Matrix

Generated from `src/design/tokens.ts` by `scripts-dev/gen-contrast-matrix.mjs`.
The same pair list is gated by `tests/design-system/contrast.test.mjs` — if the
two disagree, the test wins. Floor: 4.5:1 normal text, 3:1 large text
(display/screenTitle/sectionTitle/cardTitle) and component-identifying boundaries.

Attack list first (§8): muted on ivory, secondary on secondary surfaces, clay
accent text, pastel-family accents, disabled states, AI semantic treatments —
every one measured below, none by eye.

## Text × surface pairings

| Text token | Value | Surface | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| text.primary | #1F1E1B | background | #F7F5F1 | 15.31:1 | PASS |
| text.primary | #1F1E1B | surface.primary | #FFFFFF | 16.67:1 | PASS |
| text.primary | #1F1E1B | surface.secondary | #F0EBE2 | 14.04:1 | PASS |
| text.primary | #1F1E1B | surface.elevated | #FFFFFF | 16.67:1 | PASS |
| text.secondary | #5F5C54 | background | #F7F5F1 | 6.13:1 | PASS |
| text.secondary | #5F5C54 | surface.primary | #FFFFFF | 6.68:1 | PASS |
| text.secondary | #5F5C54 | surface.secondary | #F0EBE2 | 5.62:1 | PASS |
| text.secondary | #5F5C54 | surface.elevated | #FFFFFF | 6.68:1 | PASS |
| text.muted | #625C4E | background | #F7F5F1 | 6.10:1 | PASS |
| text.muted | #625C4E | surface.primary | #FFFFFF | 6.65:1 | PASS |
| text.muted | #625C4E | surface.secondary | #F0EBE2 | 5.60:1 | PASS |
| text.muted | #625C4E | action.primarySoft | #F3E2D7 | 5.28:1 | PASS |
| text.muted | #625C4E | status.attentionSoft | #F6EEDD | 5.76:1 | PASS |
| text.muted | #625C4E | status.successSoft | #E4EBE3 | 5.47:1 | PASS |
| text.muted | #625C4E | status.waitingSoft | #F1EBDD | 5.59:1 | PASS |
| text.muted | #625C4E | ai.insightSoft | #EFE7EC | 5.48:1 | PASS |
| text.muted | #625C4E | ai.confirmationSoft | #E4EBE3 | 5.47:1 | PASS |
| text.muted | #625C4E | ai.actionSoft | #F3E2D7 | 5.28:1 | PASS |
| action.primary | #9C4A2F | background | #F7F5F1 | 5.62:1 | PASS |
| action.primary | #9C4A2F | surface.primary | #FFFFFF | 6.12:1 | PASS |
| action.primary | #9C4A2F | surface.secondary | #F0EBE2 | 5.15:1 | PASS |
| action.primary | #9C4A2F | action.primarySoft | #F3E2D7 | 4.85:1 | PASS |
| status.attention | #6E4C0E | background | #F7F5F1 | 7.13:1 | PASS |
| status.attention | #6E4C0E | surface.primary | #FFFFFF | 7.77:1 | PASS |
| status.attention | #6E4C0E | surface.secondary | #F0EBE2 | 6.54:1 | PASS |
| status.attention | #6E4C0E | status.attentionSoft | #F6EEDD | 6.73:1 | PASS |
| status.risk | #8A3B2C | background | #F7F5F1 | 7.03:1 | PASS |
| status.risk | #8A3B2C | surface.primary | #FFFFFF | 7.66:1 | PASS |
| status.risk | #8A3B2C | surface.secondary | #F0EBE2 | 6.45:1 | PASS |
| status.risk | #8A3B2C | status.riskSoft | #F6E3DC | 6.18:1 | PASS |
| status.success | #33523F | background | #F7F5F1 | 7.97:1 | PASS |
| status.success | #33523F | surface.primary | #FFFFFF | 8.68:1 | PASS |
| status.success | #33523F | surface.secondary | #F0EBE2 | 7.31:1 | PASS |
| status.success | #33523F | status.successSoft | #E4EBE3 | 7.15:1 | PASS |
| status.waiting | #6B5B3E | background | #F7F5F1 | 6.04:1 | PASS |
| status.waiting | #6B5B3E | surface.primary | #FFFFFF | 6.58:1 | PASS |
| status.waiting | #6B5B3E | surface.secondary | #F0EBE2 | 5.54:1 | PASS |
| status.waiting | #6B5B3E | status.waitingSoft | #F1EBDD | 5.54:1 | PASS |
| ai.insight | #4B3241 | background | #F7F5F1 | 10.53:1 | PASS |
| ai.insight | #4B3241 | surface.primary | #FFFFFF | 11.46:1 | PASS |
| ai.insight | #4B3241 | ai.insightSoft | #EFE7EC | 9.45:1 | PASS |
| ai.inference | #6E4C0E | background | #F7F5F1 | 7.13:1 | PASS |
| ai.inference | #6E4C0E | surface.primary | #FFFFFF | 7.77:1 | PASS |
| ai.inference | #6E4C0E | ai.inferenceSoft | #F6EEDD | 6.73:1 | PASS |
| ai.confirmation | #33523F | background | #F7F5F1 | 7.97:1 | PASS |
| ai.confirmation | #33523F | surface.primary | #FFFFFF | 8.68:1 | PASS |
| ai.confirmation | #33523F | ai.confirmationSoft | #E4EBE3 | 7.15:1 | PASS |
| ai.action | #9C4A2F | background | #F7F5F1 | 5.62:1 | PASS |
| ai.action | #9C4A2F | surface.primary | #FFFFFF | 6.12:1 | PASS |
| ai.action | #9C4A2F | ai.actionSoft | #F3E2D7 | 4.85:1 | PASS |
| neutral.deep | #4B3241 | background | #F7F5F1 | 10.53:1 | PASS |
| neutral.deep | #4B3241 | surface.primary | #FFFFFF | 11.46:1 | PASS |
| neutral.deep | #4B3241 | ai.insightSoft | #EFE7EC | 9.45:1 | PASS |
| text.inverse | #FBF9F5 | action.primary | #9C4A2F | 5.82:1 | PASS |

## Component-identifying boundaries (WCAG 1.4.11 — 3:1)

| Boundary | Value | Adjacent | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| border.control | #847B6C | surface.primary | #FFFFFF | 4.17:1 | PASS |
| border.control | #847B6C | background | #F7F5F1 | 3.83:1 | PASS |

## Notes

- Decorative hairlines (border.default/subtle) are intentionally NOT
  component identifiers; no contrast requirement applies beyond not being the
  sole means of identifying a control.
- Disabled (action.disabled / action.disabledText) is WCAG-exempt as an
  inactive component, but the pair is kept at 4.31:1
  on purpose — an unreadable disabled button still frustrates.
- Largest finite radius is 20px; only pills are fully round.

**Overall: ALL PAIRINGS PASS WCAG AA**
