# HER KEYS — BUILD 2 GEMINI HANDOFF

Status date: 2026-10-01

## Certification ledger

BUILD2_START_SHA=2370229a3a58986d2a5ce6b43498f878c58a9f7c  
BUILD2_IMPLEMENTATION_SHA=ee77c82ef5c90efcc76118c9468a831ed419cbce  
BUILD2_END_SHA=NOT_CERTIFIED  
BRANCH=build/02-gemini-integration

BUILD1_CLOSED=YES  
UI_POLISH_CARRIED_FORWARD=YES

GEMINI_INTEGRATED=YES_REPO_SIDE  
GEMINI_MODEL=gemini-3.8-flash  
GEMINI_API=Gemini Interactions API v1  
GEMINI_AUTH_METHOD=Gemini authorization key via x-goog-api-key, stored server-side as GEMINI_API_KEY  
GEMINI_SERVER_SIDE_ONLY=YES  
GEMINI_CLIENT_SECRET_EXPOSURE=NO

EDGE_FUNCTION=herkeys-ai  
STAGING_DEPLOYED=NO  
PRODUCTION_DEPLOYED=NO

STRUCTURED_OUTPUT=YES  
SERVER_SCHEMA_VALIDATION=YES  
STORE_FALSE=YES  
RAW_CONVERSATION_LOGGING=NO

DETERMINISTIC_ENGINE_PRESERVED=YES  
FALLBACK_AVAILABLE=YES

CLIENT_CONTRACT_CHANGED=YES_ADDITIVE_ASYNC_STATUS_AND_RETRY  
DATABASE_CHANGED=NO  
PERSISTENCE_CHANGED=YES_REPLAY_SAFETY_ONLY  
AUTH_ARCHITECTURE_CHANGED=NO

TESTS=NEW_BUILD2_TESTS_AND_20_BEHAVIOR_FIXTURES_ADDED_NOT_EXECUTED  
FAILURES=UNKNOWN_UNTIL_LOCAL_OR_CI_GATES_RUN  
TYPECHECK=NOT_RUN  
EXPO_DOCTOR=NOT_RUN  
EXPO_INSTALL_CHECK=NOT_RUN  
EXPO_CONFIG_PUBLIC=NOT_RUN  
EXPO_CONFIG_INTROSPECT=NOT_RUN

LIVE_GEMINI_STAGING_PROOF=FAIL_BLOCKED  
ANDROID_SMOKE=NOT_AVAILABLE  
IOS_SMOKE=NOT_AVAILABLE

READY_FOR_BUILD2_TEST_ARTIFACT=NO

IOS_BUILD_NUMBER=2_UNCHANGED  
ANDROID_VERSION_CODE=1_UNCHANGED  
APP_VERSION=1.0.0_UNCHANGED

ALLONDA_FEEDBACK_HOLD=NOT_ACTIVE_YET

## Why certification is blocked

The repository-side implementation is committed to the Build 2 branch, but this execution environment does not have authorized access to the Her Keys Supabase projects.

Expected Her Keys Staging project:

`fhhudicklmpofuzkxeqe`

Expected Her Keys Production project:

`npykvnxnehlsdlbumzwk`

The connected Supabase account exposed only KScan projects. A direct read attempt against Her Keys Staging returned a permission error. No deployment was attempted against any KScan project.

Because Staging cannot be accessed here, the following required gates remain unperformed:

- configure/verify the server-only Gemini authorization key in Her Keys Staging
- configure/verify `GEMINI_MODEL=gemini-3.8-flash`
- deploy `herkeys-ai` to Her Keys Staging
- execute an authenticated live Staging request
- prove provider=gemini and fallback_used=NO
- run the repository's local automated gates
- run emulator/device smoke
- create a Build 2 testing artifact

Do not create an EAS/TestFlight/Android testing artifact before those gates pass.

## Current Gemini API choices

Verified against current official Google Gemini documentation on 2026-10-01.

- API: Interactions API. Google documents it as GA and recommended for new Gemini projects.
- Endpoint used: `POST https://generativelanguage.googleapis.com/v1/interactions`.
- Model: `gemini-3.8-flash`, current stable Flash model.
- Authentication: server-side Gemini authorization key in the `x-goog-api-key` header.
- Storage: `store:false`. Her Keys remains authoritative for its own in-memory/session state. No `previous_interaction_id` is used.
- Output: Interactions `response_format` with `type=text`, `mime_type=application/json`, and an explicit JSON Schema.
- Thinking: `low`; no thinking summary is returned.
- Provider timeout: overall 12-second bounded deadline.
- Retry: maximum one retry, only for transient 408/429/5xx classes.
- Tools/function calling: none in Build 2.

