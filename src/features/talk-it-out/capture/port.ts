import { clarify, interpret, readCorrection } from './local/interpret';
import type { TalkItOutInterpreterPort } from './types';

/**
 * THE LLM SEAM.
 *
 *   path        src/features/talk-it-out/capture/port.ts  (interface: capture/types.ts)
 *   API         interpret(TalkItOutInput) / clarify(ClarificationInput) / readCorrection(CorrectionTextInput)
 *   input       raw text + MINIMUM context (logical time, child and person candidates, the areas that exist)
 *   output      typed Proposals, typed UnsupportedItems, a typed failure — no free-form JSON
 *   status      FEATURE-LOCAL to Feature 02 (SHARED-ABSTRACTION CANDIDATE, decided at integration)
 *
 * INTEGRATION RECONCILIATION NOTE: Feature 01 may create its own narrative-generation port. The two do
 * different jobs (that one writes words about the day; this one reads words into typed proposals). An
 * integration pass should give all AI-facing ports one repository home; this branch deliberately does not
 * import from, or create shared code for, any sibling feature.
 *
 * Future shape: SOURCE ARTIFACT → minimum necessary context → this port → typed proposals → review →
 * canonical mutation. Never the whole household state into a model, never free-form JSON into a write.
 * No model SDK, prompt, Edge Function, secret or network call belongs here.
 */
export const localInterpreter: TalkItOutInterpreterPort = { interpret, clarify, readCorrection };
