# HK-HOSTILE-AUDIT-01 — Foundation defect register

## Result

**FAIL for integration readiness.** Canonical state, persistence ordering, recurrence generation and responsibility mutation are materially stronger after four repaired P2 defects. The database foundation also survived the real local harness. The result is still FAIL because an account can become durably “bound” without production sync composition or seeded outbound work (HA-001). This is a boundary failure, not a claim that the pure sync engines or PostgreSQL controls are weak.

## Foundation issues

| Defect | Sev | Source location | Dependent features | Repaired | Semantic blast radius | Migration/schema impact | Integration impact | Long-term fix |
|---|---:|---|---|---|---|---|---|---|
| Bound-without-sync seam (HA-001) | P1 | `src/domain/account/accountRuntime.ts:314`; `src/domain/sync/claimSeam.ts:53`; `src/store/AccountProvider.tsx:70` | F01–F04 | No; stopped path | Pre-sign-in content outside the One Move closure can remain device-only while binding says success | Claim-only household/member mapping and queue durability must be designed together; may require claim RPC evolution | Blocking | Compose one atomic state+namespace mutation bridge, claim all mapping-only dependencies, seed every other unmapped row, and verify second-device convergence |
| Empty-household classifier omitted foundation data (HA-002) | P2 | `src/domain/account/claim.ts:33` | especially F02/F04 | Yes, `3f567d2` | Wrong bootstrap/claim identity decision | None for the narrow repair | Repaired prerequisite; broader HA-001 remains | Keep `describeLocalHousehold` derived from the canonical state manifest rather than a hand-maintained subset |
| Dispatched invalid state (HA-003) | P2 | `src/state/appStore.ts:170` | all | Yes, `d762418` | Invalid session-authoritative state and persistence degradation | None | Repaired | Preserve one validation boundary for every mutation API |
| Partial responsibility reassignment (HA-004) | P2 | `src/domain/responsibility.ts:177` | F01/F03/F04 | Yes, `d762418` | Old holder returned while no valid successor existed | None | Repaired | Keep multi-record transitions prevalidated and atomic |
| Bounded recurrence falsely ended schedules (HA-005) | P2 | `src/domain/structure.ts:184-271` | F03/F04 | Yes, `d762418` | Old unbounded or multi-year rules vanished | None | Repaired | Keep range-based math and frequency-aware bounds; avoid elapsed-time iteration caps |
| Removed prerequisite inconsistency (HA-009) | P2 | `src/domain/structure.ts:70-85` | F01/F03 | No; owner decision | Readiness/waiting/handled truth | A durable edge-retirement status may be required depending on decision | Blocking for reconciled dependency copy | Separate “prerequisite completed,” “item removed,” and “dependency retired” |
| Default duration indistinguishable from fact (HA-010) | P2 | `src/domain/tasks.ts:13,38`; task schemas | F01/F03 | No; owner/schema | Capacity, suggestions, duration copy | Local + Supabase migration needed | Blocking for truthful F03 | Persist estimate source or nullable unknown duration |
| System subject mismatch (HA-011) | P2 | local `state.ts:185`; `sync/projection.ts:123`; cloud migration `:1525` | F04 | No; owner/schema | Child-specific routine identity | Local/cloud contract change required | Blocks child Systems | Add local subject with invariants, or remove cloud capability |
| Pull batch has no row quarantine (HA-014) | P4 | `sync/coordinator.ts:145`; `pullEngine.ts:92` | all cloud-backed features | No (correctly documented) | One incompatible row can pause convergence | Versioned quarantine/evidence may need schema | Before beta | Quarantine a row without advancing past unrecorded evidence; keep canonical state valid |

## Foundation hostile attacks performed

- Constructed invalid transitions through both mutation APIs. `dispatch` was the missing validation boundary and was repaired.
- Forced multi-record responsibility reassignment to missing/inactive people and hostile acknowledgement windows. Partial mutation was repaired.
- Queried recurrence far beyond the old daily/weekly guards and across multi-year intervals. False termination was repaired.
- Replayed write-queue behavior, overlapping commits, day rollover, restart/hydration, future-schema recovery, mode mismatch and write failure through the existing suites plus new regressions.
- Compared dependency semantics after task archive and event removal. The mismatch remains an owner-level semantic decision.
- Compared absent and explicit task durations through capture, Calendar projection and cloud representation. Provenance is irrecoverably collapsed in the present schema.
- Traced claim, binding, mapping, queue and coordinator composition. Pure units exist; the application runtime does not compose them.
- Exercised local PostgreSQL RLS, claims, sync, CAS, cursor and multi-device behavior through the actual harness (684/684).
- Recomputed the current schema fingerprint directly against local PostgreSQL: `199ed4d4c1b37cd654b5853e91cbde27`, 3,613 gated facts, matching the committed baseline.

## State and persistence conclusions

- The versioned local envelope, `writeSeq`, single write queue and serialized `commit` chain held under retry, overlapping save and restart attacks.
- Invalid state is now refused before becoming authoritative through either `dispatch` or `commit`.
- Future-version and read-failed sessions correctly become memory-only; they do not overwrite preserved bytes.
- Demo/real origin mismatch is fail-closed and demo claims are refused on both client and server.
- Account quarantine preserves the other account’s local household rather than rendering, merging or uploading it.
- The unresolved risk is not local durability. It is the claim-to-operating-sync seam after account binding.

## Canonical semantic conclusions

- Responsibility now preserves assigned → acknowledged → accepted → covered distinctions in foundation and repaired features. Acceptance alone is not coverage.
- Recurrence rules remain definitions, not occurrences or completed runs. F04 does not fake materialization.
- Actions, intentions, decisions, executions and outcomes remain distinct in the canonical model and cloud schema; server-written execution/outcome kinds are not client-pushable.
- Provenance records do not imply raw source content exists. Talk It Out’s exact source text remains session-only.
- Unknown does not become zero for capacity facets, but quick-capture duration still collapses unknown into a default 15; that is the outstanding schema decision.

## Foundation drift

No feature builder changed `supabase/**` or `src/domain/sync/foundationSpecs.ts`. The shipping migration working-tree hash remained `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`; the baseline migration’s raw working-tree hash was `81909daa46a9a2d124fb69a7a2f246cb434b7defbddf17f97d4aba0956ec3b47` (the committed baseline artifact records its LF-normalized hash separately). The post-buildout schema fingerprint matches all 15 dimensions and the gating digest.

## Foundation repair commits

- Report/foundation: `d762418` and `3f567d2`.
- F01 cherry-picks: `df44a0f`, `223d632`.
- F02 cherry-picks: `6dd7fa2`, `7e6c08b`.
- F03 cherry-picks: `5fbd6df`, `90dd7e1`.
- F04 cherry-picks: `d9852dc`, `6b6a221`.

No builder commit was amended, reset or rebased. No feature branch was merged. No remote operation was performed.