Important retention nuance: `store:false` disables stored Interaction objects for this request path. It should not be described as a promise that no provider-side processing or abuse/security handling can ever occur under Google's terms.

## Exact architecture implemented

```
Her Keys Talk It Out UI
        |
        v
TalkItOutContext
        |
        | authenticated Supabase session
        v
HerKeysAiClient
        |
        v
Supabase Edge Function: herkeys-ai
        |
        | requireUser(req)
        | request schema validation
        | server-only system instruction
        | server-only GEMINI_API_KEY / GEMINI_MODEL
        v
Gemini Interactions API v1
        |
        | response_format JSON schema
        v
server Zod validation
        |
        | state-transition validation
        | evidence-transition validation
        | confidence guard
        | URL guard
        | false app-action claim guard
        | function-call rejection
        v
normalized messages / state / quickReplies
        |
        v
existing Talk It Out UI
```

The mobile app does not call Google directly and contains no Gemini credential.

## Exact files changed

- `src/domain/discovery.ts`
- `src/features/talk-it-out/TalkItOutView.tsx`
- `src/features/talk-it-out/capture/copy.ts`
- `src/features/talk-it-out/providerContract.ts`
- `src/platform/herKeysAiClient.ts`
- `src/store/TalkItOutContext.tsx`
- `src/store/accountRuntimeInstance.ts`
- `supabase/config.toml`
- `supabase/functions/herkeys-ai/index.ts`
- `tests/fixtures/talkItOutAi.behavior.json`
- `tests/talkItOutAi.test.mjs`
- `docs/handoffs/HK_BUILD2_GEMINI_HANDOFF.md`

No unrelated Build 1, Calendar, Weather, RevenueCat, OAuth, navigation, Expo, React Native, or database schema files were changed.

## Server configuration added

Expected Her Keys Staging server configuration:

- `GEMINI_API_KEY` — a current Gemini authorization key, not a legacy standard key
- `GEMINI_MODEL=gemini-3.8-flash`

Neither value belongs in `.env.example`, React Native, Expo public configuration, app.json, IPA, AAB, tests, screenshots, or chat output.

`supabase/config.toml` now declares:

```toml
[functions.herkeys-ai]
verify_jwt = true
```

The function also independently calls `requireUser(req)` before provider access.

## Client contract changes

The existing core turn contract is preserved:

- `messages[]`
- `ConversationState`
- `quickReplies[]`

The Talk It Out context gained additive UI/runtime fields only:

- `isThinking`
- `serviceNotice`
- `canRetry`
- `retryLastTurn()`

The UI now:

- immediately renders the user's submitted message
- shows restrained `Thinking…`
- hides/locks quick replies while one turn is in flight
- blocks duplicate sends
- shows a calm degraded-mode notice when the provider path fails
- permits retry of the same turn without duplicating the user's message
- replaces the deterministic fallback turn if the retry succeeds

No AI-screen redesign was performed.

## Fallback behavior

`src/features/talk-it-out/engine.ts` remains intact and remains the explicit deterministic fallback/reference.

For each ordinary Talk It Out turn the existing deterministic engine is evaluated before the network call. It continues to protect the pre-existing capture-routing decision and provides a safe degraded result if the server/provider path fails.

Provider failure categories handled include:

- network failure
- authorization/session failure
- provider timeout
- provider rate limiting
- provider 5xx
- malformed response
- schema-invalid response

The server performs at most one controlled transient retry. If the client receives no validated live turn, it uses the deterministic turn and does not surface Google/Gemini error text to the user.

Development diagnostics are metadata-only:

- provider=gemini with model/request ID/latency after a valid live turn
- provider=fallback with a non-content reason class after a failed live path

Raw Talk It Out text is not included in these diagnostics.

## Persistence behavior

No database migration was added.

The original Build 1 structured discovery persistence can only replay the deterministic discovery tree. Build 2 therefore adds a replay-safety gate:

- provider turns that still conform to the existing scripted topic/question/option structure may persist through the existing discovery record
- provider-only dynamic topics stay in the in-memory Talk It Out session
- if a dynamic topic replaces a previously stored scripted topic, the stale record is cleared rather than falsely presented as the active conversation later
- raw user/assistant conversation text remains in memory only

This is intentional Build 2 scope control. Durable free-form AI conversation history would require a separate persistence design and privacy review.

## Privacy and logging behavior

The request sends only:

- current Talk It Out conversation state
- the new user message
- selected quick-reply ID when applicable
- at most the 12 most recent Talk It Out messages

It does not automatically send the household database, unrelated financial records, auth tokens, refresh tokens, provider credentials, or unrelated domain records.

The Edge Function's operational log contains only:

- request ID
- model
- latency
- provider status class
- schema-validation result
- token usage counts when returned
- error class

