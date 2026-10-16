# Her Keys — WCAG AA Contrast Matrix (HK-FE-UI-02)

Generated from `src/design/tokens.ts` by `scripts-dev/gen-contrast-matrix.mjs`, using the pair list in
`tests/design-system/contrastPairs.mjs`. The same list is gated by `tests/design-system/contrast.test.mjs`.
Floor: **4.5:1 for every text pairing (no large-text exemption)** and 3:1 for component-identifying boundaries.

Supersedes the HK-FE-UI-01 clay/ivory matrix. Anything not listed is **not** an allowed pairing.

Two schemes are measured with the SAME pair list: **Light** (the approved, locked set) and **Dark** (HK-FE-UI-02-DM, Midnight Plum).
The Dark section is gated by `tests/design-system/contrastDark.test.mjs`; the Light section by `contrast.test.mjs`.

# LIGHT scheme

## Owner-pinned measurements

| Pairing | Ratio | Rule it creates |
|---|---|---|
| Berry Plum #A24E7A on Warm Off-White #FDF8F5 | 5.10:1 | Berry text is legal on off-white, white and the lilac wash |
| Dusty Mauve #C7A6BB on Warm Off-White | 2.08:1 | **Never ordinary text.** Decoration, borders, icon wells only |
| Deep Plum Gray #5A3A55 on Warm Off-White | 9.18:1 | The principal text anchor |
| Berry Plum on Soft Lilac Gray #EADFEA | 4.16:1 | **Berry is NOT legal for small text on Soft Lilac** — use `action.onSoft` or `text.primary` |

## Text × surface pairings

