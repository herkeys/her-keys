# HK-FEATURE-11 — Missing primitives register

Feature 11 (Me / Rebuild OS) built on `integration/wave2-f01-f08` @ `363e473` (WAVE3_BASE, tagged `wave2-final`). Same format as the
F04–F09 registers. F11 introduces exactly ONE new canonical concept (`RebuildFocus`) and ONE F11-owned association table
(`rebuild_focus_links`) built on the existing typed-reference primitive (ADR-005). Neither is itself a gap; everything below is what
the foundation does NOT supply, and how F11 V1 behaves because of it.

Fields: **ID · CAPABILITY · ACTUAL FOUNDATION STATE · WHY EXISTING SEMANTICS ARE INSUFFICIENT · IMPACT · FEATURE-LOCAL SOLUTION? ·
NEW DURABLE SEMANTIC? · OWNER CHECKPOINT? · FUTURE DOMAIN · INTEGRATION TIMING**

---

### MP-11-01 · Personal-domain classification ("Me Now")
- **State:** `scope = 'personal'` exists on Task/Event/System/Category and is enforced as OWNER-PRIVATE visibility. Category roles
  include `wellbeing` and `relationships`, but a role is how the household FILES a thing, not a statement that the thing is "about her".
- **Insufficient because:** privacy is not a life domain. A private work task and a private creative task share `personal`; a Home task
  she does for herself is `household`. Inferring "about me" from scope, a category role or display-name text would be the brittle
  classification the brief forbids.
- **Impact:** F11 V1 shows only items EXPLICITLY linked to a RebuildFocus. No general "Me Now" projection.
- **Feature-local?** YES (explicit links). **New durable semantic?** YES, if a general "about me" classification is wanted.
  **Owner checkpoint?** NO (brief pre-authorizes this fallback). **Future domain:** Wave 3 integration. **Timing:**
  `MISSING PRIMITIVE — PERSONAL DOMAIN CLASSIFICATION`.

### MP-11-02 · Past Focuses view
- **State:** no shared Archive / Past-items screen or component exists; only feature-local sections (Home "Recently marked done",
  Co-parent "Recently completed").
- **Impact:** archived Focuses stay canonical (never deleted or purged) and are absent from the Me / Rebuild home. There is no V1 path
  to view or restore them.
- **Feature-local?** NO (Addendum L forbids a bespoke archive framework). **New durable semantic?** NO (the data is already there).
  **Owner checkpoint?** NO. **Timing:** `PENDING-INTEGRATION — PAST FOCUSES VIEW`.

### MP-11-03 · System lifecycle and run completion
- **State:** `HouseholdSystem` has no status (no pause/archive), and step/run completion is NOT PRESENT (F04 MP-01/03/08). The observation
  vocabulary allows `completed/skipped/missed` for a system, but only `skipped` is ever written.
- **Impact:** a linked System cannot contribute to Recent Progress (SAFE-UNAVAILABLE) and has no archived state to be inert on. A
  missed or skipped routine is never read by F11 at all, so it can never be read as regression.
- **Feature-local?** NO. **New durable semantic?** YES (Systems domain). **Owner checkpoint?** NO. **Future domain:** Systems.
  **Timing:** when Systems gains run semantics.

### MP-11-04 · Goal surface
- **State:** `GoalSchema`/`addGoal`/`setGoalStatus` exist and sync, but `addGoal` has no production caller and there is no Goal screen.
- **Impact:** the Focus→Goal link is real in domain, schema, RLS and sync (tested), but a user has no way to create a Goal to link.
  F11 does NOT build a Goal editor (that would be a second Goals surface owned by nobody).
- **Feature-local?** NO. **New durable semantic?** NO (the Goal model exists). **Owner checkpoint?** NO. **Future domain:** Goals /
  Wave 3 integration. **Timing:** `PENDING-INTEGRATION — GOAL SURFACE`.

### MP-11-05 · Life hub registration
- **State:** the Life hub is a hard-coded list (HK-INT-WAVE2-LIFE-REGISTRATION, recorded by F06/F07). F09 and F10 face the same seam.
- **Impact:** F11 adds one fixed "Me / Rebuild" row. Integration must reconcile the rows F09/F10/F11/F12 each add.
- **Feature-local?** YES (one fixed row). **New durable semantic?** NO. **Owner checkpoint?** NO. **Timing:** Wave 3 integration.

### MP-11-06 · Talk It Out → RebuildFocus
- **State:** the interpreter proposes `task | event | needsMe` only.
- **Impact:** statements like "I miss painting" cannot yet become a proposed Focus. F11 exposes a stable `addRebuildFocus` command for
  that future wiring and does not touch the interpreter.
- **Feature-local?** NO. **New durable semantic?** YES (a new proposed kind). **Owner checkpoint?** NO. **Timing:**
  `PENDING WAVE 3 INTEGRATION`.
