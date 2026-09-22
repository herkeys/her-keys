# HK-FEATURE-02-TALK-IT-OUT — Build Ledger

Talk It Out + Life Inbox. Autonomous feature build (parallel wave, sibling of Features 01 / 03 / 04).
Builder: Claude. Independent audit: Codex (afterwards). This ledger is the builder's evidence, not the audit.

STATUS: **PASS — builder-verified** (verdicts in §28). On-device/visual verification was **not** executed (§23). Two owner decisions are pending (OD-1, OD-2, §17).

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
| Backend harness | 684 / 684 | measured at exit — **684 / 684** (§24; shared Docker container, see 1.4) |
| Local fingerprint | `199ed4d4…` / 3613 facts | measured at exit — **MATCH** (§24) |
| Expo Doctor | 21 / 21 | measured at exit — **21 / 21** (§24) |
| Expo Android export | pass | measured at exit — **pass** (§24) |

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
| Talk It Out context (session state, quick replies, restart) | `store/TalkItOutContext.tsx` | **REFINE** | `submit()` gains one routing step for free-typed text (`capture/routing.ts`, a pure, tested rule). Quick replies are never routed. Every scripted starter and option, typed as free text, still routes to the existing conversation (asserted). The conversation's own answers stay answers; only text it would have met with "I didn't catch that" (or, after a conclusion, a scripted reply) and the reader recognises as something to save is captured. Symbol-only input keeps the existing "no words to go on" behaviour. |
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

## 9. Local interpreter capability envelope

The local reader (`capture/local/*`) is **deterministic rules, not a language model and not a stand-in for
one**. The envelope is *executable*: `capture/local/envelope.ts` lists every rule with ≥3 distinct phrasings,
and `tests/talkItOutCapture.reader.test.mjs` feeds each phrasing through the real reader and fails if it does
not fire the rule it is listed under. The weekday rule is additionally property-tested for every weekday on
every day of a fortnight, and a further 2,000 seeded random sentences check invariants (no field outside the
typed shape, no confidence above `possible`, no guessed child, no guessed money direction, no throw).