| Text token | Value | Surface | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| text.primary | #5A3A55 | background | #FDF8F5 | 9.18:1 | PASS |
| text.primary | #5A3A55 | surface.primary | #FFFFFF | 9.67:1 | PASS |
| text.primary | #5A3A55 | surface.secondary | #F6EEF4 | 8.50:1 | PASS |
| text.primary | #5A3A55 | surface.elevated | #FFFFFF | 9.67:1 | PASS |
| text.primary | #5A3A55 | surface.tint | #EADFEA | 7.48:1 | PASS |
| text.primary | #5A3A55 | status.infoSoft | #F6EEF4 | 8.50:1 | PASS |
| text.primary | #5A3A55 | ai.insightSoft | #F6EEF4 | 8.50:1 | PASS |
| text.secondary | #6A4D64 | background | #FDF8F5 | 6.97:1 | PASS |
| text.secondary | #6A4D64 | surface.primary | #FFFFFF | 7.35:1 | PASS |
| text.secondary | #6A4D64 | surface.secondary | #F6EEF4 | 6.46:1 | PASS |
| text.secondary | #6A4D64 | surface.elevated | #FFFFFF | 7.35:1 | PASS |
| text.secondary | #6A4D64 | surface.tint | #EADFEA | 5.68:1 | PASS |
| text.muted | #6F5669 | background | #FDF8F5 | 6.20:1 | PASS |
| text.muted | #6F5669 | surface.primary | #FFFFFF | 6.54:1 | PASS |
| text.muted | #6F5669 | surface.secondary | #F6EEF4 | 5.75:1 | PASS |
| text.muted | #6F5669 | surface.elevated | #FFFFFF | 6.54:1 | PASS |
| text.muted | #6F5669 | surface.tint | #EADFEA | 5.06:1 | PASS |
| text.muted | #6F5669 | status.attentionSoft | #F8EFDD | 5.72:1 | PASS |
| text.muted | #6F5669 | status.successSoft | #E7EEE6 | 5.53:1 | PASS |
| text.muted | #6F5669 | status.waitingSoft | #EFE8EE | 5.43:1 | PASS |
| text.muted | #6F5669 | status.infoSoft | #F6EEF4 | 5.75:1 | PASS |
| text.muted | #6F5669 | ai.insightSoft | #F6EEF4 | 5.75:1 | PASS |
| text.muted | #6F5669 | ai.confirmationSoft | #E7EEE6 | 5.53:1 | PASS |
| text.muted | #6F5669 | ai.actionSoft | #F6EEF4 | 5.75:1 | PASS |
| action.primary | #A24E7A | background | #FDF8F5 | 5.10:1 | PASS |
| action.primary | #A24E7A | surface.primary | #FFFFFF | 5.37:1 | PASS |
| action.primary | #A24E7A | surface.secondary | #F6EEF4 | 4.72:1 | PASS |
| action.primary | #A24E7A | surface.elevated | #FFFFFF | 5.37:1 | PASS |
| action.primary | #A24E7A | ai.actionSoft | #F6EEF4 | 4.72:1 | PASS |
| action.onSoft | #873F65 | background | #FDF8F5 | 6.80:1 | PASS |
| action.onSoft | #873F65 | surface.primary | #FFFFFF | 7.17:1 | PASS |
| action.onSoft | #873F65 | surface.secondary | #F6EEF4 | 6.30:1 | PASS |
| action.onSoft | #873F65 | surface.elevated | #FFFFFF | 7.17:1 | PASS |
| action.onSoft | #873F65 | surface.tint | #EADFEA | 5.54:1 | PASS |
| action.onSoft | #873F65 | action.primarySoft | #EADFEA | 5.54:1 | PASS |
| action.disabledText | #6F5669 | action.disabled | #E6DAE3 | 4.83:1 | PASS |
| status.attention | #6E4C0E | background | #FDF8F5 | 7.37:1 | PASS |
| status.attention | #6E4C0E | surface.primary | #FFFFFF | 7.77:1 | PASS |
| status.attention | #6E4C0E | surface.secondary | #F6EEF4 | 6.83:1 | PASS |
| status.attention | #6E4C0E | status.attentionSoft | #F8EFDD | 6.80:1 | PASS |
| status.risk | #8A3B2C | background | #FDF8F5 | 7.26:1 | PASS |
| status.risk | #8A3B2C | surface.primary | #FFFFFF | 7.66:1 | PASS |
| status.risk | #8A3B2C | surface.secondary | #F6EEF4 | 6.73:1 | PASS |
| status.risk | #8A3B2C | status.riskSoft | #F9E8E4 | 6.45:1 | PASS |
| status.success | #33523F | background | #FDF8F5 | 8.23:1 | PASS |
| status.success | #33523F | surface.primary | #FFFFFF | 8.68:1 | PASS |
| status.success | #33523F | surface.secondary | #F6EEF4 | 7.63:1 | PASS |
| status.success | #33523F | status.successSoft | #E7EEE6 | 7.34:1 | PASS |
| status.waiting | #66516A | background | #FDF8F5 | 6.75:1 | PASS |
| status.waiting | #66516A | surface.primary | #FFFFFF | 7.12:1 | PASS |
| status.waiting | #66516A | surface.secondary | #F6EEF4 | 6.26:1 | PASS |
| status.waiting | #66516A | status.waitingSoft | #EFE8EE | 5.91:1 | PASS |
| status.info | #5A3A55 | background | #FDF8F5 | 9.18:1 | PASS |
| status.info | #5A3A55 | surface.primary | #FFFFFF | 9.67:1 | PASS |
| status.info | #5A3A55 | status.infoSoft | #F6EEF4 | 8.50:1 | PASS |
| ai.insight | #5A3A55 | background | #FDF8F5 | 9.18:1 | PASS |
| ai.insight | #5A3A55 | surface.primary | #FFFFFF | 9.67:1 | PASS |
| ai.insight | #5A3A55 | ai.insightSoft | #F6EEF4 | 8.50:1 | PASS |
| ai.inference | #6E4C0E | background | #FDF8F5 | 7.37:1 | PASS |
| ai.inference | #6E4C0E | surface.primary | #FFFFFF | 7.77:1 | PASS |
| ai.inference | #6E4C0E | ai.inferenceSoft | #F8EFDD | 6.80:1 | PASS |
| ai.confirmation | #33523F | background | #FDF8F5 | 8.23:1 | PASS |
| ai.confirmation | #33523F | surface.primary | #FFFFFF | 8.68:1 | PASS |
| ai.confirmation | #33523F | ai.confirmationSoft | #E7EEE6 | 7.34:1 | PASS |
| ai.action | #A24E7A | background | #FDF8F5 | 5.10:1 | PASS |
| ai.action | #A24E7A | surface.primary | #FFFFFF | 5.37:1 | PASS |
| ai.action | #A24E7A | ai.actionSoft | #F6EEF4 | 4.72:1 | PASS |
| neutral.deep | #5A3A55 | background | #FDF8F5 | 9.18:1 | PASS |
| neutral.deep | #5A3A55 | surface.primary | #FFFFFF | 9.67:1 | PASS |
| neutral.deep | #5A3A55 | ai.insightSoft | #F6EEF4 | 8.50:1 | PASS |
| text.inverse | #FFFFFF | action.primary | #A24E7A | 5.37:1 | PASS |
| text.inverse | #FFFFFF | action.primaryPressed | #873F65 | 7.17:1 | PASS |
| luxury.glyph | #C7A6BB | luxury.black | #1E1B1D | 7.81:1 | PASS |

