import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  applyDiscoveryConversation,
  applyProviderDiscoveryConversation,
  clearDiscovery,
  freshDiscovery,
  replayDiscovery,
  type DiscoveryReplay,
} from '../domain/discovery';
import type { DiscoveryRecord } from '../domain/state';
import { CaptureProvider, useCapture } from '../features/talk-it-out/capture/CaptureContext';
import { copy } from '../features/talk-it-out/capture/copy';
import { routeMessage } from '../features/talk-it-out/capture/routing';
import { advance, type DiscoveryTurn } from '../features/talk-it-out/engine';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../types';
import { herKeysAiClient } from './accountRuntimeInstance';
import { useAppStore, useHouseholdState } from './AppStateProvider';

/** A capture started in this conversation, shown after the Her Keys message that introduces it. */
export interface CaptureRef {
  afterMessageId: string;
  captureId: string;
}

export type SendResult = 'sent' | 'not-saved' | 'ignored';

interface TalkItOutContextValue {
  messages: TalkItOutMessage[];
  /** Suggested answers to the question currently on the table. */
  quickReplies: ClarificationOption[];
  /** Captures made in this conversation, each rendered after the message it belongs to. */
  captures: CaptureRef[];
  /** True while a submitted Talk It Out turn is waiting for its server response. */
  isThinking: boolean;
  /** Calm product-level notice when the built-in path had to carry a turn. */
  serviceNotice: string | null;
  /** True once the conversation has moved past its opening line. */
  canRestart: boolean;
  /** Resolves 'not-saved' when nothing could be saved, so the composer can give her words back. */
  sendMessage: (text: string) => Promise<SendResult>;
  selectQuickReply: (option: ClarificationOption) => void;
  restart: () => void;
}

interface Session {
  /** The stored record this conversation was built from or last saved as. */
  recordId: string | null;
  conversation: ConversationState;
  quickReplies: ClarificationOption[];
  messages: TalkItOutMessage[];
  captures: CaptureRef[];
}

type DraftMessage = Omit<TalkItOutMessage, 'id'>;

const TalkItOutContext = createContext<TalkItOutContextValue | null>(null);

const DEGRADED_NOTICE = copy.ai.degraded;

/**
 * Global so the same conversation is visible whether it was started from the
 * onboarding invitation, the Her Keys AI tab, or the inline Talk It Out entry
 * on Today — matching the product principle that problem routing is the
 * agent's job, not something the user manages across separate screens.
 *
 * Messages, including what she types, live only in memory. What's saved is
 * only replay-safe structured discovery; a provider-only conversational path
 * is never persisted as if it were a scripted answer.
 *
 * Feature 02 adds a second thing a first message can be: a CAPTURE — something she wants turned into
 * a record. The capture provider is nested here so the root layout does not change.
 */
export function TalkItOutProvider({ children }: { children: ReactNode }) {
  return (
    <CaptureProvider>
      <TalkItOutSession>{children}</TalkItOutSession>
    </CaptureProvider>
  );
}