| Rule | Reads | Notes |
|---|---|---|
| `date.weekday` | Friday / this Friday / next Friday / on Thu / on Tues | Doubt is asked, not guessed: a bare weekday **that is today**, and "next <weekday>" **when that weekday is still ahead this week**. |
| `date.relative` | today, tonight, tomorrow, day after tomorrow, in N days/weeks | |
| `date.calendar` | Sept 25, September 30th, 25 Oct, 9/28 | Next occurrence; flagged when it rolls into next year. Impossible dates (Feb 30) are treated as no date. |
| `date.day-of-month` | the 1st, the 15th | |
| `time.clock` | 3pm, 3:30 p.m., 15:00, at 5, noon, 5 o'clock | A missing am/pm is **assumed** (surrounding words, else 1–6 → pm, 7–11 → am) and always flagged. |
| `time.range` | from 3 to 4, 4-5pm, 6pm to 7:30pm | |
| `time.duration` | for an hour, for 45 minutes, half an hour, a 30-minute … | Event with none stated: 30 minutes (the calendar form's own default), flagged. |
| `money.amount` | $85, $12.50, 85 dollars, 20 bucks | USD only, exact minor units through the foundation's `parseMoney`. |
| `money.direction` | I owe / pay / send / bring (outflow); owes me / pay me back / reimburse me (inflow) | With an amount + a named other party and no cue: **asked**. With neither: no typed amount; the amount stays in her words. |
| `child.named` / `child.object-pronoun` / `child.noun` / `child.activity` | Ayden · pick **him** up · my son · piano lesson | One child resolves; several are asked; the group ("Alexa and Ayden") is not a single subject. |
| `area.keyword` | dentist → Wellbeing, electric bill → Money … | Only an area the household actually has. |
| `kind.*` | obligation → to-do; time + day → appointment; date only → dated note; unrepresentable → note | |

**Limits (all enforced and tested):** processing window 4,000 characters — over it **nothing is read and nothing
is claimed**; 12 clauses — the remainder is reported `clause-limit`; 3 clarification steps per reading
(which child / which day / which direction) — a bound by construction; 3 failed free-text answers before it
stops asking and offers manual correction; titles are capped at 90 characters (flagged), so a long clause never
leaves a large excerpt of her words in the durable record.

**Confidence:** the reader never claims more than `possible` (nothing corroborates a reading of one message).
Only her acceptance reaches `established` (`promoteProvenance`, unchanged). No confidence×consequence formula was
invented (gap G5 recorded).

**What it does not do** (`NOT_SUPPORTED` in `envelope.ts`, each with its safe behaviour): general language
understanding; recurrence ("every Tuesday" → note + unsupported); changes to existing items ("practice moved to
6" → note + unsupported); who is responsible; goals/patterns/context (fall through to the existing discovery
conversation); other currencies; sensitive content (not read at all); voice.

### 9.1 Generalization disclosure

**LOCAL INTERPRETER CAPABILITY: GENERALIZES WITHIN DOCUMENTED ENVELOPE.** It reads by rule, so phrasings it was
never shown are read when they use the same rules (tested on phrasings that appear nowhere in the envelope),
and it is honest at the edge (nothing recognised → kept unresolved; unsupported → explicit). It is **not**
general natural-language understanding and no green test implies it is. It is bounded pattern matching over a
small, listed vocabulary; its multi-clause splitting in particular is a heuristic and is the first place a
real interpreter would be better.

---------------------------------------------------------------------------------------------------

## 10. Scenario satisfiability (mapped before the scenario tests were written)

`SL` supported locally · `SP` supported partially · `DL` deferred-on-LLM · `FB` foundation-blocked.

| # | Scenario | Class | Notes / safe behaviour where partial |
|---|---|---|---|
| A | simple explicit capture | SL | envelope forms |
| B | ambiguous date | SL | weekday rule |
| C | multi-item | SP | bounded clause splitting; unusual conjunctions are kept as one clause and, with several dates/times/amounts, become a note |
| D | partial acceptance | SL | each reading is its own durable row |
| E | user correction | SL | supersede + one patch operation |
| F | low confidence | SL | hedge → assumption note; badge stays `possible` |
| G | nothing safe to materialise | SL | source kept unread, nothing fabricated |
| H | unsupported domain | SP | a listed set of reasons; arbitrary new domains are **DL** and fall back to *nothing recognised* |
| I | idempotent accept | SL | structural (accept only while `pending`) |
| J | person / responsibility | SP + **FB** | mention read; recording a responsible party is **FB** (`Interpretation` has no such field) → stays words in the title, review says nothing was recorded |
| K | money direction | SP | cue-based; no cue → asked or untyped |
| L | non-actionable context | SL | recognised as nothing → never a forced task. If a discovery topic matches ("I feel like I'm always behind") the existing conversation takes it; otherwise it is kept as an unread source with an honest message and a way to dismiss it |
| M | resolution exits inbox | SL | |
| N | empty inbox | SL | |
| O | interpretation failure | SL | |
| P | demo isolation | SL | foundation's `refuseDemo` + demo provenance |
| Q | draft vs submitted | SL | |
| R | restore mid-review/clarification | SL, with OD-1 caveat | question regenerates from the durable reading; wording is not retained |
| S | clarification preserves source | SL | |
| T | loading vs empty | SL | |
| U1–U3 | child subject | SL | |
| V1–V3 | clarification pivot | SL | V1 kind-change words are honoured in an answer |
| W | partial success + unsupported | SL | |
| X | interpretation crash recovery | SL, with OD-1 caveat | in-session retry works; after a restart the source is listed as unreadable |
| Y | unknown person | SL | |
| Z | type shift after clarification | SL | |
| AA | time-sensitive unresolved | SL | feature-local projection (no shared source: G4) |
| AB | source retry / supersession | SL | no foundation source-supersession exists → new capture; original untouched |

**Deferred-on-LLM examples, and what happens instead (all tested for safety):** implicit or contextual dates
("after the game next week"), pronouns across sentences, references to other events, multilingual text, tone.
Each returns *nothing recognised* or a note: source kept, no fabricated record, an honest path forward.

---------------------------------------------------------------------------------------------------

## 11. Correction pattern

One semantic operation — **USER CORRECTED THIS PROPOSAL** — and one code path that changes what a proposal says:

```
clarification answer ─┐
structured "Fix it"  ─┼─▶ ProposalPatch ─▶ revise() ─▶ supersedeInterpretation ─▶ new reading (v+1), old one frozen
natural-language fix ─┘        (capture/revise.ts)                (foundation)
```

* The raw source is never touched. The correction is user evidence, applied to the *proposal*.
* `correctInterpretation` (in-place patch) is deliberately **not used**: it would make the final reading look as
  though it had always said that. Supersede keeps v1 with its original claim and confidence.
* A correction does not raise confidence (only `promoteProvenance` may, on acceptance).
* Presentation: the "Fix it" sheet carries a single-value chip/field edit **and** a natural-language field
  ("No, I meant next Friday at 4"). In this build the inline and structured presentations are one sheet, not two.
  All routes converge (asserted: a typed edit and the equivalent spoken correction yield the same reading).
* "No, I meant next Friday": she is correcting a date she was shown, so the reader cannot take it to mean the same date.
* Foundation gap **G3**: nothing durable says a revision was user-driven. Every supersession in this build is
  user-driven, so this is safe *today*; a future model re-read would be indistinguishable → follow-up.

---------------------------------------------------------------------------------------------------

## 12. Child and person rules

* **Child subject (mandatory invariant).** A child-scoped proposal never becomes a row without a real child.
  Two children and "him" → a question (`which_child`); one child → resolved without asking; a named child →
  resolved; the group → not a single subject. While a question is open the reading is `clarifying` and the
  foundation's own `canAccept` refuses it; after the answer the row is child-scoped with a real child and the
  foundation validator (`validateAppState`) agrees (asserted). She can answer "not about a child" — an
  explicit answer, not an absence.
* **Unknown person.** A mentioned name that is not in her household is words in the title. No household person,
  role, account, co-parent status or responsibility is created (asserted on real state: `people` and
  `responsibilities` stay empty after accepting "Jordan will pick up Ayden at 5").
* **Mentioned ≠ responsible ≠ accepted.** The reader recognises the *shape* of a handoff and reports it
  (`responsibility-handoff`, with whether the name is already in her household); it records nothing (gap **G2**).
* **Money.** Direction lives beside the amount (`outflow` = leaves the household). "I owe Jordan $85" and
  "Jordan owes me $85" are stored as different facts (asserted).

---------------------------------------------------------------------------------------------------

## 13. Life Inbox behaviour

* **Membership (derived, never stored):** a source is active when it has a reading that is `pending` or
  `clarifying`, or when it has no reading at all; a withdrawn source, and any source whose every reading has a
  final disposition (accepted / rejected / superseded-chain-ended), is not. Accepted canonical rows are never
  listed (the Inbox is not a second task list); history is not listed (not an activity feed).
* **Empty** is a calm fact with no action, no celebration, no prompt to add anything. **Loading**, **recovery**
  (stored state could not be read) and **empty** are three different states; the Life row never says "Nothing
  waiting" for the first two.
* **Ordering, by meaning, no numeric score:** referenced-time urgency (`now` = within 3 h or passed, `today`,
  `soon` = within 2 days, `none`), earliest referenced time first (so the longest-overdue leads), a question
  that is *blocking* a time-bound matter before a plain review, unread sources last, recency only as a tie-break.
* **Time-sensitive unresolved captures (AA):** never disappear. As "Friday at 3" approaches, its urgency rises
  (`none` → `soon` → `today` → `now`) and after the time it stays `now` with `passed: true`. It never becomes a
  confirmed appointment (no canonical row exists) and no Today/Feature 01 code is touched.
* **Aging:** no reminder machinery. A non-time-bound item gains **no** urgency from age (asserted for 0–365 days).
* **INTEGRATION REQUIREMENT:** the shared attention layer has no unresolved-capture source (gap G4). Feature 02's
  `UnresolvedCaptureAttentionProjection` (`capture/attention.ts`) should later feed shared attention / Today
  through canonical projection integration.
* **Mount:** see §8. Inside the existing Life stack; reached from one row in "Where things stand" and from Talk
  It Out's "Decide later → Open Life Inbox".

---------------------------------------------------------------------------------------------------

## 14. Shared files touched (parallel-wave integration record)

| Path | Why it must be touched | Commit | Sibling collision likelihood |
|---|---|---|---|
| `app/(app)/life/_layout.tsx` | register one Stack screen (`inbox`) inside the *existing* Life stack | `ecf63f1` | low — no sibling feature owns Life |
| `app/(app)/life/index.tsx` | one "Life Inbox" row in the existing "Where things stand" list | `ecf63f1` | low–moderate — Feature 01 may add Life-related rows; merge is an additive list entry |
| `src/store/TalkItOutContext.tsx` | route free-typed messages between capture and the existing conversation (`capture/routing.ts`); nest `CaptureProvider`; async send | `ecf63f1`, `4970978` | low — Talk It Out is this feature's surface (Feature 01's Today entry only calls `router.push`) |
| `src/features/talk-it-out/TalkItOutView.tsx` | render captures inline; remove the non-functional Voice pill; new composer copy | `ecf63f1` | low |
| `tests/support/rn-stub.tsx` | add an `AppState` stub so the real store provider can mount under `node --test` | `ecf63f1` | **moderate** — any sibling adding component render tests may also extend this stub; trivial additive merge |