## Component-identifying boundaries (WCAG 1.4.11 — 3:1)

| Boundary | Value | Adjacent | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| border.control | #86627D | background | #FDF8F5 | 4.91:1 | PASS |
| border.control | #86627D | surface.primary | #FFFFFF | 5.18:1 | PASS |
| border.control | #86627D | surface.tint | #EADFEA | 4.00:1 | PASS |

# DARK scheme (Midnight Plum)

Same pairings, same floors. Dark values come from `src/design/theme/palettes.ts`.

## Text × surface pairings (Dark)

| Text token | Value | Surface | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| text.primary | #F7F1F6 | background | #211B25 | 15.12:1 | PASS |
| text.primary | #F7F1F6 | surface.primary | #302633 | 13.01:1 | PASS |
| text.primary | #F7F1F6 | surface.secondary | #2A222E | 13.81:1 | PASS |
| text.primary | #F7F1F6 | surface.elevated | #382C3B | 11.85:1 | PASS |
| text.primary | #F7F1F6 | surface.tint | #403344 | 10.63:1 | PASS |
| text.primary | #F7F1F6 | status.infoSoft | #2E2533 | 13.21:1 | PASS |
| text.primary | #F7F1F6 | ai.insightSoft | #2B2230 | 13.73:1 | PASS |
| text.secondary | #D1C2D0 | background | #211B25 | 9.89:1 | PASS |
| text.secondary | #D1C2D0 | surface.primary | #302633 | 8.51:1 | PASS |
| text.secondary | #D1C2D0 | surface.secondary | #2A222E | 9.03:1 | PASS |
| text.secondary | #D1C2D0 | surface.elevated | #382C3B | 7.75:1 | PASS |
| text.secondary | #D1C2D0 | surface.tint | #403344 | 6.95:1 | PASS |
| text.muted | #B8A6B7 | background | #211B25 | 7.35:1 | PASS |
| text.muted | #B8A6B7 | surface.primary | #302633 | 6.33:1 | PASS |
| text.muted | #B8A6B7 | surface.secondary | #2A222E | 6.71:1 | PASS |
| text.muted | #B8A6B7 | surface.elevated | #382C3B | 5.77:1 | PASS |
| text.muted | #B8A6B7 | surface.tint | #403344 | 5.17:1 | PASS |
| text.muted | #B8A6B7 | status.attentionSoft | #3A3022 | 5.64:1 | PASS |
| text.muted | #B8A6B7 | status.successSoft | #243229 | 5.87:1 | PASS |
| text.muted | #B8A6B7 | status.waitingSoft | #33293A | 6.04:1 | PASS |
| text.muted | #B8A6B7 | status.infoSoft | #2E2533 | 6.42:1 | PASS |
| text.muted | #B8A6B7 | ai.insightSoft | #2B2230 | 6.68:1 | PASS |
| text.muted | #B8A6B7 | ai.confirmationSoft | #243229 | 5.87:1 | PASS |
| text.muted | #B8A6B7 | ai.actionSoft | #2B2230 | 6.68:1 | PASS |
| action.primary | #CC84AC | background | #211B25 | 5.98:1 | PASS |
| action.primary | #CC84AC | surface.primary | #302633 | 5.14:1 | PASS |
| action.primary | #CC84AC | surface.secondary | #2A222E | 5.46:1 | PASS |
| action.primary | #CC84AC | surface.elevated | #382C3B | 4.69:1 | PASS |
| action.primary | #CC84AC | ai.actionSoft | #2B2230 | 5.43:1 | PASS |
| action.onSoft | #E8B3CF | background | #211B25 | 9.44:1 | PASS |
| action.onSoft | #E8B3CF | surface.primary | #302633 | 8.12:1 | PASS |
| action.onSoft | #E8B3CF | surface.secondary | #2A222E | 8.62:1 | PASS |
| action.onSoft | #E8B3CF | surface.elevated | #382C3B | 7.40:1 | PASS |
| action.onSoft | #E8B3CF | surface.tint | #403344 | 6.64:1 | PASS |
| action.onSoft | #E8B3CF | action.primarySoft | #403344 | 6.64:1 | PASS |
| action.disabledText | #AD9BAD | action.disabled | #3A2F3D | 4.88:1 | PASS |
| status.attention | #E6C07F | background | #211B25 | 9.78:1 | PASS |
| status.attention | #E6C07F | surface.primary | #302633 | 8.42:1 | PASS |
| status.attention | #E6C07F | surface.secondary | #2A222E | 8.93:1 | PASS |
| status.attention | #E6C07F | status.attentionSoft | #3A3022 | 7.51:1 | PASS |
| status.risk | #F0A698 | background | #211B25 | 8.50:1 | PASS |
| status.risk | #F0A698 | surface.primary | #302633 | 7.32:1 | PASS |
| status.risk | #F0A698 | surface.secondary | #2A222E | 7.77:1 | PASS |
| status.risk | #F0A698 | status.riskSoft | #3C2527 | 7.14:1 | PASS |
| status.success | #A8D1B0 | background | #211B25 | 9.94:1 | PASS |
| status.success | #A8D1B0 | surface.primary | #302633 | 8.56:1 | PASS |
| status.success | #A8D1B0 | surface.secondary | #2A222E | 9.08:1 | PASS |
| status.success | #A8D1B0 | status.successSoft | #243229 | 7.94:1 | PASS |
| status.waiting | #CDB8CC | background | #211B25 | 9.07:1 | PASS |
| status.waiting | #CDB8CC | surface.primary | #302633 | 7.81:1 | PASS |
| status.waiting | #CDB8CC | surface.secondary | #2A222E | 8.29:1 | PASS |
| status.waiting | #CDB8CC | status.waitingSoft | #33293A | 7.45:1 | PASS |
| status.info | #F1E4EF | background | #211B25 | 13.69:1 | PASS |
| status.info | #F1E4EF | surface.primary | #302633 | 11.78:1 | PASS |
| status.info | #F1E4EF | status.infoSoft | #2E2533 | 11.96:1 | PASS |
| ai.insight | #EBDDE9 | background | #211B25 | 12.86:1 | PASS |
| ai.insight | #EBDDE9 | surface.primary | #302633 | 11.06:1 | PASS |
| ai.insight | #EBDDE9 | ai.insightSoft | #2B2230 | 11.68:1 | PASS |
| ai.inference | #E6C07F | background | #211B25 | 9.78:1 | PASS |
| ai.inference | #E6C07F | surface.primary | #302633 | 8.42:1 | PASS |
| ai.inference | #E6C07F | ai.inferenceSoft | #3A3022 | 7.51:1 | PASS |
| ai.confirmation | #A8D1B0 | background | #211B25 | 9.94:1 | PASS |
| ai.confirmation | #A8D1B0 | surface.primary | #302633 | 8.56:1 | PASS |
| ai.confirmation | #A8D1B0 | ai.confirmationSoft | #243229 | 7.94:1 | PASS |
| ai.action | #CC84AC | background | #211B25 | 5.98:1 | PASS |
| ai.action | #CC84AC | surface.primary | #302633 | 5.14:1 | PASS |
| ai.action | #CC84AC | ai.actionSoft | #2B2230 | 5.43:1 | PASS |
| neutral.deep | #F1E4EF | background | #211B25 | 13.69:1 | PASS |
| neutral.deep | #F1E4EF | surface.primary | #302633 | 11.78:1 | PASS |
| neutral.deep | #F1E4EF | ai.insightSoft | #2B2230 | 12.43:1 | PASS |
| text.inverse | #211B25 | action.primary | #CC84AC | 5.98:1 | PASS |
| text.inverse | #211B25 | action.primaryPressed | #DB9CBD | 7.61:1 | PASS |
| luxury.glyph | #C7A6BB | luxury.black | #161219 | 8.46:1 | PASS |

