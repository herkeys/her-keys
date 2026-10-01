import { conversationStarters, discoveryTopics } from '../data/seed/talkItOutScript';
import { advance, createInitialState, createOpeningMessage, openingQuickReplies } from '../features/talk-it-out/engine';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../types';
import type { TransitionContext } from './context';
import { provenanceFor, talkItOutProvenance } from './foundation/provenance';
import { classifyConversationOutcome } from './reasoning/conversationBoundary';
import type { AppState, DiscoveryRecord } from './state';

/**
 * Talk It Out remembers the structure of an investigation, not the
 * conversation: the topic, and which scripted answer she gave to which
 * question. Her own words and Her Keys' replies are never stored.
 *
 * On relaunch the answers are replayed through the same deterministic engine,
 * which rebuilds the hypothesis, the pending question and any conclusion. Her
 * earlier answers come back as the option she chose, marked as recalled, so
 * nothing is shown as a quotation she didn't type.
 */

type DraftMessage = Omit<TalkItOutMessage, 'id'>;

export interface DiscoveryReplay {
  conversation: ConversationState;
  quickReplies: ClarificationOption[];
  messages: DraftMessage[];
}

export function freshDiscovery(): DiscoveryReplay {
  return { conversation: createInitialState(), quickReplies: openingQuickReplies(), messages: [createOpeningMessage()] };
}

/** Null when the record no longer fits the script — the caller discards it rather than guessing. */
export function replayDiscovery(record: DiscoveryRecord | null): DiscoveryReplay | null {
  if (!record) return freshDiscovery();

  const topic = discoveryTopics.find((t) => t.id === record.topicId);
  const starter = conversationStarters.find((s) => s.id === record.topicId);
  if (!topic || !starter) return null;

  const messages: DraftMessage[] = [createOpeningMessage(), { speaker: 'user', recalled: 'topic', text: starter.label }];

  let turn = advance(createInitialState(), starter.label, starter.id);
  if (turn.state.topicId !== topic.id) return null;
  messages.push(...turn.messages);

  for (const answer of record.answers) {
    const question = turn.state.pendingQuestion;
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (!question || question.id !== answer.questionId || !option) return null;

    messages.push({ speaker: 'user', recalled: 'answer', text: option.label });
    turn = advance(turn.state, option.label, option.id);

    const recorded = turn.state.evidence[turn.state.evidence.length - 1];
    if (!recorded || recorded.questionId !== answer.questionId || recorded.optionId !== answer.optionId) return null;
    messages.push(...turn.messages);
  }

  return { conversation: turn.state, quickReplies: turn.quickReplies, messages };
}

/**
 * A provider turn may be more conversational than the original scripted
 * discovery tree. Only the exact scripted topic/question/option structure is
 * durable, because replayDiscovery must be able to reconstruct it without
 * inventing the user's words after a relaunch.
 */
export function isReplayableDiscoveryConversation(conversation: ConversationState): boolean {
  if (conversation.topicId === null) return true;

  const topic = discoveryTopics.find((candidate) => candidate.id === conversation.topicId);
  if (!topic) return false;
  if (conversation.evidence.length > 2) return false;

  let question = topic.firstQuestion;
  for (let index = 0; index < conversation.evidence.length; index += 1) {
    const evidence = conversation.evidence[index];
    if (evidence.questionId !== question.id) return false;
    const option = question.options.find((candidate) => candidate.id === evidence.optionId);
    if (!option) return false;

    if (index === 0) {
      const branch = Object.prototype.hasOwnProperty.call(topic.branches, option.id) ? topic.branches[option.id] : undefined;
      if (!branch) return false;
      question = branch.followUp;
    }
  }

  return true;
}

/**
 * Gemini can discuss subjects outside Build 1's four scripted discovery trees.
 * Those turns remain in-memory conversation only. If a dynamic subject replaces
 * a previously stored scripted topic, clear that stale record rather than
 * presenting it as the active conversation after a relaunch.
 */
export function applyProviderDiscoveryConversation(
  state: AppState,
  ctx: TransitionContext,
  conversation: ConversationState
): AppState {
  if (isReplayableDiscoveryConversation(conversation)) {
    return applyDiscoveryConversation(state, ctx, conversation);
  }

  if (state.discovery !== null && state.discovery.topicId !== conversation.topicId) {
    return clearDiscovery(state);
  }

  return state;
}

/**
 * Stores the conversation's structure, or clears it when no topic is open.
 * Unchanged structure writes nothing.
 *
 * The decision itself lives in `classifyConversationOutcome`, so whether a
 * given turn is talk or a household change can be asserted without going
 * through the store (B4-INGESTION-LOCK section 19).
 */
export function applyDiscoveryConversation(state: AppState, ctx: TransitionContext, conversation: ConversationState): AppState {
  const current = state.discovery;
  const outcome = classifyConversationOutcome(conversation, current);

  switch (outcome.kind) {
    case 'conversation-only':
      return state;
    case 'clear-discovery':
      return clearDiscovery(state);
    case 'structured-discovery': {
      const sameTopic = current !== null && current.topicId === outcome.topicId;
      const record: DiscoveryRecord = {
        id: sameTopic ? current.id : ctx.createId('discovery'),
        topicId: outcome.topicId,
        answers: outcome.answers,
        // A Talk It Out turn just wrote these answers, so the record is Talk It Out's.
        provenance: provenanceFor(state.origin, talkItOutProvenance()),
        scope: 'personal',
      };
      return { ...state, discovery: record };
    }
  }
}

export function clearDiscovery(state: AppState): AppState {
  return state.discovery === null ? state : { ...state, discovery: null };
}