**Not touched:** `app/_layout.tsx`, `app/(app)/_layout.tsx` (the tab shell), `src/design/**`, `src/domain/**`,
`src/persistence/**`, `src/state/**`, `supabase/**`, `package.json`, `package-lock.json`, `app.json`,
`docs/design-system/**` (screenshots for this feature live in `docs/feature-02-evidence/`). Everything else is new
and owned by Feature 02: `src/features/talk-it-out/capture/**`, `tests/talkItOutCapture.*`,
`tests/support/capture*.mjs`, this ledger.

**Shell / navigation confirmation:** no new tab, no change to the five-area shell, no navigation-label change, no
root-layout change. The Life Inbox is a screen inside the existing Life stack.

---------------------------------------------------------------------------------------------------

## 15. UI-system consumption and MISSING GLOBAL PRIMITIVE register

Consumed **as-is, unmodified**: `Card`, `Button`, `ChipToggle`, `Sheet`, `TextField`, `Tag`, `AppText`, `Overline`,
`InlineNotice`, `LoadingState`, `EmptyState`, `StatusList`, `Screen`, `ConfidenceBadge`, `ProvenanceLabel`, `WhyThis`,
and the token module. No new colour, typography, card, button, sheet, confidence or provenance vocabulary; a test
asserts the feature hard-codes no colour or font.

| # | MISSING GLOBAL PRIMITIVE | Encountered | Semantic need | Feature-local composition | Likely sibling relevance |
|---|---|---|---|---|---|
| MGP-1 | **Choice-among-candidates clarification** | clarifying which child / which day / which direction | "Which one do you mean?" with a small typed option set plus a say-it-yourself field, bounded question count | `Card` + `Overline` + `Button` (secondary, sm) + `TextField` | Feature 03 (conflict/capacity choices), Feature 04 |
| MGP-2 | **Source echo** | review must show what she said beside what Her Keys understood | quoted user words, collapse/expand, never truncated in what is kept | `Card` (subtle) + `AppText` + ghost `Button` | Feature 01 (evidence for a recommendation) |
| MGP-3 | **Review with uncertainty notes and inline area choice** | `InterpretationReview` is a closed layout (fields + three buttons) | confidence, assumption notes, "why", and a required-field chooser *inside* the card | composed from `Card` + `ConfidenceBadge` + `WhyThis` + `ChipToggle` + `Button` using the same labels | Feature 04 |
| MGP-4 | **`Sheet` backdrop accessibility role** | a11y test | the backdrop "Dismiss" `Pressable` has a label but no `accessibilityRole` | none (design-system component, not modified) | all |

---------------------------------------------------------------------------------------------------

