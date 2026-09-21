# HK-FEATURE-02-TALK-IT-OUT — Build Ledger

Talk It Out + Life Inbox. Autonomous feature build (parallel wave, sibling of Features 01 / 03 / 04).
Builder: Claude. Independent audit: Codex (afterwards). This ledger is the builder's evidence, not the audit.

STATUS: IN PROGRESS (see §21 for the final verdicts; they are written last).

---------------------------------------------------------------------------------------------------

## 1. Entry / source

| Item | Value |
|---|---|
| Source addendum | HK-PARALLEL-SOURCE-01 (present) |
| Source branch | `design/01-front-end-system` |
| EXPECTED_SOURCE_HEAD | `5007b0f` |
| Verified `HEAD` at entry | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` |
| Verified source branch | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` |
| Worktree clean at entry | yes |
| Feature branch | `feature/02-talk-it-out-life-inbox` (forked directly from `5007b0f`, not from any sibling) |
| Builder worktree | `C:\Users\jsmit\Her-Keys-F02` (own `node_modules` via `npm ci`) |

### 1.1 Why a separate worktree (finding, not a deviation)

At entry three Claude sessions were live in `C:\Users\jsmit\Her Keys` (Feature 01 "Today", Feature 03
"Calendar capacity", and this one), and that checkout was already switched onto
`feature/01-today-chief-of-staff` by the Feature 01 session (reflog `HEAD@{0}`). `git switch` in that
directory would have moved Feature 01's checkout under it. Feature 02 therefore lives in its own worktree,
created with `git worktree add -b feature/02-talk-it-out-life-inbox <path> 5007b0f`. Feature 03 independently
chose the same pattern (`her-keys-f03`). The worktree sits outside the repository directory so it does not
appear as an untracked path in the sibling sessions' `git status` gates. The main checkout was not touched.

### 1.2 Entry gates (recomputed, not copied)

| Gate | Expected | Measured at entry |
|---|---|---|
| App tests | 808 / 808, 169 suites | **808 / 808, 169 suites, 0 fail** |
| TypeScript (`tsc --noEmit`) | pass | **pass** |
| Shipping migration SHA-256 (`…231500_build4_cloud_schema.sql`) | `1e9169de…a7cb` | **match** (working-tree bytes) |
| Baseline migration SHA-256 (`…230054_build4_baseline.sql`) | `8bc38d66…16f` | **match on the LF form** (see 1.3) |
| Backend harness | 684 / 684 | measured at exit (see §20 — shared Docker container, see 1.4) |
| Local fingerprint | `199ed4d4…` / 3613 facts | measured at exit |
| Expo Doctor | 21 / 21 | measured at exit |
| Expo Android export | pass | measured at exit |

### 1.3 Line-ending note on the baseline hash (not foundation drift)

The git blobs of both migrations are LF (`git ls-files --eol` → `i/lf`). `core.autocrlf=true` checks them out
as CRLF in a fresh worktree, so the raw working-tree bytes of the *baseline* file hash to `81909daa…`
in this worktree, while the main checkout (where that file is LF on disk) hashes to the expected `8bc38d66…`.
The shipping file is CRLF on disk in both. The foundation baseline was therefore measured as
"baseline = LF form, shipping = on-disk form". At exit this ledger re-verifies both against the LF git blob
and asserts `git diff 5007b0f -- supabase src/domain/foundation src/domain/sync src/persistence` is empty,
which is the stronger statement: no foundation byte moved.

### 1.4 Backend-harness hazard for the parallel wave

`supabase/tests/run.mjs` creates and drops fixed-name databases (`b4_env_a`, `b4_env_b1`, …) inside one
shared container (`supabase_db_Her_Keys`). Four sessions running it concurrently would corrupt each other.
Feature 02 changes no SQL, so the harness is a "did I move the foundation" proof; it is run once, at exit,
after checking no sibling run is in flight.

---------------------------------------------------------------------------------------------------

## 2. Product WHY applied (owner message received mid-build)

Decision order used to resolve ambiguity: preserve truth → reduce mental load → preserve agency → preserve
context → make the next moment easier → build for learning → one coherent product → do not create work to
manage the tool. Limits honoured: no new durable domain semantics, no unsupported facts, no material scope
expansion, no security/privacy boundary crossing, no shared-foundation edits.

Where the doctrine resolves an ambiguity the decision is recorded inline as **DECISION**. Where it does not
(a new durable semantic or a privacy boundary would be needed) the item is recorded in §17 as
**OWNER DECISION** with options, and the build continues on the conservative branch.