## Component-identifying boundaries (Dark — 3:1)

| Boundary | Value | Adjacent | Value | Ratio | Verdict |
|---|---|---|---|---|---|
| border.control | #9C879C | background | #211B25 | 5.09:1 | PASS |
| border.control | #9C879C | surface.primary | #302633 | 4.38:1 | PASS |
| border.control | #9C879C | surface.tint | #403344 | 3.58:1 | PASS |

## Notes

- Decorative hairlines (border.default/subtle) and Dusty Mauve edges are intentionally NOT component identifiers; no
  contrast requirement applies beyond not being the sole means of identifying a control. A secondary button is identified
  by its (4.5:1+) label and pill shape, a text field by `border.control` (above).
- Disabled (action.disabled / action.disabledText) is WCAG-exempt as an inactive component, but the pair is kept at
  4.83:1 on purpose — an unreadable disabled button still frustrates.
- The primary button highlight and lower edge are opaque colours, so the rendered treatment cannot change under reduced
  transparency; text sits on the Berry body (5.37:1) and on the pressed fill
  (7.17:1).
- Gradients: none are used. Overlays: the only translucent layer is the sheet scrim, which never sits behind text we measure.
- Largest finite radius is 20px; only pills are fully round.

**Overall: ALL PAIRINGS PASS WCAG AA**
