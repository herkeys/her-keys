import * as Crypto from 'expo-crypto';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { InlineNotice } from '../../design/components';
import {
  addExternalPerson,
  addFollowUp,
  archiveExternalPerson,
  archivePersonContext,
  editPersonContext,
  openPersonContext,
  renamePerson,
  restoreExternalPerson,
  restorePersonContext,
} from '../../domain/people';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { commitPeople, type PeopleCommit, type PeopleTransition } from './commit';
import { peopleCopy } from './copy';
import { draftKeyFrom, DRAFT_KEY_BYTES } from './draftKey';
import { personDetail } from './privateNote';
import { buildPeopleHome, personKey } from './projection';
import { AddPersonView } from './ui/AddPersonView';
import { FollowUpFormView } from './ui/FollowUpFormView';
import { PeopleHomeView } from './ui/PeopleHomeView';
import { PersonDetailView } from './ui/PersonDetailView';

/**
 * People OS screens (HK-FEATURE-13): thin containers over the pure views. Every write goes through `commitPeople` (save-before-show,
 * all-or-nothing); every refusal is shown by its own sentence. Titles are set here, so the Life stack's layout file is untouched.
 */

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const openPerson = (key: string) => router.push({ pathname: '/life/person', params: { key } });

function messageFor(result: PeopleCommit): string | null {
  if (result.outcome === 'saved' || result.outcome === 'unchanged' || result.outcome === 'already_saved') return null;
  return peopleCopy.refusal[result.outcome as keyof typeof peopleCopy.refusal] ?? peopleCopy.refusal.not_saved;
}

function usePeopleRunner() {
  const store = useAppStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (transition: PeopleTransition): Promise<PeopleCommit | null> => {
    if (busy) return null;
    setBusy(true);
    setMessage(null);
    try {
      const result = await commitPeople(store, transition);
      setMessage(messageFor(result));
      return result;
    } catch {
      setMessage(peopleCopy.refusal.not_saved);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, message };
}

export function PeopleHomeScreen() {
  const { state, today } = useHouseholdState();
  const view = useMemo(() => buildPeopleHome(state, today), [state, today]);
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <Stack.Screen options={{ title: peopleCopy.title }} />
      <PeopleHomeView view={view} showAllFollowUps={showAll} onOpenPerson={openPerson} onAddPerson={() => router.push('/life/person-add')} onSeeAllFollowUps={() => setShowAll(true)} />
    </>
  );
}

export function PersonScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { state, today } = useHouseholdState();
  const { run, busy, message } = usePeopleRunner();
  const personKeyParam = first(key) ?? '';
  const detail = useMemo(() => personDetail(state, personKeyParam, today), [state, personKeyParam, today]);
  if (detail === null) {
    return (
      <>
        <Stack.Screen options={{ title: peopleCopy.title }} />
        <PeopleHomeRedirectNotice />
      </>
    );
  }
  const source = detail.source;
  const contextId = detail.context?.id ?? null;
  return (
    <>
      <Stack.Screen options={{ title: detail.displayName }} />
      <PersonDetailView
        // Re-mount the form when the stored context changes underneath it (another device, a restore).
        key={`${detail.key}:${detail.context?.status ?? 'none'}`}
        detail={detail}
        busy={busy}
        message={message}
        onRemember={(fields) => void run((s, c) => openPersonContext(s, c, source, fields))}
        onSaveContext={(fields) => contextId !== null && void run((s, c) => editPersonContext(s, c, contextId, fields))}
        onArchiveContext={() => contextId !== null && void run((s, c) => archivePersonContext(s, c, contextId))}
        onRestoreContext={() => contextId !== null && void run((s, c) => restorePersonContext(s, c, contextId))}
        onRename={(name) => source.kind === 'person' && void run((s, c) => renamePerson(s, c, source.id, name))}
        onArchivePerson={() => source.kind === 'person' && void run((s, c) => archiveExternalPerson(s, c, source.id))}
        onRestorePerson={() => source.kind === 'person' && void run((s, c) => restoreExternalPerson(s, c, source.id))}
        onAddFollowUp={() => contextId !== null && router.push({ pathname: '/life/person-follow-up', params: { key: detail.key } })}
      />
    </>
  );
}

function PeopleHomeRedirectNotice() {
  return <InlineNotice tone="waiting" title={peopleCopy.refusal.not_found} />;
}

export function AddPersonScreen() {
  const { run, busy, message } = usePeopleRunner();
  return (
    <>
      <Stack.Screen options={{ title: peopleCopy.add.title }} />
      <AddPersonView
        busy={busy}
        message={message}
        onSubmit={async (input) => {
          const result = await run((s, c) => addExternalPerson(s, c, input));
          if (result?.outcome === 'saved' && result.id !== null) router.replace({ pathname: '/life/person', params: { key: personKey({ kind: 'person', id: result.id }) } });
        }}
      />
    </>
  );
}

export function FollowUpScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { state, today } = useHouseholdState();
  const { run, busy, message } = usePeopleRunner();
  // Minted ONCE, when the flow opens, in memory only: opening this screen writes nothing, and Cancel writes nothing.
  const [draftKey] = useState(() => draftKeyFrom(Crypto.getRandomBytes(DRAFT_KEY_BYTES)));
  const detail = personDetail(state, first(key) ?? '', today);
  const contextId = detail?.context?.id ?? null;
  return (
    <>
      <Stack.Screen options={{ title: peopleCopy.followUp.add }} />
      <FollowUpFormView
        displayName={detail?.displayName ?? ''}
        busy={busy || contextId === null}
        message={contextId === null ? peopleCopy.refusal.not_found : message}
        onCancel={() => router.back()}
        onSave={async ({ title, dueDate }) => {
          if (contextId === null) return;
          const result = await run((s, c) => addFollowUp(s, c, { contextId, draftKey, title, dueDate }));
          if (result?.outcome === 'saved' || result?.outcome === 'already_saved') router.back();
        }}
      />
    </>
  );
}
