import { z } from 'zod';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../../types';

const Id = z.string().min(1).max(96);
const Text = z.string().min(1).max(1200);
const Confidence = z.enum(['possible', 'likely', 'established']);

const QuickReplySchema = z.strictObject({
  id: Id,
  label: z.string().min(1).max(120),
  keywords: z.array(z.string().min(1).max(80)).max(12),
  evidenceLabel: z.string().min(1).max(180).optional(),
});

const QuestionSchema = z.strictObject({
  id: Id,
  text: z.string().min(1).max(500),
  options: z.array(QuickReplySchema).min(1).max(6),
});

const EvidenceSchema = z.strictObject({
  questionId: Id,
  optionId: Id,
  label: z.string().min(1).max(180),
});

const HypothesisSchema = z.strictObject({
  statement: z.string().min(1).max(800),
  confidence: Confidence,
});

const ResultSchema = z.strictObject({
  summary: z.string().min(1).max(900),
  confidenceLabel: z.string().min(1).max(80),
  nextStep: z.string().min(1).max(500),
});

export const ConversationStateSchema = z.strictObject({
  topicId: Id.nullable(),
  stage: z.enum(['listening', 'clarifying', 'refining', 'resolved']),
  hypothesis: HypothesisSchema.nullable(),
  evidence: z.array(EvidenceSchema).max(8),
  pendingQuestion: QuestionSchema.nullable(),
  result: ResultSchema.nullable(),
});

const ProviderMessageSchema = z.strictObject({
  speaker: z.literal('herkeys'),
  text: Text,
  stage: z
    .enum(['listen', 'hypothesis', 'refinement', 'clarify', 'result', 'next-step', 'unmatched'])
    .optional(),
  confidenceLabel: z.string().min(1).max(80).optional(),
  confidence: Confidence.optional(),
  evidence: z.array(z.string().min(1).max(180)).max(8).optional(),
});

export const HerKeysAiTurnSchema = z.strictObject({
  messages: z.array(ProviderMessageSchema).min(1).max(3),
  state: ConversationStateSchema,
  quickReplies: z.array(QuickReplySchema).max(6),
  meta: z.strictObject({
    provider: z.enum(['gemini', 'fallback']),
    model: z.string().min(1).max(120),
    requestId: z.string().min(1).max(120),
    latencyMs: z.number().int().nonnegative().max(120_000),
  }),
});

export type HerKeysAiTurn = z.infer<typeof HerKeysAiTurnSchema>;
export type HerKeysAiProviderMessage = Omit<TalkItOutMessage, 'id'>;

export interface HerKeysAiRequest {
  state: ConversationState;
  userText: string;
  optionId?: string;
  history: Array<Pick<TalkItOutMessage, 'speaker' | 'text'>>;
}

export function parseHerKeysAiTurn(value: unknown): HerKeysAiTurn | null {
  const parsed = HerKeysAiTurnSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toClarificationOptions(value: HerKeysAiTurn): ClarificationOption[] {
  return value.quickReplies;
}