function TalkItOutSession({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const { coordinator } = useCapture();
  const record = useHouseholdState().state.discovery;
  const counterRef = useRef(0);
  const activeSubmissionRef = useRef<number | null>(null);
  const nextSubmissionRef = useRef(0);

  // One key per composed message: a re-tapped Send is the same submission, not a second capture.
  const submissionRef = useRef(0);
  const submissionKey = () => `s${Date.now().toString(36)}-${submissionRef.current}`;
  const keyRef = useRef(submissionKey());

  const withIds = (drafts: DraftMessage[]): TalkItOutMessage[] =>
    drafts.map((draft) => {
      counterRef.current += 1;
      return { ...draft, id: `msg-${counterRef.current}` };
    });

  const startFrom = (stored: DiscoveryRecord | null): Session => {
    const replay: DiscoveryReplay = replayDiscovery(stored) ?? freshDiscovery();
    return {
      recordId: stored?.id ?? null,
      conversation: replay.conversation,
      quickReplies: replay.quickReplies,
      messages: withIds(replay.messages),
      captures: [],
    };
  };

  const [session, setSession] = useState<Session>(() => startFrom(record));
  const [isThinking, setIsThinking] = useState(false);
  const [serviceNotice, setServiceNotice] = useState<string | null>(null);
  // Read by handlers so async turns always build on the latest committed conversation.
  const sessionRef = useRef(session);

  // The stored record changed without this conversation changing it (a reset, for instance): rebuild from it.
  const storedId = record?.id ?? null;
  if (sessionRef.current.recordId !== storedId && session.recordId !== storedId && activeSubmissionRef.current === null) {
    const rebuilt = startFrom(record);
    sessionRef.current = rebuilt;
    setSession(rebuilt);
  }

  function update(next: Session) {
    sessionRef.current = next;
    setSession(next);
  }

  function say(text: string): TalkItOutMessage {
    counterRef.current += 1;
    return { id: `msg-${counterRef.current}`, speaker: 'herkeys', stage: 'listen', text };
  }

  async function capture(text: string): Promise<SendResult> {
    const outcome = await coordinator.submit({ text, submissionKey: keyRef.current });
    if (outcome.kind === 'refused') return 'ignored';
    if (outcome.kind === 'not-saved') return 'not-saved'; // same key kept, so a retry is the same submission

    submissionRef.current += 1;
    keyRef.current = submissionKey();

    counterRef.current += 1;
    const userMessage: TalkItOutMessage = { id: `msg-${counterRef.current}`, speaker: 'user', text };
    const current = sessionRef.current;

    if (outcome.kind === 'high-stakes') {
      update({ ...current, messages: [...current.messages, userMessage, say(copy.capture.failure('high-stakes'))] });
      return 'sent';
    }
    if (outcome.kind !== 'captured') return 'ignored';

    const reply = say(outcome.readingIds.length > 0 ? copy.capture.understood : copy.capture.understoodNothingSafe);
    update({
      ...current,
      // The opening starters give way to the capture; a discovery question that is still open keeps its answers.
      quickReplies: current.conversation.stage === 'listening' ? [] : current.quickReplies,
      messages: [...current.messages, userMessage, reply],
      captures: [...current.captures, { afterMessageId: reply.id, captureId: outcome.captureId }],
    });
    return 'sent';
  }

  async function submit(text: string, optionId?: string): Promise<SendResult> {
    const trimmed = text.trim();
    if (!trimmed || activeSubmissionRef.current !== null) return 'ignored';

    nextSubmissionRef.current += 1;
    const submissionId = nextSubmissionRef.current;
    activeSubmissionRef.current = submissionId;

    try {
      const current = sessionRef.current;
      const fallbackTurn = advance(current.conversation, trimmed, optionId);

      // A quick reply is an answer by construction. Free text is routed exactly
      // as before Build 2: the deterministic engine remains the routing reference
      // so a provider outage cannot turn a capture into an AI-only conversation.
      if (!optionId) {
        const preview = coordinator.preview(trimmed);
        const route = routeMessage({
          stage: current.conversation.stage,
          hasWords: /[A-Za-z0-9]/.test(trimmed),
          readerAvailable: preview !== null,
          recognized: preview !== null && preview.failure?.code !== 'nothing-recognized',
          conversationUnderstood: fallbackTurn.messages[0]?.stage !== 'unmatched',
        });
        if (route === 'capture') return await capture(trimmed);
      }

      counterRef.current += 1;
      const userMessage: TalkItOutMessage = { id: `msg-${counterRef.current}`, speaker: 'user', text: trimmed };
      const optimistic: Session = {
        ...current,
        // Hide reply chips while the turn is in flight so two taps cannot create two answers.
        quickReplies: [],
        messages: [...current.messages, userMessage],
      };
      update(optimistic);
      setServiceNotice(null);
      setIsThinking(true);

      const call = await herKeysAiClient.advance({
        state: current.conversation,
        userText: trimmed,
        optionId,
        history: current.messages
          .slice(-12)
          .map(({ speaker, text: messageText }) => ({ speaker, text: messageText })),
      });

      if (activeSubmissionRef.current !== submissionId) return 'sent';

      let turn: DiscoveryTurn;
      if (call.kind === 'ready') {
        turn = {
          messages: call.value.messages,
          state: call.value.state,
          quickReplies: call.value.quickReplies,
        };
        store.dispatch((state, ctx) => applyProviderDiscoveryConversation(state, ctx, turn.state));
      } else {
        // The local deterministic engine is deliberately retained as the
        // explicit degraded path. No provider error text is shown to the user.
        turn = fallbackTurn;
        store.dispatch((state, ctx) => applyDiscoveryConversation(state, ctx, turn.state));
        setServiceNotice(DEGRADED_NOTICE);
      }

      update({
        ...optimistic,
        recordId: store.getSnapshot().state?.discovery?.id ?? null,
        conversation: turn.state,
        quickReplies: turn.quickReplies,
        messages: [...optimistic.messages, ...withIds(turn.messages)],
      });
      return 'sent';
    } finally {
      if (activeSubmissionRef.current === submissionId) {
        activeSubmissionRef.current = null;
        setIsThinking(false);
      }
    }
  }

  function restart() {
    // Do not race a reset against an in-flight provider turn.
    if (activeSubmissionRef.current !== null) return;
    store.dispatch((state) => clearDiscovery(state));
    setServiceNotice(null);
    update(startFrom(null));
  }

  const value: TalkItOutContextValue = {
    messages: session.messages,
    quickReplies: session.quickReplies,
    captures: session.captures,
    isThinking,
    serviceNotice,
    canRestart: session.messages.length > 1,
    sendMessage: (text) => submit(text),
    selectQuickReply: (option) => void submit(option.label, option.id),
    restart,
  };

  return <TalkItOutContext.Provider value={value}>{children}</TalkItOutContext.Provider>;
}

export function useTalkItOut(): TalkItOutContextValue {
  const ctx = useContext(TalkItOutContext);
  if (!ctx) throw new Error('useTalkItOut must be used within TalkItOutProvider');
  return ctx;
}
