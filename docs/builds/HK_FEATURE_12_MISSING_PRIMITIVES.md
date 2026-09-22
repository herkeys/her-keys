# HK-FEATURE-12 — Missing primitives and integration candidates

Everything F12 needed and did not find in WAVE3_BASE (`363e473`), and every seam it deliberately left for Wave 3 integration. Nothing
here was invented inside F12 to paper over a gap. Kept current at each milestone.

Format (integration-candidate):

| ID | Item | Current Owner | Needed Capability | Depends On | Target Integration | Blocking? | Notes |
|---|---|---|---|---|---|---|---|
| MP-12-01 | Local-id existence probe on SCOPED tables (M0 NOTE 2) | Foundation (Build 4 `tasks`/`events`/... uniqueness `(household_id, local_id)`; `sync_push` probe under RLS) | Owner-keyed uniqueness for personal-scope rows on scoped tables, or a collision path that answers "not yours" and "absent" identically | Shared schema + `sync_push` | Wave 3 foundation repair | NO for F12 | Confirms only a GUESSED local id exists (no content, no relationship). F12 mitigates for the Tasks and records it creates by minting long-random local ids (M3). Affects every personal Task the product already creates. |
| MP-12-02 | Known-id FK existence probe on foundation relationship tables (M0 NOTE 1) | Foundation (`dependencies`, `evidence_links`, `external_references` typed FKs to `tasks`/`events`/... are `(id, household_id)`, not owner-keyed) | Owner-matching guard on cross-owner typed references, or a BEFORE trigger that refuses "not yours" exactly like "absent" | Shared schema | Wave 3 foundation repair | NO for F12 | Requires a server uuid the member never receives. F12's own link table closes it (M5). |