It does not log raw prompts, raw responses, household details, financial details, relationship details, or children's information.

## Output safety/validation

A successful Google HTTP response is not treated as a valid Her Keys turn by itself.

The server rejects:

- malformed JSON
- wrong object shape
- unexpected fields
- unsupported enum values
- oversized normalized fields
- invalid state transitions
- evidence rollback/jumps within the same topic
- confidence above `possible` for a self-report conversation
- resolved state without a result
- unresolved state carrying a result
- unexpected function/tool calls
- URLs
- assistant claims that it already saved/created/scheduled/sent/updated/deleted/paid/purchased/booked something

## Tests added

`tests/talkItOutAi.test.mjs` covers:

- normalized client contract
- malformed/extra/oversized response rejection
- authenticated Edge Function invocation boundary
- client auth/network/malformed failure mapping
- server-only credential/provider URL isolation
- gateway + in-function authentication
- `store:false`
- structured output
- no function/tool calling
- bounded retry/timeout source guards
- post-HTTP schema validation
- no raw-text logging in Talk It Out context/server operational logs
- deterministic fallback presence
- duplicate-submit lock
- degraded-turn retry replacement
- replay-safe vs dynamic AI persistence

`tests/fixtures/talkItOutAi.behavior.json` contains the 20 required behavior/failure fixtures:

1. vague opening
2. household overload
3. kids/logistics
4. money concern
5. work/career
6. home management
7. subject change
8. answer mismatch
9. minimal context
10. long messy description
11. "I don't know"
12. timeout
13. 429
14. malformed output
15. provider unavailable
16. leave/reopen AI
17. double submit
18. network loss
19. false app-action claim
20. schema violation

These fixtures are ready for the live Staging behavioral run. They have not yet been executed against Gemini because Staging access is blocked in this environment.

## Required next certification sequence

1. Use an account/connector authorized for Her Keys Supabase Staging `fhhudicklmpofuzkxeqe`.
2. Verify a current Gemini authorization key exists server-side as `GEMINI_API_KEY`; never print it.
3. Set/verify `GEMINI_MODEL=gemini-3.8-flash`.
4. Deploy `herkeys-ai` to Staging with JWT verification enabled.
5. Run a direct unauthenticated request and prove rejection.
6. Run an authenticated live request and prove:
   - MODEL=gemini-3.8-flash
   - PROVIDER_PATH=GEMINI
   - EDGE_FUNCTION=herkeys-ai
   - STATUS=completed/valid normalized response
   - SCHEMA_VALIDATION=PASS
   - FALLBACK_USED=NO
7. Run all 20 behavior/failure fixtures, using controlled mocks for provider-fault cases and real Staging Gemini for behavior cases.
8. From the authoritative local Build 2 worktree run:
   - `npm run typecheck`
   - `npm test`
   - `npx expo install --check`
   - `npx expo-doctor`
   - `npx expo config --type public`
   - `npx expo config --type introspect`
9. Do not run `expo install --fix` automatically. Record the existing dependency-version debt exactly if it still appears.
10. Run Android emulator smoke and iOS device/TestFlight smoke when available.
11. Only after all preceding gates pass, increment native build/version identifiers as required and create the Build 2 testing artifact.
12. Then activate the Allonda feedback hold and stop feature development except P0/P1 repairs.

## Live Gemini proof

MODEL=gemini-3.8-flash  
PROVIDER_PATH=NOT_EXECUTED  
EDGE_FUNCTION=herkeys-ai  
STATUS=BLOCKED_BY_STAGING_ACCESS  
SCHEMA_VALIDATION=NOT_LIVE_VERIFIED  
LATENCY=NOT_MEASURED  
FALLBACK_USED=NOT_APPLICABLE

## Known debt / deliberate deferrals

- Live Gemini behavioral quality is not certified until the Staging run occurs.
- Dynamic free-form AI conversation state is session-memory only; durable free-form transcript storage was deliberately not introduced.
- No Gemini tool/function ecosystem was added.
- No autonomous app actions were added.
- No database table was added.
- No provider-hosted conversation history is used.
- No Calendar, Weather, OAuth, RevenueCat, subscription, onboarding, navigation, Expo, or React Native refactor was performed.
- Native build numbers remain unchanged because there is not yet a certified Build 2 artifact candidate.

## Build 2 testing instructions for Allonda

NOT YET RELEASED.

Do not give Allonda this branch as the Build 2 test candidate yet. First complete Staging live proof, repository gates, emulator/device smoke, and the testing artifact. Once those pass, her feedback target remains exactly:

- existing Build 1 product/features
- approved post-Build-1 UI/motion polish
- Gemini-powered Talk It Out

Then freeze feature work and collect feedback.