---------------------------------------------------------------------------------------------------

## 3. Existing inheritance (post-K5 / K6 / K7)

### 3.1 What actually exists (the contract assumed more than the repository has)

| Contract assumed | Reality at `5007b0f` |
|---|---|
| Talk It Out has interpretation / review / accept behaviour | **No.** Talk It Out is a *scripted topic-discovery loop* (`engine.ts`): keyword-matched topic → hypothesis → one question → refinement → one conclusion. It never touches source artifacts or interpretations. |
| Source artifacts hold the source text | **No.** `SourceArtifact` stores only a digest and an opaque `contentRef` into "a future content store" that does not exist. Her words are deliberately kept out of the canonical record (`conversationBoundary.ts`). |
| A voice path exists | **No.** The "Voice" pill toggles a disclaimer; nothing records or transcribes. |
| The interpretation UI exists | The *presentation* components exist (`InterpretationReview`, `ClarificationPrompt`, `ConfidenceBadge`, `ProvenanceLabel`, `WhyThis`); **nothing outside the gallery renders them.** |
| The interpretation state machine exists | **Yes**, fully, in `src/domain/interpretations.ts` + `foundation/interpretation.ts`, with no caller in the app. |

### 3.2 Classification (PRESERVE / REFINE / REPLACE)

| Element | File | Disposition | Reason |
|---|---|---|---|
| LISTEN→HYPOTHESIZE→CLARIFY→REFINE→RECOMMEND discovery engine | `features/talk-it-out/engine.ts` | **PRESERVE** (byte-unchanged) | Still the right model for "something feels off" talk. Capture is added in front of it, not in place of it. |
| Discovery persistence + replay + conversation boundary | `domain/discovery.ts`, `domain/reasoning/conversationBoundary.ts` | **PRESERVE** | Structure-only storage of talk stays true. |
| Scripted topic catalog | `data/seed/talkItOutScript.ts` | **PRESERVE** | |
| Talk It Out context (session state, quick replies, restart) | `store/TalkItOutContext.tsx` | **REFINE** | `submit()` gains a routing step for free-typed text at the `listening` stage. Discovery path unchanged when the capture reader recognises nothing. |
| Talk It Out view: bubbles, stage labels, confidence badge, WhyThis, quick replies | `features/talk-it-out/TalkItOutView.tsx` | **REFINE** | Bubbles/quick replies/composer kept. Capture cards render inline after the woman's message. |
| Voice pill + "arrives in a later build" note | `TalkItOutView.tsx` | **REPLACE** (hidden) — see 3.3 | No working path exists; the contract forbids a mysterious disabled mic and "coming soon" clutter. |
| Composer disclaimer "Prototype conversation — responses are scripted" | `TalkItOutView.tsx` | **REFINE** | Now states what is true of capture: nothing is saved until she approves it. |
| Inline `TalkItOutEntry` on Today | `features/talk-it-out/TalkItOutEntry.tsx` | **PRESERVE** | Owned by the Today surface. Untouched (Feature 01 territory). |
| `app/talk-it-out.tsx` (modal), `app/(app)/ai.tsx` (tab) | routes | **PRESERVE** | Both render `TalkItOutView`; no route/shell change. |
| Onboarding invitation step | `app/onboarding/talk-it-out.tsx` | **PRESERVE** (byte-unchanged) | It is an invitation card, not a capture step. It does not become a Life Inbox flow. |
| Life hub + Needs Me quick add + sub-screens | `app/(app)/life/*`, `features/life/*` | **PRESERVE**, one **REFINE** | A "Life Inbox" row is added to "Where things stand", and one Stack screen is registered. |
| Needs Me list | `features/life/NeedsMe*.tsx` | **PRESERVE** | Needs Me holds *accepted, unclassified* items. Life Inbox holds *unresolved* captures. Different question, different list. |
| Intelligence presentation vocabulary | `design/components/intelligence.tsx` | **CONSUME-AS-IS** | Not edited. Gaps go to §15. |

### 3.3 Voice disposition: **DEFERRED — affordance hidden**

There is no transcription path, and adding one is out of scope (no speech provider, no cloud speech). The
existing UI pattern for "unavailable" was a tappable pill that reveals "Voice arrives in a later build" —
that is coming-soon copy on a control that does nothing. **DECISION:** hide the Voice pill entirely; leave
the composer as text + Send. Any future working voice must feed its transcript through the same
`submitCapture` path (a `voice-utterance` artifact, `origin: 'voice'`), so no second pipeline is needed.

