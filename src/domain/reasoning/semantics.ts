/**
 * What a piece of information *is*, where the distinction changes what the
 * system may do with it.
 *
 * This is deliberately not a wrapper type and nothing is re-modelled to carry
 * it. Her Keys already represents these things as concrete domain records; the
 * labels here let reasoning ask "may I act on this?" without every consumer
 * re-deriving the answer from the record's shape.
 */
export type InformationSemantic =
  | 'fact'
  | 'preference'
  | 'goal'
  | 'commitment'
  | 'constraint'
  | 'observation'
  | 'inference'
  | 'pattern'
  | 'recommendation'
  | 'decision'
  | 'action'
  | 'conversation-only';

/** The domain records that carry reasoning-relevant meaning today. */
export type ReasoningEntityKind =
  | 'event'
  | 'task'
  | 'needsMe'
  | 'category'
  | 'oneMove'
  | 'discovery'
  | 'onboardingGoal'
  | 'onboardingStrength'
  | 'onboardingStruggle'
  | 'operatingProfileInsight'
  | 'actionRecord'
  | 'talkItOutMessage';

/**
 * The classification. An event is a commitment because it occupies time she
 * has already given away; a task is intent she has not yet spent. A One Move
 * is a recommendation until she completes it, at which point the ActionRecord
 * — not the One Move — is the decision.
 */
const SEMANTICS: Record<ReasoningEntityKind, InformationSemantic> = {
  event: 'commitment',
  task: 'commitment',
  needsMe: 'observation',
  category: 'preference',
  oneMove: 'recommendation',
  discovery: 'observation',
  onboardingGoal: 'goal',
  onboardingStrength: 'fact',
  onboardingStruggle: 'observation',
  operatingProfileInsight: 'inference',
  actionRecord: 'decision',
  talkItOutMessage: 'conversation-only',
};

export function semanticOf(kind: ReasoningEntityKind): InformationSemantic {
  return SEMANTICS[kind];
}

/**
 * Whether this kind of information may drive a durable mutation on its own.
 *
 * An inference and a pattern may *inform* a recommendation, but may never
 * become durable state without passing the approval gate — that is the rule
 * that keeps a model's guess out of her household record. Conversation-only
 * content never mutates anything.
 */
export function mayMutateDurableState(semantic: InformationSemantic): boolean {
  return semantic !== 'inference' && semantic !== 'pattern' && semantic !== 'conversation-only';
}

/** Whether this information needs her explicit approval before it is acted on. */
export function requiresApproval(semantic: InformationSemantic): boolean {
  return semantic === 'recommendation' || semantic === 'inference' || semantic === 'pattern';
}