## 16. LLM seam and reconciliation note

| | |
|---|---|
| Path | `src/features/talk-it-out/capture/port.ts` (interface in `capture/types.ts`) |
| API | `interpret(TalkItOutInput)`, `clarify(ClarificationInput)`, `readCorrection(CorrectionTextInput)` |
| Input | raw text + **minimum** context: logical time, child and person candidates, the areas that exist — never the household |
| Output | typed `Proposal[]`, typed `UnsupportedItem[]`, a typed failure. No `any`, no `unknown` domain contract, no bag |
| Status | **feature-local** to Feature 02. `SHARED-ABSTRACTION CANDIDATE` |

Target shape: `SOURCE → minimum context → port → typed proposals → review → canonical mutation`. Never the entire
app state to a model; never free-form JSON into a write. No Gemini, prompt, SDK, Edge Function or secret exists.

`revise()` (applying a typed patch) is deliberately **outside** the port: it is domain logic, not language
understanding, so a future model-backed port reuses it unchanged.

**INTEGRATION RECONCILIATION NOTE:** Feature 01 may create its own narrative-generation port. The two do different
jobs (that one writes words about the day; this one reads words into typed proposals). An integration pass should give
all AI-facing ports one repository home. This branch imports nothing from, and creates nothing shared for, any sibling.

---------------------------------------------------------------------------------------------------

## 18. Privacy verification

Search over the whole Feature 02 surface (`src/features/talk-it-out/capture/**`, `src/store/TalkItOutContext.tsx`,
`src/features/talk-it-out/TalkItOutView.tsx`, `app/(app)/life/inbox.tsx`):

| Pattern | Matches | Verdict |
|---|---|---|
| `console.` / `.log(` / `debugger` | **0** | clean |
| `JSON.stringify` / `JSON.parse` | **0** | clean |
| network (`fetch`, `XMLHttpRequest`, `WebSocket`) | **0** | clean |
| analytics / telemetry / Sentry / PostHog | **0** | clean |
| `AsyncStorage` / `SecureStore` / `localStorage` | **0** | clean — the feature persists nothing of its own |
| `report(` (store diagnostics) | **0** | clean |
| `throw` / `new Error(` | **4** — `useCapture` / `useTalkItOut` misuse guards and two code-format guards in `clarificationCodes.ts` | every message is a static literal; none can contain her words |

Enforced mechanically (not just by this review): `tests/talkItOutCapture.ui.test.mjs` fails the build if any of
these patterns appears, or if an `Error` message is not a plain literal. Behaviourally: words that did not become a
title are asserted absent from **every** storage key after a full flow; a long clause leaves at most a 90-character,
flagged title; her words exist only in the session's memory and are forgotten when no source refers to them
(`pruneOrphans`); the store's own diagnostics carry no text; high-stakes text is neither saved nor held.
**No raw-source logging path exists.**

## 19. Voice, source retention, safety-sensitive capture

* **Voice — DEFERRED, affordance hidden.** No transcription path exists and none was added (no speech package, no
  cloud speech). The pill that only revealed "arrives in a later build" was removed; a future working voice must
  feed a `voice-utterance` source through the same `submit` path.
* **Source retention — RETAIN, no automatic deletion**, as far as the foundation retains anything: the source
  *record* is kept and only ever withdrawn (`retractedAt`), never deleted; **her words are not retained beyond the
  session** (OD-1). This is a discrepancy between the contract's assumption and the foundation, surfaced rather than
  papered over. Mandatory considered+deferred item: **SOURCE ARTIFACT LIFECYCLE** (retain-until-deleted vs age-out
  after resolution) — open, owner.
* **Safety-sensitive capture — no safety system invented.** A conservative stopgap guard reads such text as
  *nothing*: no proposals, no task, no Needs Me note, no source record, nothing held after the session, nothing
  sent, no external report. Deviating from "intentional submit creates a source" is deliberate: a hollow "she said
  something sensitive" entry in an inbox on a shared phone could itself cause harm. Mandatory considered+deferred
  item: **HIGH-STAKES / SAFETY-SENSITIVE CAPTURE POLICY** — needs separate owner/product review (OD-2).

## 20. Considered + deferred

| Item | State |
|---|---|
| Source artifact lifecycle / retention policy (retain-until-deleted vs age-out) | **PENDING-OWNER** |
| Durable, on-device store for her words (OD-1 options A / C, incl. encryption) | **PENDING-OWNER** |
| High-stakes / safety-sensitive capture policy (OD-2) | **PENDING-OWNER** |
| Future shared interpreter abstraction (promote `TalkItOutInterpreterPort`) | **PENDING-INTEGRATION** |
| Shared unresolved-capture attention → Today | **PENDING-INTEGRATION** |
| Voice transcription | **PENDING-OWNER** (needs a provider and a privacy decision) |
| Unsupported-domain expansion: recurrence (→ Feature 04), changes to existing items (→ Feature 03), recording who is responsible (foundation G2) | **PENDING-INTEGRATION** |
| Future Gemini / model wiring | **PENDING-OWNER** (credentials, deployment: external constraint) |
| Foundation gaps: G1 content store, G2 responsible-party on `Interpretation`, G3 user-corrected marker, G4 attention source, G5 consequence on interpretations | **PENDING-INTEGRATION** |
| Clarification answers as first-class durable evidence (G3) | **PENDING-INTEGRATION** |
| Inbox aging / reminder policy | **PENDING-OWNER** |
| Consequence-dependent review strength (foundation defines none; none invented) | **PENDING-OWNER** |
| Multi-device sync semantics for capture state (rejected/reviewed already sync via `interpretations`; answers do not) | **PENDING-INTEGRATION** |
| Inline single-value edit *on the card* as distinct from the Fix sheet | **PENDING-OWNER** (UX preference) |