---------------------------------------------------------------------------------------------------

## 4. Existing-test disposition

Entry: **808 tests / 169 suites**. No existing test is rewritten, replaced or removed by this feature
(the engine, discovery persistence, conversation boundary and onboarding are byte-unchanged, and no test
renders `TalkItOutView`). Every relevant existing test is therefore **PRESERVED**.

| Test file | Semantic guarantee | Disposition |
|---|---|---|
| `tests/talkItOut.test.mjs` (3) | free text answers the pending question; symbol-only input opens no topic; a conversation alone never concludes above *possible* | PRESERVED |
| `tests/discoveryPersistence.test.mjs` (6) | only structure stored, replay equals live, recalled answers, no-op turns store nothing, stale record refused, resume + Start over | PRESERVED |
| `tests/ingestionReasoning.test.mjs` conversation-boundary block (4) | unmatched turn writes nothing; matched investigation stores structure; resubmit is a no-op; leaving a topic clears it | PRESERVED |
| `tests/ingestionReasoning.test.mjs` scope/subject block (2) | a child-scoped record names a child; a child-scoped record naming nobody is invalid | PRESERVED (and *relied on* by the new child-subject guard) |
| `tests/needsMe.test.mjs` (7) | Needs Me capture/persist/classify/resolve | PRESERVED |
| `tests/onboarding.test.mjs` (7) | onboarding step persistence/resume (incl. `talk-it-out` step gating) | PRESERVED |
| `tests/routeAccess.test.mjs` | `talk-it-out` route guard | PRESERVED |
| `tests/design-system/components/intelligence.test.mjs` | intelligence components render typed inputs only | PRESERVED |
| `tests/foundation*.test.mjs` interpretation/artifact cases | the durable state machine | PRESERVED |

The final ledger (§20) reports `ENTRY / PRESERVED / REWRITTEN / REPLACED / REMOVED / ADDED / FINAL`.

---------------------------------------------------------------------------------------------------

## 5. Foundation consumption trace (actual code, not governance IDs)

| Capability | Actual module → export | Existing tests | Class |
|---|---|---|---|
| Source artifacts | `domain/interpretations.ts` → `recordArtifact`, `retractSourceArtifact`; `foundation/sourceArtifact.ts` | foundationAcceptance* | **CONSUME-PARTIAL** — records arrival + `contentRef`; **holds no text** |
| Interpretations (durable) | `foundation/interpretation.ts` (kinds `task|event|needsMe`); `interpretations.ts` → `proposeInterpretation`, `askClarification`, `correctInterpretation`, `rejectInterpretation`, `supersedeInterpretation`, `acceptInterpretation`, `canAccept`, `interpretationsOf` | foundationAcceptance* | **CONSUME-AS-IS** |
| Provenance + durable confidence | `foundation/provenance.ts`, `reasoning/confidence.ts` (`promoteProvenance`) | ingestionReasoning | **CONSUME-AS-IS** |
| Typed money with direction | `foundation/money.ts` (`outflow`/`inflow`, minor units, `parseMoney`) | foundation* | **CONSUME-AS-IS** |
| Child subject invariant | `state.ts` `validateAppState` (`child-scoped … does not name a child`, `interpretation … references missing child`) | ingestionReasoning scope block | **CONSUME-AS-IS** |
| Household people (non-account) | `foundation/responsibility.ts` `HouseholdPersonSchema`; `state.people` | foundation* | **CONSUME-PARTIAL** — readable for name resolution only |
| Responsibility lifecycle | `foundation/responsibility.ts` (`owned…accepted…`) | foundation* | **NOT-FOUND as an interpretation target** — `Interpretation` has no responsible-party field |
| Commitment facets | `foundation/commitment.ts` | foundation* | **NOT CONSUMED** — commitment is *her* call ("Her Keys never infers it") |
| Goals / systems / context refs | `foundation/structure.ts` | foundation* | **NOT-FOUND as an interpretation target** (kinds are `task|event|needsMe` only) |
| Attention derivation | `reasoning/attention.ts` `attentionFor` | attention tests | **NOT-FOUND for unresolved interpretations** — it reads tasks/needsMe/intents/responsibilities/external refs, never interpretations → feature-local projection (§13) |
| Consequence / reversibility | `foundation/authorization.ts` | authorization tests | **NOT-FOUND on interpretations** (no consequence field) → no consequence-dependent review rule is invented (§51 gap recorded) |
| Canonical mutations | `tasks.ts` `addTask`, `events.ts` `addEvent`, `needsMe.ts` `captureNeedsMeItem` (via `acceptInterpretation`) | tasks/events/needsMe | **CONSUME-AS-IS** |
| Observations | `observations.ts` `appendObservation` (`interpretation`: `accepted`/`declined` only) | foundation* | **CONSUME-PARTIAL** — no `corrected` outcome exists |
| Store transitions | `state/appStore.ts` `dispatch`, `commit` (durable-before-show) | appStore | **CONSUME-AS-IS** |
| Storage adapter | `persistence/storageAdapter.ts` | persistence | **NOT USED** (see §17: no new persistence) |

