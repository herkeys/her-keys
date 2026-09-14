import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { applyDiscoveryConversation, clearDiscovery, freshDiscovery, replayDiscovery, type DiscoveryReplay } from '../domain/discovery';
import type { DiscoveryRecord } from '../domain/state';
import { advance } from '../features/talk-it-out/engine';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../types';
import { useAppStore, useHouseholdState } from './AppStateProvider';

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

interface Session {
  /** The stored record this conversation was built from or last saved as. */
  recordId: string | null;
  conversation: ConversationState;
  quickReplies: ClarificationOption[];
  messages: TalkItOutMessage[];
}

const TalkItOutContext = createContext<TalkItOutContextValue | null>(null);

/**
 * Global so the same conversation is visible whether it was started from the
 * onboarding invitation, the Her Keys AI tab, or the inline Talk It Out entry
 * on Today — matching the product principle that problem routing is the
 * agent's job, not something the user manages across separate screens.
 *
 * Messages, including what she types, live only in memory. What's saved is
 * the structured record (topic and chosen answers); after a relaunch the
 * conversation is rebuilt from it by replaying the script.
 */
export function TalkItOutProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const record = useHouseholdState().state.discovery;
  const counterRef = useRef(0);

  const withIds = (drafts: DiscoveryReplay['messages']): TalkItOutMessage[] =>
    drafts.map((draft) => {
      counterRef.current += 1;
      return { ...draft, id: `msg-${counterRef.current}` };
    });

  const startFrom = (stored: DiscoveryRecord | null): Session => {
    const replay = replayDiscovery(stored) ?? freshDiscovery();
    return { recordId: stored?.id ?? null, conversation: replay.conversation, quickReplies: replay.quickReplies, messages: withIds(replay.messages) };
  };

  const [session, setSession] = useState<Session>(() => startFrom(record));
  // Read by handlers so two quick sends build on each other rather than on a stale render (HK-AUDIT-037).
  const sessionRef = useRef(session);

  // The stored record changed without this conversation changing it (a reset, for instance): rebuild from it.
  const storedId = record?.id ?? null;
  if (sessionRef.current.recordId !== storedId && session.recordId !== storedId) {
    const rebuilt = startFrom(record);
    sessionRef.current = rebuilt;
    setSession(rebuilt);
  }

  function update(next: Session) {
    sessionRef.current = next;
    setSession(next);
  }

  function submit(text: string, optionId?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const current = sessionRef.current;
    const turn = advance(current.conversation, trimmed, optionId);
    store.dispatch((state, ctx) => applyDiscoveryConversation(state, ctx, turn.state));

    counterRef.current += 1;
    const userMessage: TalkItOutMessage = { id: `msg-${counterRef.current}`, speaker: 'user', text: trimmed };
    update({
      recordId: store.getSnapshot().state?.discovery?.id ?? null,
      conversation: turn.state,
      quickReplies: turn.quickReplies,
      messages: [...current.messages, userMessage, ...withIds(turn.messages)],
    });
  }

  function restart() {
    store.dispatch((state) => clearDiscovery(state));
    update(startFrom(null));
  }

  const value: TalkItOutContextValue = {
    messages: session.messages,
    quickReplies: session.quickReplies,
    canRestart: session.messages.length > 1,
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