Deferred is not rejected, failed, blocked or forgotten.

## 21. Defects found and repaired during the build

| # | Defect | Found by | Repair | Regression |
|---|---|---|---|---|
| D1 | Several named children: the group's extent was built in household order, not text order (`start > end`) | seeded random corpus | `people.ts` uses min start / max end | invariants test (evidence spans inside the text) |
| D2 | A capitalised weekday ("and Saturday at 3") was read as the start of a new clause, splitting "Friday and Saturday" | scenario H | `CAPITALISED_NOT_A_NAME` in `clauses.ts` | reader H |
| D3 | "Ask Sam to…" handoff missed (verb matched case-sensitively) | scenario J/Y | case-tolerant verb group | reader J/Y |
| D4 | Assumption notes shown for values a pending question was hiding | rendering the view-model tree | no notes while clarifying | golden trees |
| D5 | Assumptions ("assumed 30 minutes", "assumed today") lost across a clarification, exactly when she needs them at the final review | rendering the view-model tree | `carriedAssumptions`, dropped only when *she* supplies the thing (even if equal to the assumption) | views + coordinator tests |
| D6 | The UI provider used the wall clock while the store used another: "today" meant two things | render test | injectable `now` on `CaptureProvider` | UI suite |
| D7 | Render tests hung the runner: the store provider's 60 s interval keeps Node alive | first UI run | every renderer unmounted in `after` | full `npm test` exits by itself |
| D8 | Clause merging re-scanned the growing accumulated text for every fragment, and the abbreviation check re-read all preceding text at every full stop (quadratic; 597 ms on a desktop for 360 fragments) | adversarial stress run | anchors are tracked as fragments join instead of re-scanned; the abbreviation check looks at the last 12 characters. Worst adversarial input: **35 ms**. | 15 hostile-input timing tests + a scaling test (4× the input must cost < 10×) |
| D9 | After a discovery conclusion, or when the conversation cannot take a mid-discovery reply, a real errand ("Dentist Friday at 3pm") got a scripted reply instead of being captured | design review of the routing | `capture/routing.ts`: only text the conversation would not have understood *and* the reader recognises is captured; scripted inputs still route to the conversation | routing suite (truth table; every scripted starter/option typed in free text) |
| D10 | An answer could not change the kind ("actually it's just a to-do"), so scenario V1 was only claimed | scenario review | `kindFromText`, shared by answers and corrections; the question that was open stays open | coordinator V1 |

Findings that are not Feature 02's to fix (recorded for the audit): the permanent `Sheet` backdrop has a label but no
`accessibilityRole` (MGP-4); the `interpretation` observation vocabulary has no "corrected" outcome (G3).

## 22. Scenarios A–AB

Test locations: **R** = `talkItOutCapture.reader.test.mjs`, **C** = `…coordinator…`, **V** = `…views…`, **U** = `…ui…`.
All rows below are mechanically asserted. "Render evidence" = golden view-model text tree (V) and the runtime
screenshots in `docs/feature-02-evidence/` (§23.2).

| # | Class | Fixture (envelope phrasing; other phrasings also tested) | Key assertions (where) | Result |
|---|---|---|---|---|
| A | SL | "Dentist Friday at 3pm" | source only after submit; one supported proposal; no needless question; review → accept → one event; provenance lineage (R, C, V, U) | PASS |
| B | SL | "Dentist next Friday at 3" / "Dentist Friday at 3" said on a Friday | asked, not guessed; candidates a week apart; property-tested for every weekday × a fortnight; anchored to when she said it (R, C) | PASS |
| C | SP | "Picture day is Thursday, I need to send $20, and I think practice moved to 6." | one source, three independent proposals (R, C) | PASS |
| D | SL | same | accept one, reject one, leave one; only accepted materialises; unresolved stays active; survives restart (C, V) | PASS |
| E | SL | "No, I meant next Friday at 4pm" | supersede, v1 keeps original claim, wrong reading can never materialise; typed edit ≡ spoken correction (C, U) | PASS |
| F | SL | "I think practice moved to 6" | hedge carried as an assumption; badge stays POSSIBLE; never shown as her certainty (R, V) | PASS |
| G | SL | "asdf qwerty", "I want mornings…" | no fabricated record; source kept unread (R, C) | PASS |
| H | SP | "Soccer every Tuesday at 4", "Practice moved to 6", "I owe €40", multi-date/amount | explicit unsupported reason; never an `other` bag; typed shape enforced over 2,000 random sentences (R, C) | PASS |
| I | SL | double / concurrent / post-restart accept | one row, one observation (C, U) | PASS |
| J | SP+FB | "Jordan will pick up Ayden at 5" | mention ≠ account ≠ accepted; nothing created; review says nothing was recorded (R, C) | PASS (responsibility recording FOUNDATION-BLOCKED, safe) |
| K | SP | "I owe Jordan $85" / "Jordan owes me $85" | distinct outflow / inflow persisted; no cue → asked or untyped (R, C) | PASS |
| L | SL | "I want mornings to feel less chaotic" | no forced task, nothing materialised; conversation-topic feelings stay the existing conversation; the rest is kept unread (R, C, routing suite) | PASS |
| M | SL | resolve everything | source leaves the active inbox; history stays (V) | PASS |
| N | SL | fresh household | calm empty state; no action, no celebration (V, U) | PASS |
| O | SL | unreadable / over-window text | no fabricated understanding; nothing read past the window (R, C) | PASS |
| P | SL | demo household | demo provenance; `refuseDemo`; no real household contamination (C) | PASS |
| Q | SL | typing / preview vs send | preview writes nothing; send makes one source (C) | PASS |
| R | SL (OD-1) | kill mid-clarification / mid-review | question regenerates from the durable reading alone; accepted work does not duplicate; unresolved does not vanish; an answer is durable exactly when the reinterpretation is (C) | PASS |
| S | SL | any flow | the source record is never edited; original wording exactly as sent (C) | PASS |
| T | SL | hydrating / unreadable store | loading ≠ empty; recovery ≠ nothing waiting (V, U) | PASS |
| U1–U3 | SL | "Pick him up from practice at 5pm" | two children → question, no row; one child → resolved; accepted row is child-scoped with a real child and validates (R, C, U) | PASS |
| V1–V3 | SL | answers that pivot / abandon / do not answer | kind-change words honoured; abandoned stays resumable; unresolved after 3 tries, nothing materialises (C) | PASS |
| W | SL | "Dentist…, send $20, practice moved to 6" | supported items resolve; unsupported one stays explicit and open (R, C) | PASS |
| X | SL (OD-1) | source saved, readings not | one source, retry in session adds no duplicate; after restart honestly unreadable, dismissible (C) | PASS |
| Y | SL | unknown person | no person / role / account created (R, C) | PASS |
| Z | SL | correction changes kind | prior reading never materialises; no orphaned accepted state (C) | PASS |
| AA | SL | "Dentist Friday at 3pm", left unresolved | urgency rises none→soon→today→now, then stays *passed*; never a confirmed event; typed projection; no Feature 01 coupling (V) | PASS |
| AB | SL | source was wrong | original untouched; new capture is its own source (C) | PASS |