Gaps carried to the audit: (G1) no content store; (G2) `Interpretation` cannot carry a responsible party;
(G3) no "user corrected" marker — an observation on an interpretation may only be `accepted`/`declined`;
(G4) `attentionFor` has no unresolved-capture source; (G5) no consequence field on interpretations.

---------------------------------------------------------------------------------------------------

## 6. Interpretation lifecycle map (real types only — no new persisted enum)

Durable representation is `Interpretation.state ∈ {pending, clarifying, accepted, rejected, superseded}`.

| Concept in the contract | Actual representation | Durable? | Transition (function) | Legal predecessor | May materialise? | Revisitable? |
|---|---|---|---|---|---|---|
| proposed | `state='pending'` | durable | `proposeInterpretation` | — | only via accept | yes |
| unresolved | `pending` or `clarifying` (open) | derived | — | — | no | yes |
| awaiting clarification | `state='clarifying'`, `clarification` open code | durable | `askClarification` / propose with `clarification` | `pending` | **no** (`canAccept` requires `pending`) | yes |
| reviewed | *presentation only* (opened / scrolled changes nothing) | not stored | — | — | no | — |
| accepted | `state='accepted'`, `acceptedRef`, `decidedAt` | durable, frozen | `acceptInterpretation` | `pending` | **yes — the only path** | no (history) |
| rejected | `state='rejected'`, `decidedAt` + observation `declined` | durable, frozen | `rejectInterpretation` | `pending`/`clarifying` | never | no |
| superseded / reinterpreted | `state='superseded'` + successor with `supersedesId`, `interpretationVersion+1` | durable, frozen | `supersedeInterpretation` | `pending`/`clarifying` | never | no |
| dismissed (whole capture) | every reading rejected, or artifact `retractedAt` set (once) | durable | `rejectInterpretation` / `retractSourceArtifact` | — | no | no |
| materialized | `acceptedRef → {kind,id}` of a real row | durable | `acceptInterpretation` | `pending` | — | — |

**Consequences.** Clarification answers and user corrections are applied by **superseding**
(`supersedeInterpretation`), never by in-place `correctInterpretation`: the in-place patch overwrites the
original claim so the final reading looks as if it had always been that. Supersede keeps v1 (with its
original values and confidence) frozen and names it from v2 via `supersedesId`. A superseded reading can
never be accepted (`canAccept` needs `pending`), so an obsolete reading cannot materialise after a
corrected one exists. Acceptance identifies its reading by **interpretation id** (which is unique per
version), and a second accept of the same id is a no-op by construction (`state !== 'pending'`).

Idempotency key for *source submission*: the artifact's `contentRef` (`capture:<submission key>`),
because `contentDigest` de-duplication would silently swallow a second, deliberate, identical capture.

---------------------------------------------------------------------------------------------------

## 7. Sync participation (from `sync/foundationSpecs.ts` + the migration)

| Thing | Foundation says | Note |
|---|---|---|
| Source artifact row | **SYNC PARTICIPANT** (`source_artifacts`, mutable only via `retracted_at`, once — trigger `retract_once`) | `content_ref` syncs as an opaque token; **no text syncs because none exists** |
| Raw submitted text | **NOT PERSISTED ANYWHERE** by the foundation | see OWNER DECISION OD-1 |
| Interpretation rows | **SYNC PARTICIPANT** (`interpretations`) | includes `clarification` open code, `supersedes_id`, `interpretation_version` |
| Review decisions (accept/reject) | **SYNC PARTICIPANT** via `state`, `decided_at`, plus observation `about.kind='interpretation'` (`accepted`/`declined`) | |
| Rejection state | **SYNC PARTICIPANT**; trigger `freeze_decided_interpretation` makes a decided row history — **a rejected reading cannot be resurrected server-side** | good: prevents multi-device resurrection |
| Materialization links | **SYNC PARTICIPANT** (`accepted_type` + `accepted_id`) | |
| Clarification evidence (the answer itself) | **UNKNOWN / NOT YET DECIDED** — the foundation has no concept for it. Its *effect* is durable and syncs (the superseding reading); the answer text is not stored | integration/foundation follow-up |
| "User corrected" marker | **NOT REPRESENTED** (gap G3) | In this build every supersession is user-driven; a future LLM re-read would be indistinguishable → follow-up |

