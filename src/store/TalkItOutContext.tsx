import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  advance,
  createInitialState,
  createOpeningMessage,
  openingQuickReplies,
} from '../features/talk-it-out/engine';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../types';

interface TalkItOutContextValue {
  messages: TalkItOutMessage[];
  /** Suggested answers to the question currently on the table. */
  quickReplies: ClarificationOption[];
  /** True once the conversation has moved past its opening line. */
  canRestart: boolean;
  sendMessage: (text: string) => void;
  selectQuickReply: (option: ClarificationOption) => void;
  restart: () => void;
}

const TalkItOutContext = createContext<TalkItOutContextValue | null>(null);

/**
 * Global so the same conversation is visible whether it was started from the
 * onboarding invitation, the Her Keys AI tab, or the inline Talk It Out entry
 * on Today — matching the product principle that problem routing is the
 * agent's job, not something the user manages across separate screens.
 *
 * Holds the ConversationState, so an answer is interpreted as a reply to the
 * pending question rather than as a brand-new statement. In memory only.
 */
export function TalkItOutProvider({ children }: { children: ReactNode }) {
  const counterRef = useRef(0);
  const makeId = () => {
    counterRef.current += 1;
    return `msg-${counterRef.current}`;
  };

  const [messages, setMessages] = useState<TalkItOutMessage[]>(() => [{ ...createOpeningMessage(), id: 'msg-0' }]);
  const [state, setState] = useState<ConversationState>(createInitialState);
  const [quickReplies, setQuickReplies] = useState<ClarificationOption[]>(openingQuickReplies);

  function submit(text: string, optionId?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const turn = advance(state, trimmed, optionId);
    const userMessage: TalkItOutMessage = { id: makeId(), speaker: 'user', text: trimmed };
    const replies = turn.messages.map((message) => ({ ...message, id: makeId() }));

    setMessages((prev) => [...prev, userMessage, ...replies]);
    setState(turn.state);
    setQuickReplies(turn.quickReplies);
  }

  function restart() {
    setMessages([{ ...createOpeningMessage(), id: makeId() }]);
    setState(createInitialState());
    setQuickReplies(openingQuickReplies());
  }

  const value: TalkItOutContextValue = {
    messages,
    quickReplies,
    canRestart: messages.length > 1,
    sendMessage: (text) => submit(text),
    selectQuickReply: (option) => submit(option.label, option.id),
    restart,
  };

  return <TalkItOutContext.Provider value={value}>{children}</TalkItOutContext.Provider>;
}

export function useTalkItOut(): TalkItOutContextValue {
  const ctx = useContext(TalkItOutContext);
  if (!ctx) throw new Error('useTalkItOut must be used within TalkItOutProvider');
  return ctx;
}
