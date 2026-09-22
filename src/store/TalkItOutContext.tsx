import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { applyDiscoveryConversation, clearDiscovery, freshDiscovery, replayDiscovery, type DiscoveryReplay } from '../domain/discovery';
import type { DiscoveryRecord } from '../domain/state';
import { CaptureProvider, useCapture } from '../features/talk-it-out/capture/CaptureContext';
import { copy } from '../features/talk-it-out/capture/copy';
import { routeMessage } from '../features/talk-it-out/capture/routing';
import { advance } from '../features/talk-it-out/engine';
import type { ClarificationOption, ConversationState, TalkItOutMessage } from '../types';
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
  // One key per composed message: a re-tapped Send is the same submission, not a second capture.
  const submissionRef = useRef(0);
  const submissionKey = () => `s${Date.now().toString(36)}-${submissionRef.current}`;
  const keyRef = useRef(submissionKey());

  const withIds = (drafts: DiscoveryReplay['messages']): TalkItOutMessage[] =>
    drafts.map((draft) => {
      counterRef.current += 1;
      return { ...draft, id: `msg-${counterRef.current}` };
    });

  const startFrom = (stored: DiscoveryRecord | null): Session => {
    const replay = replayDiscovery(stored) ?? freshDiscovery();
    return { recordId: stored?.id ?? null, conversation: replay.conversation, quickReplies: replay.quickReplies, messages: withIds(replay.messages), captures: [] };
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
    if (!trimmed) return 'ignored';

    const current = sessionRef.current;
    const turn = advance(current.conversation, trimmed, optionId);

    // A quick reply is an answer by construction. Free text is routed: capture when the reader recognises something to
    // save and the conversation would not have taken it as her answer; otherwise it stays the existing conversation.
    if (!optionId) {
      const preview = coordinator.preview(trimmed);
      const route = routeMessage({
        stage: current.conversation.stage,
        hasWords: /[A-Za-z0-9]/.test(trimmed),
        readerAvailable: preview !== null,
        recognized: preview !== null && preview.failure?.code !== 'nothing-recognized',
        conversationUnderstood: turn.messages[0]?.stage !== 'unmatched',
      });
      if (route === 'capture') return capture(trimmed);
    }

    store.dispatch((state, ctx) => applyDiscoveryConversation(state, ctx, turn.state));

    counterRef.current += 1;
    const userMessage: TalkItOutMessage = { id: `msg-${counterRef.current}`, speaker: 'user', text: trimmed };
    update({
      ...current,
      recordId: store.getSnapshot().state?.discovery?.id ?? null,
      conversation: turn.state,
      quickReplies: turn.quickReplies,
      messages: [...current.messages, userMessage, ...withIds(turn.messages)],
    });
    return 'sent';
  }

  function restart() {
    store.dispatch((state) => clearDiscovery(state));
    update(startFrom(null));
  }

  const value: TalkItOutContextValue = {
    messages: session.messages,
    quickReplies: session.quickReplies,
    captures: session.captures,
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