---------------------------------------------------------------------------------------------------

## 8. Life Inbox mount point

**Chosen:** the existing Life stack (`app/(app)/life/`), option 1 in the addendum's preference order.

* New screen `app/(app)/life/inbox.tsx` (route `/life/inbox`), registered as one `Stack.Screen` in
  `life/_layout.tsx`.
* Entry: one row, **Life Inbox**, in the Life hub's existing "Where things stand" list (`life/index.tsx`).
* Second entry: Talk It Out (after a capture) links "Decide later" captures to the same screen.
* **No new tab, no change to `app/(app)/_layout.tsx`, no navigation-label change, no root-layout change.**

Why not Her Keys AI: that tab *is* the conversation; an inbox of unresolved life admin is a Life question
("what still needs resolution?") and Life already hosts the sibling "Needs Me" list. Why this is not "a second
inbox shell": one list screen inside the existing stack, not a tab, not a hub restructure.

Inbox ≠ Needs Me: Needs Me holds *accepted, unclassified* items (canonical rows). Life Inbox holds
*unresolved captures* (no canonical row yet). The Inbox never lists an accepted reading.

---------------------------------------------------------------------------------------------------

## 17. OWNER DECISIONS (WHY doctrine could not resolve)

### OD-1 — Durable retention of the woman's raw words  → **PENDING-OWNER**

**The gap.** The contract says the source is anchor evidence, retained, never destructively edited, shown back
in review, retryable after a crash, and that "raw narrative persists only through the legitimate
source-artifact path". The legitimate path (`SourceArtifact`) **stores no text** by design (ADR-011): no `body`,
no `transcript`, only a digest and an opaque `contentRef` into a content store that does not exist.

**Why the WHY doctrine does not resolve it.** *Preserve context* and *reduce mental load* argue for keeping her
words (so she never re-says what she said, and a crash costs her nothing). *Preserve truth* plus the
explicit limit "MAY NOT cross security/privacy boundaries" and "MAY NOT invent new durable semantics" argue
against creating, on a parallel feature branch, an unencrypted on-device store of raw, possibly very
sensitive narrative that the foundation deliberately kept out of the record. The two halves of the doctrine
collide on a privacy boundary; that is an owner call.

| Option | Behaviour | Cost |
|---|---|---|
| **A (recommended)** | A dedicated on-device content store keyed by `contentRef`, same trust level as household state, retained until she deletes, never synced, never in demo | new durable semantic + unencrypted raw text at rest; needs the source-lifecycle policy |
| B (**built**) | Raw text lives in memory for the running session only | wording is gone after the app closes; unresolved *structured* readings survive |
| C | A + encryption at rest | needs an approved crypto approach / new dependency |

**Built now (Option B, behind a one-file port `CaptureTextStore`).** Everything durable is structured
(artifact + readings). Consequences, stated honestly in the UI and tests: the "What you said" echo and
retry-from-source exist for the session; after a restart an unresolved reading is still reviewable and
resumable (its title, typed fields and clarification code are durable and the question is regenerable), but
the exact original wording is no longer shown, and a source with **no** readings cannot be re-interpreted —
it is listed with an honest "your words weren't kept" message and can be re-said or dismissed.
Moving to Option A later replaces one implementation of one interface.

### OD-2 — High-stakes / safety-sensitive capture policy  → **PENDING-OWNER** (mandated deferral)

A minimal conservative guard (no proposals, nothing turned into a task or a Needs Me note, no external
action) is built so that such text is not forced into household logistics. It is a *stopgap lexicon*, not a
policy; the policy needs separate product review. See §16.

---------------------------------------------------------------------------------------------------

*(Sections 9–16 and 18–21 — capability envelope, scenario satisfiability, correction/person/child rules,
LLM seam, missing-primitive register, privacy verification, considered/deferred, defects, scenarios,
exit gates, verdicts — are appended by the L1 and later commits.)*
