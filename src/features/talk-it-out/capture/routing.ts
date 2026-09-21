import type { DiscoveryStage } from '../../../types';

/**
 * Where a free-typed message goes: to the CAPTURE pipeline (turn what she said into reviewable proposals) or to
 * the existing scripted DISCOVERY conversation ("something feels off").
 *
 * The rule keeps the existing conversation exactly as it was wherever it understands her, and lets it hand a real
 * errand to capture instead of answering "I didn't catch that":
 *
 *   listening   recognised → capture. Nothing recognised: a discovery topic opens (feelings, patterns) → discovery;
 *               if the conversation has nothing either → capture, kept as an unread source (never silently dropped).
 *   clarifying  a message the conversation reads as her ANSWER stays an answer. Only text the conversation does not
 *   refining    understand AND the reader recognises as something to save is captured.
 *   resolved    the investigation is over. Something recognisable is captured; anything else gets the existing reply.
 *
 * Quick replies never come here: they are answers by construction. Input with no words to go on ("!!!", an emoji) keeps
 * the conversation's existing behaviour — it opens nothing and is not kept as a source (existing input semantics).
 */
export interface RoutingInput {
  stage: DiscoveryStage;
  /** The message contains at least one letter or digit. Symbol-only input has no words to go on. */
  hasWords: boolean;
  /** False when the household has not loaded yet: nothing can be captured, so the conversation behaves as before. */
  readerAvailable: boolean;
  /** The reader found something to propose, or something that must be kept and handled carefully (over-window, high-stakes). */
  recognized: boolean;
  /** The discovery conversation took the message as a topic or an answer (its turn is not "unmatched"). */
  conversationUnderstood: boolean;
}

export type MessageRoute = 'capture' | 'discovery';

export function routeMessage({ stage, hasWords, readerAvailable, recognized, conversationUnderstood }: RoutingInput): MessageRoute {
  if (!readerAvailable || !hasWords) return 'discovery';
  switch (stage) {
    case 'listening':
      return recognized || !conversationUnderstood ? 'capture' : 'discovery';
    case 'resolved':
      return recognized ? 'capture' : 'discovery';
    case 'clarifying':
    case 'refining':
      return recognized && !conversationUnderstood ? 'capture' : 'discovery';
  }
}
