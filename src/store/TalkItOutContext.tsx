import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { boundOwnerOf, ownerChanged, ownerKeyOf } from '../features/talk-it-out/capture/owner';
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

/**
 * `busy`: an earlier message is still being read or answered, so this one was NOT taken - the composer must give her words back.
 * `ignored`: there was nothing to take (empty, or symbols only), so there is nothing to give back.
 */
export type SendResult = 'sent' | 'not-saved' | 'ignored' | 'busy';

interface TalkItOutContextValue {
  messages: TalkItOutMessage[];
  /** Suggested answers to the question currently on the table. */
  quickReplies: ClarificationOption[];
  /** Captures made in this conversation, each rendered after the message it belongs to. */
  captures: CaptureRef[];
  /** True while a submitted Talk It Out turn is waiting for its server response. */
  isThinking: boolean;
  /** Goes up each time the household under this conversation changes hands or is reset. Optional for callers that predate it. */
  householdRevision?: number;
  /** Calm product-level notice when the built-in path had to carry a turn. */
  serviceNotice: string | null;
  /** True when the most recent degraded turn can be replaced by a live response. */
  canRetry: boolean;
  /** Retries the most recent degraded turn without duplicating the user's message. */
  retryLastTurn: () => void;
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

interface FallbackRetry {
  before: Session;
  optimistic: Session;
  fallbackSession: Session;
  text: string;
  optionId?: string;
  previousDiscovery: DiscoveryRecord | null;
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
  const activeRequestRef = useRef<AbortController | null>(null);
  const nextSubmissionRef = useRef(0);
  const lastFallbackRef = useRef<FallbackRetry | null>(null);

  // The shared store can change owners while a provider turn is awaiting the
  // network. Never apply an old account's result to the replacement household.
  const ownerKey = () => ownerKeyOf(store.getSnapshot());
  useEffect(() => {
    let owner = ownerKey();
    const invalidate = () => {
      const current = ownerKey();
      if (current === owner) return;
      owner = current;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      activeSubmissionRef.current = null;
      lastFallbackRef.current = null;
      setIsThinking(false);
      setServiceNotice(null);
      setHouseholdRevision((revision) => revision + 1);
      update(startFrom(store.getSnapshot().state?.discovery ?? null));
    };
    const unsubscribe = store.subscribe(invalidate);
    return () => {
      unsubscribe();
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      activeSubmissionRef.current = null;
      lastFallbackRef.current = null;
    };
  }, [store]);

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
  // Counts the times the household under this conversation changed hands or was reset, so what the composer holds can be let go with it.
  const [householdRevision, setHouseholdRevision] = useState(0);
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

  async function capture(text: string, owner: string, submissionId: number): Promise<SendResult> {
    // Reading can wait on the network (Her Keys Premium's reader), so she is told it is working and cannot send a second message over it.
    setIsThinking(true);
    const startedFor = boundOwnerOf(store.getSnapshot());
    const outcome = await coordinator.submit({ text, submissionKey: keyRef.current });
    // The household changed hands (or the conversation was torn down) while this was being read. Her words belonged to the old one: they
    // are not shown, and no reading, capture or message is added to the new one. The coordinator has already refused to write.
    if (activeSubmissionRef.current !== submissionId || ownerKey() !== owner) {
      // The next message is a new submission: it must not reuse the key of work that belonged to the household that is gone.
      submissionRef.current += 1;
      keyRef.current = submissionKey();
      // Nothing was written, and the household was reset rather than handed to another account: what she typed goes back to the composer.
      // Another account's household never gets her words back, so a switch is 'sent' and the words are simply gone from view.
      if (outcome.kind === 'not-saved' && !ownerChanged(startedFor, boundOwnerOf(store.getSnapshot()))) return 'not-saved';
      return 'sent';
    }
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
    // Not dropped: the composer keeps what she typed and she can send it when the last message has been handled.
    if (activeSubmissionRef.current !== null) return 'busy';

    nextSubmissionRef.current += 1;
    const submissionId = nextSubmissionRef.current;
    activeSubmissionRef.current = submissionId;
    const owner = ownerKey();
    const accountId = store.getSnapshot().identity.binding?.accountId ?? null;
    const request = new AbortController();
    activeRequestRef.current = request;

    try {
      const current = sessionRef.current;
      lastFallbackRef.current = null;
      setServiceNotice(null);
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
          highStakes: preview?.failure?.code === 'high-stakes',
          conversationUnderstood: fallbackTurn.messages[0]?.stage !== 'unmatched',
        });
        if (route === 'capture') return await capture(trimmed, owner, submissionId);
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
      setIsThinking(true);
      const previousDiscovery = store.getSnapshot().state?.discovery ?? null;