No scenario is classified DEFERRED-ON-LLM as a whole; the deferred-on-LLM *phrasings* listed in §10 each behave safely.

## 23. Runtime and visual evidence — HONEST STATUS

**On-device / visual verification was NOT EXECUTED. It was attempted and blocked by the host, not by the feature.**

A sub-agent was given an isolated 12-step device pass (own emulator, own Metro port, no contact with any sibling
session's device). Its notes are kept verbatim in `docs/feature-02-evidence/RUNTIME_NOTES.txt`. In short:

* the emulator refused to boot: `Insufficient RAM free for launching emulator` (commit 61 GB of a 65 GB limit; the
  AVD forces 4,096 MB and `-memory 3072` did not lower it);
* a later attempt started a process that never got a running guest (`emulator-5556 offline` for 13+ minutes, working
  set 0 MB, CPU frozen);
* the only running device (`emulator-5554`) belongs to another session and was not touched;
* the host stayed starved for the rest of the run (available RAM never above 577 MB; heavy paging), which sibling
  builds also hit; the headless emulator's `screencap` is also known to return an empty file on this machine;
* no web fallback exists (`react-native-web` is not installed; adding it would be a new dependency).

**Consequently no screenshots exist and contract §70 (visual evidence) is NOT satisfied.** This is recorded as an
audit item, not glossed over.

**What stands in for it (and what each does and does not prove):**

| Evidence | Proves | Does **not** prove |
|---|---|---|
| Golden view-model text trees (`talkItOutCapture.views.test.mjs`) | phase, source, proposals, confidence, unresolved reason, actions, Inbox presence, attention state for representative scenarios (contract §69) | pixels |
| 21 render tests on the real providers, real store, real coordinator (`…ui.test.mjs`) | structure, copy, roles and labels, and behaviour through the actual components (accept, double-tap, area gating, question by choice/text, Fix it both routes, Inbox states) | layout, truncation, touch-target size, native keyboard behaviour |
| Mechanical scans (copy in JSX, tokens only, no logging/network/storage, no sibling imports, no UI domain writes) | the absence of whole classes of defect | visual quality |
| Hermes compile check (`…hermes.test.mjs`) | the reader's ~110 regex literals and 37 runtime-built expressions are accepted by the **real Hermes compiler** (with a negative control that fails as it should) | Hermes *runtime* behaviour |
| Expo Android export (§24) | the app bundles with the new imports and routes | the app runs correctly |

**Not covered by anything here:** layout and clipping on a real screen, keyboard avoidance for the composer and the
Fix sheet, persistence across a real force-stop on a device, the Calendar showing an accepted item, screen-reader
behaviour on TalkBack, and the visual result of dark mode.

**Device checklist for the auditor** (needs ≈6 GB of physical RAM free; run the emulator as a tracked background
task; the app uses the curly apostrophe ’ in copy): (1) Life → Life Inbox: row says "Nothing waiting"; empty state has
no button. (2) Her Keys AI: no Voice control; disclaimer line present. (3) "Dentist Friday at 3pm" → review card with
POSSIBLE badge, assumption note, three buttons. (4) Save → "Saved as an appointment."; the event appears in Calendar
once. (5) "Pick him up from practice at 5pm" → child question, no Save, no time shown as fact; answer → review. (6)
The three-item message → Area chooser gates Save; reject one; leave one. (7) Fix it → say "No, I meant next Friday at
4pm" → card updates. (8) Decide later → "Left in your Life Inbox." (9) Life Inbox lists only unresolved items. (10)
Force-stop Expo Go, relaunch: unresolved items remain; the words are replaced by the honest message; the event exists
exactly once. (11) "He hit me again and I have to call the school tomorrow" → calm message, no card, nothing in the
Inbox. (12) "I feel like I am always behind" → the existing discovery conversation, no capture card.

## 26. Builder validation (an attack pass by the builder — explicitly NOT the independent audit)

Each item was attacked, in tests where a test can attack it and by reading where it cannot.

| Attack | Result | Evidence |
|---|---|---|
| chatbot drift | none | no generative reply anywhere; discovery conversation is the inherited script; capture is cards, not chat |
| therapy / cheerleading / cutesy copy | none | every string audited mechanically (`copyCorpus`) against forbidden phrases, emoji, `!` |
| notes-app drift | none | the source is evidence, not an editable note; "a note for you" is the foundation's own Needs Me kind, created only on her acceptance |
| activity-feed Inbox drift | none | active = unresolved only; accepted/rejected/superseded/withdrawn never listed (views M, N) |
| source rewritten after submit | none | source record byte-identical after answer, correction, accept (coordinator S); no edit path exists |
| inference shown as fact | none | POSSIBLE badge, "You weren't sure", assumption notes, provenance label "Her Keys inferred this"; no provisional value shown while a question is open |
| rejected proposal resurfacing | none | stays rejected across restart; cannot be accepted (coordinator 33); server-side freeze trigger exists |
| unresolved remainder disappearing | none | partial acceptance + restart keeps the open reading (coordinator D); note kept for unsupported clauses |
| child subject guessed or null | none | 2,000 random sentences: `childScoped ⇒ subject ∨ asking who`; U1–U3; foundation validator agrees |
| unknown person auto-created | none | `people` and `responsibilities` stay empty (J/Y) |
| money direction reversed / invented | none | outflow ≠ inflow persisted; no cue ⇒ asked or untyped |
| unsupported meaning forced into "other" | none | proposal shape is exactly the typed set (asserted over 2,000 random inputs) |
| fixture-string interpreter posing as NLP | bounded and disclosed | novel phrasings read; weekday rule property-tested; disclosure in §9.1 |
| excessive clarification | none | only three material questions exist; none for category or optional fields; a one-child household and an unambiguous weekday are never asked |
| infinite clarification | impossible | ≤3 steps by construction; ≤3 unparseable answers then manual correction |
| duplicate materialisation | none | double, concurrent and post-restart accept: one row, one observation |
| raw-source logging | none | §18 |
| generic JSON bag | none | no `any`, no `Record<string, any>`, no `@ts-ignore` in the feature; `unknown` appears once, in `copyCorpus()`'s local narrowing helper (a tone-audit utility), never in a domain contract; the proposal shape is asserted exact |
| direct UI domain writes | none | §71 scan + all writes through `coordinator` → `store.commit` |
| new primary tab / shell change | none | `app/(app)/_layout.tsx`, `app/_layout.tsx` unchanged (§14) |
| Feature 01 dependency | none | zero imports either way (§24) |
| global primitive duplication | none | §15 register, no new global primitive |
| foundation mutation | none | `git diff 5007b0f..HEAD` empty for `supabase`, `src/domain`, `src/persistence`, `src/state`, `src/design`, `src/types`, package files |

**Known limitations, stated plainly:** (1) her words do not survive an app restart (OD-1); (2) multi-clause splitting is a
heuristic and English/US-only, dollars-only; (3) assumption notes and area choices are session-only, so after a restart
the review says so generically rather than reconstructing them; (4) an unread source is only a hollow "you shared
something" entry after a restart; (5) no on-device verification (§23); (6) the design system's `Sheet` backdrop lacks an
accessibility role (MGP-4).

## 24. Exit gates (recomputed at the final `HEAD`, not copied from the contract)

| Gate | Expected | Measured at exit |
|---|---|---|
| TypeScript | pass | **pass** (`tsc --noEmit`, exit 0) |
| App tests (`npm test`, no forced exit) | ≥ 808 / 0 fail | **1074 / 1074, 204 suites, 0 fail, exit 0** |
| Feature 02 tests | — | **266** (reader 167 · coordinator 41 · views 26 · ui 21 · routing 7 · hermes 4) |
| Backend harness (`supabase/tests/run.mjs`) | 684 / 684 | **684 / 684, exit 0** — run against this worktree's migrations; no sibling harness was running (checked first) |
| Expo Doctor | 21 / 21 | **21 / 21** |
| Expo Android export | pass | **pass** — 1,628 modules bundled and Hermes-compiled to a 6.4 MB `.hbc` (`dist/` is git-ignored) |
| Shipping migration SHA-256 | `1e9169de…a7cb` | **`1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`** (on-disk bytes) |
| Baseline migration SHA-256 | `8bc38d66…16f` | **`8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f`** (LF git blob); on-disk in this worktree it is CRLF (`81909daa…`) because `core.autocrlf=true` — explained in §1.3, not drift |
| `git diff 5007b0f..HEAD -- supabase src/domain src/persistence src/state src/design src/types package*.json app.json` | empty | **empty** |
| Local fingerprint | `199ed4d4…` / 3613 facts | **MATCH — 3613 facts, `199ed4d4c1b37cd654b5853e91cbde27`**, measured read-only on the default local database (no `db reset`). A bare `create database` gives 3606: exactly 7 fewer environmental ACL facts, every migration-derived dimension identical |
| Privacy review | no raw-source logging path | **clean** — §18, and enforced by a test |
| Feature 01 independence | none | **none** — commands below |
| Shared-file touch report | minimal, recorded | **5 pre-existing files modified**, all in §14; everything else new |
| `git status` | clean | clean at the closing commit |

**Feature 01 independence — commands and results (worktree `C:\Users\jsmit\Her-Keys-F02`):**

```
grep -nE "^\s*(import|export)[^;]*from\s+['\"][^'\"]*(features/(today|calendar|systems|daily-load|home|kids|work|money|meals|one-move|life|tasks)|/today/)[^'\"]*['\"]" \
     -r src/features/talk-it-out tests/talkItOutCapture.*.test.mjs tests/support/capture*.mjs        → no matches
grep -rnE "(import|require)\(['\"][^'\"]*features/(today|calendar|systems)" src/features/talk-it-out tests/talkItOutCapture.*  → no matches
grep -rln "talk-it-out/capture" src app tests  (outside the feature and its tests)
                                                                                                    → src/store/TalkItOutContext.tsx, app/(app)/life/inbox.tsx, app/(app)/life/index.tsx
                                                                                                       (the three shared files §14 records; no sibling-owned file)
```

A test (`…ui.test.mjs`, "independence") asserts the same in both directions on every run.

## 25. Git

Stacking commits on `feature/02-talk-it-out-life-inbox`, forked directly from `5007b0f`; explicit path staging; no amend,
no rebase, no squash, no push, no PR, no merge.

| Commit | Content |
|---|---|
| `029a306` | L0/L1 — ledger: entry gates, inheritance, foundation trace, lifecycle + sync maps, owner decisions |
| `cbfab72` | L2/L3 — typed interpreter port, deterministic local reader, capability envelope, 150 reader tests |
| `c34789a` | L3–L5 — coordinator (source, propose, clarify, correct, accept/reject, idempotency), text-store port, 40 state tests |
| `777254b` | L4/L6 — view models, unresolved-capture attention projection, centralised copy, tone audit |
| `ecf63f1` | L5/L6 — capture UI, Talk It Out integration, Life Inbox in the Life stack, 20 render tests |
| `4970978` | L7/L8 — routing rule, kind-change answers, linear-time clause merging, performance guards |
| *(closing)* | L9 — Hermes compile-check test, runtime notes, ledger completion |

## 27. Test accounting (contract §81)

| ENTRY | PRESERVED | REWRITTEN | REPLACED | REMOVED | ADDED | FINAL | FAILURES |
|---|---|---|---|---|---|---|---|
| 808 | 808 | 0 | 0 | 0 | 266 | **1074** | **0** |

No existing test file was edited (`git diff --name-only 5007b0f..HEAD -- tests` lists only new `talkItOutCapture.*`
files, `tests/support/capture*.mjs`, and one **additive** test-support change: an `AppState` stub in
`tests/support/rn-stub.tsx`). The increase in count is not offered as proof of coverage: the coverage argument is the
per-scenario mapping in §22 and the invariants in §26.

## 28. Feature verdicts and final status

**1. Does Talk It Out turn messy human input into reviewable, traceable, correctable structure without pretending
interpretation is truth?** — **PASS.** Every reading is a typed proposal held outside canonical state at `possible`,
labelled as Her Keys' inference with its assumptions and hedges; nothing becomes real without an explicit accept, which
is the only thing that reaches `established`; a rejection is permanent; a correction is a new reading that names the one
it replaces (the original claim is kept, never rewritten); the source record is never edited; child subject, money
direction and unknown people are never guessed. **Caveat (OD-1):** "traceable" is to the source *record* and the
reading chain; her exact words are not retained beyond the session, because the foundation has no content store and
creating one is an owner decision.

**2. Does Life Inbox represent unresolved life admin rather than becoming a second task list or an activity feed?** —
**PASS.** Membership is derived from unresolved readings only; accepted rows, history and withdrawn sources are never
listed; empty is a calm fact; loading, recovery and empty are three different states; ordering is by meaning with no
score; a time-bound unresolved capture keeps rising in urgency and never fades after its time passes.

**3. Does the local interpreter stay honest about its capability boundary rather than simulating general NLP through
fixture rules?** — **PASS.** **LOCAL INTERPRETER CAPABILITY: GENERALIZES WITHIN DOCUMENTED ENVELOPE.** It reads by rule
(novel phrasings are read; the weekday rule is property-tested), never claims more than `possible`, reports what it
does not support explicitly, and refuses to read past its window. It is bounded pattern matching over a listed
vocabulary and is not general natural-language understanding.

**Audit priorities** (things a reviewer should weigh first): (a) **OD-1** — her words do not survive a restart; **OD-2** —
the high-stakes guard is a stopgap, not a policy; (b) **on-device and visual verification were not executed** (§23);
(c) foundation gaps G1–G5 (§5); (d) the design system's `Sheet` backdrop accessibility role (MGP-4).

```
FINAL STATUS:
HK-FEATURE-02-TALK-IT-OUT = PASS   (builder-verified; on-device/visual verification NOT executed — see §23)
READY FOR INDEPENDENT FEATURE 02 AUDIT = YES
```

Not done, by contract: no merge, push or PR; no import of another feature; no Gemini, Supabase, cloud speech or auth
work; no shared-foundation change; no integration begun.