      const call = await herKeysAiClient.advance({
        state: current.conversation,
        userText: trimmed,
        optionId,
        history: current.messages
          .slice(-12)
          .map(({ speaker, text: messageText }) => ({ speaker, text: messageText })),
      }, { accountId, signal: request.signal });

      if (activeSubmissionRef.current !== submissionId || ownerKey() !== owner) return 'sent';

      let turn: DiscoveryTurn;
      if (call.kind === 'ready') {
        turn = {
          messages: call.value.messages,
          state: call.value.state,
          quickReplies: call.value.quickReplies,
        };
        store.dispatch((state, ctx) => applyProviderDiscoveryConversation(state, ctx, turn.state));
        lastFallbackRef.current = null;
        update({
          ...optimistic,
          recordId: store.getSnapshot().state?.discovery?.id ?? null,
          conversation: turn.state,
          quickReplies: turn.quickReplies,
          messages: [...optimistic.messages, ...withIds(turn.messages)],
        });
      } else {
        // The local deterministic engine is deliberately retained as the
        // explicit degraded path. No provider error text is shown to the user.
        turn = fallbackTurn;
        store.dispatch((state, ctx) => applyDiscoveryConversation(state, ctx, turn.state));
        const fallbackSession: Session = {
          ...optimistic,
          recordId: store.getSnapshot().state?.discovery?.id ?? null,
          conversation: turn.state,
          quickReplies: turn.quickReplies,
          messages: [...optimistic.messages, ...withIds(turn.messages)],
        };
        lastFallbackRef.current = {
          before: current,
          optimistic,
          fallbackSession,
          text: trimmed,
          optionId,
          previousDiscovery,
        };
        setServiceNotice(DEGRADED_NOTICE);
        update(fallbackSession);
      }

      return 'sent';
    } finally {
      if (activeSubmissionRef.current === submissionId) {
        activeRequestRef.current = null;
        activeSubmissionRef.current = null;
        setIsThinking(false);
      }
    }
  }

  async function retryLastTurn() {
    const retry = lastFallbackRef.current;
    if (!retry || activeSubmissionRef.current !== null) return;

    nextSubmissionRef.current += 1;
    const submissionId = nextSubmissionRef.current;
    activeSubmissionRef.current = submissionId;
    const owner = ownerKey();
    const accountId = store.getSnapshot().identity.binding?.accountId ?? null;
    const request = new AbortController();
    activeRequestRef.current = request;
    setServiceNotice(null);
    setIsThinking(true);

    try {
      const call = await herKeysAiClient.advance({
        state: retry.before.conversation,
        userText: retry.text,
        optionId: retry.optionId,
        history: retry.before.messages
          .slice(-12)
          .map(({ speaker, text: messageText }) => ({ speaker, text: messageText })),
      }, { accountId, signal: request.signal });

      if (activeSubmissionRef.current !== submissionId || ownerKey() !== owner) return;

      if (call.kind !== 'ready') {
        setServiceNotice(DEGRADED_NOTICE);
        update(retry.fallbackSession);
        return;
      }

      const turn: DiscoveryTurn = {
        messages: call.value.messages,
        state: call.value.state,
        quickReplies: call.value.quickReplies,
      };

      // The degraded turn was the only durable mutation made by that submission.
      // Rebase that one field to its pre-turn value, then apply the validated
      // provider state so retry replaces rather than duplicates the turn.
      store.dispatch((state, ctx) =>
        applyProviderDiscoveryConversation({ ...state, discovery: retry.previousDiscovery }, ctx, turn.state)
      );

      lastFallbackRef.current = null;
      update({
        ...retry.optimistic,
        recordId: store.getSnapshot().state?.discovery?.id ?? null,
        conversation: turn.state,
        quickReplies: turn.quickReplies,
        messages: [...retry.optimistic.messages, ...withIds(turn.messages)],
      });
    } finally {
      if (activeSubmissionRef.current === submissionId) {
        activeRequestRef.current = null;
        activeSubmissionRef.current = null;
        setIsThinking(false);
      }
    }
  }

  function restart() {
    // Do not race a reset against an in-flight provider turn.
    if (activeSubmissionRef.current !== null) return;
    store.dispatch((state) => clearDiscovery(state));
    lastFallbackRef.current = null;
    setServiceNotice(null);
    update(startFrom(null));
  }

  const value: TalkItOutContextValue = {
    messages: session.messages,
    quickReplies: session.quickReplies,
    captures: session.captures,
    isThinking,
    householdRevision,
    serviceNotice,
    canRetry: lastFallbackRef.current !== null,
    retryLastTurn: () => void retryLastTurn(),
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
