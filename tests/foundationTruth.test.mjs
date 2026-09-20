import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ProvenanceSchema,
  automationProvenance,
  demoProvenance,
  externalProvenance,
  inferenceProvenance,
  isSyncable,
  isUserStated,
  legacyProvenance,
  onboardingProvenance,
  provenanceFor,
  systemProvenance,
  talkItOutProvenance,
  userProvenance,
} from '../src/domain/foundation/provenance.ts';
import { ExternalReferenceSchema, externalIdentityKey, resolveObservation, serverOriginLocalId } from '../src/domain/foundation/externalReference.ts';
import { SourceArtifactSchema, findDuplicateArtifact, retractArtifact } from '../src/domain/foundation/sourceArtifact.ts';
import { TYPED_REF_KINDS, KIND_CLOUD, KIND_COLLECTION, ContentRefSchema, refExists, refOf, sameRef } from '../src/domain/foundation/typedRef.ts';
import { independentCorroborations, promoteConfidence, promoteProvenance } from '../src/domain/reasoning/confidence.ts';
import { validateAppState } from '../src/domain/state.ts';
import { decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const AT = '2026-09-18T12:00:00.000Z';

const artifact = (over = {}) => ({
  id: 'artifact-1',
  kind: 'email',
  origin: 'user-submitted',
  provider: 'forward',
  receivedAt: AT,
  contentDigest: DIGEST_A,
  contentRef: null,
  retractedAt: null,
  createdAt: AT,
  scope: 'personal',
  ...over,
});

const reference = (over = {}) => ({
  id: 'xref-1',
  provider: 'gcal',
  externalAccount: 'acct-hash-1',
  externalObjectId: 'evt-abc',
  externalVersion: 'etag-1',
  origin: 'external',
  direction: 'inbound',
  authority: 'external',
  lastObservedAt: AT,
  lastObservedDigest: DIGEST_A,
  linked: null,
  writtenAt: null,
  status: 'active',
  createdAt: AT,
  updatedAt: AT,
  provenance: externalProvenance('possible'),
  scope: 'personal',
  ...over,
});

const withRows = (over) => ({ ...createEmptyState(TZ), ...over });

describe('B4-FE01-001/-005 — stored provenance and durable confidence', () => {
  test('the nine producers, and exactly which are user-stated', () => {
    const all = [userProvenance(), onboardingProvenance(), talkItOutProvenance(), systemProvenance(), externalProvenance(), inferenceProvenance(), demoProvenance(), automationProvenance(), legacyProvenance()];
    for (const p of all) assert.equal(ProvenanceSchema.safeParse(p).success, true, p.producer);
    assert.deepEqual(all.filter((p) => isUserStated(p.producer)).map((p) => p.producer), ['user-action', 'onboarding', 'talk-it-out']);
    assert.equal(isSyncable('demo-seed'), false);
    assert.ok(all.filter((p) => p.producer !== 'demo-seed').every((p) => isSyncable(p.producer)));
  });

  test('a confidence exists exactly where a claim does: inference and external observation carry one, nothing else may', () => {
    assert.equal(ProvenanceSchema.safeParse({ ...inferenceProvenance(), confidence: null }).success, false, 'an inference must say how sure it is');
    assert.equal(ProvenanceSchema.safeParse({ ...externalProvenance(), confidence: null }).success, false);
    for (const p of [userProvenance(), systemProvenance(), legacyProvenance(), demoProvenance(), automationProvenance(), onboardingProvenance(), talkItOutProvenance()]) {
      assert.equal(ProvenanceSchema.safeParse({ ...p, confidence: 'likely' }).success, false, `${p.producer} cannot carry a confidence`);
    }
  });

  test('rows that were never derived from anything cannot name an artifact', () => {
    for (const p of [demoProvenance(), legacyProvenance(), onboardingProvenance()]) {
      assert.equal(ProvenanceSchema.safeParse({ ...p, artifactId: 'artifact-1' }).success, false, p.producer);
    }
    assert.equal(ProvenanceSchema.safeParse(inferenceProvenance('possible', 'artifact-1')).success, true);
    assert.equal(ProvenanceSchema.safeParse(userProvenance('artifact-1')).success, true, 'she may attach a source to something she entered');
  });

  test('user-stated, inferred and external are three different things, and none of them is another', () => {
    const evidence = { corroborations: 1, userConfirmed: false };
    assert.equal(promoteProvenance(inferenceProvenance('possible'), evidence).confidence, 'possible', 'one corroboration is not enough for an inference');
    assert.equal(promoteProvenance(externalProvenance('possible'), evidence).confidence, 'possible', 'external observation is not a user statement');
    assert.equal(promoteConfidence('possible', { source: 'user-action', ...evidence }), 'likely', 'the same evidence DOES move a user-stated claim');
    const stated = userProvenance();
    assert.equal(promoteProvenance(stated, { corroborations: 9, userConfirmed: true }), stated, 'a user-stated fact has no confidence to raise, so it comes back untouched');
  });

  test('a row with no confidence has nothing to promote — legacy-unknown can never acquire a level', () => {
    for (const p of [legacyProvenance(), userProvenance(), systemProvenance(), automationProvenance()]) {
      const promoted = promoteProvenance(p, { corroborations: 50, userConfirmed: true });
      assert.equal(promoted, p, `${p.producer} is returned unchanged`);
      assert.equal(promoted.confidence, null);
    }
  });

  test('only an explicit confirmation reaches established, and a model cannot promote its own inference however often it repeats', () => {
    const inferred = inferenceProvenance('possible');
    assert.equal(promoteProvenance(inferred, { corroborations: 99, userConfirmed: false }).confidence, 'likely');
    assert.notEqual(promoteProvenance(inferred, { corroborations: 99, userConfirmed: false }).confidence, 'established');
    assert.equal(promoteProvenance(inferred, { corroborations: 0, userConfirmed: true }).confidence, 'established');
    assert.equal(promoteProvenance(inferenceProvenance('established'), { corroborations: 0, userConfirmed: false }).confidence, 'established', 'never falls');
  });

  test('one producer is not corroboration: rows from one email are one sighting; two different days are two', () => {
    const email = (i) => ({ producer: 'import-sync', artifactId: 'artifact-1', logicalDate: `2026-09-1${i}` });
    assert.equal(independentCorroborations([email(1), email(2), email(3)]), 1, 'three facts from one email agree with each other, not with the world');
    const behaviour = (d) => ({ producer: 'user-action', artifactId: null, logicalDate: d });
    assert.equal(independentCorroborations([behaviour('2026-09-01'), behaviour('2026-09-01')]), 1, 'the same day twice is one day');
    assert.equal(independentCorroborations([behaviour('2026-09-01'), behaviour('2026-09-02'), { ...email(1) }]), 3);
    assert.equal(independentCorroborations([]), 0);
  });

  test('persistence never promotes: a stored confidence reads back exactly, on every level', () => {
    for (const level of ['possible', 'likely', 'established']) {
      const state = withRows({ externalReferences: [reference({ provenance: externalProvenance(level) })] });
      const raw = encodeStoredState(state, { appVersion: 't', savedAt: AT, writeSeq: 1 });
      const decoded = decodeStoredState(raw);
      assert.equal(decoded.kind, 'valid');
      assert.equal(decoded.state.externalReferences[0].provenance.confidence, level);
      const again = decodeStoredState(encodeStoredState(decoded.state, { appVersion: 't', savedAt: AT, writeSeq: 2 }));
      assert.deepEqual(again.state.externalReferences, decoded.state.externalReferences, 'a second round trip changes nothing');
    }
  });

  test('a demo household lets no truth stand: provenanceFor is the single dominance rule', () => {
    assert.deepEqual(provenanceFor('demo', userProvenance()), demoProvenance());
    assert.deepEqual(provenanceFor('demo', inferenceProvenance('likely')), demoProvenance());
    assert.deepEqual(provenanceFor('empty', userProvenance()), userProvenance());
  });
});

describe('B4-FE01-002 — source artifacts: evidence of arrival, never content', () => {
  test('an artifact carries no content field at all — a transcript or body cannot be stored, by schema', () => {
    assert.equal(SourceArtifactSchema.safeParse(artifact()).success, true);
    for (const field of ['body', 'transcript', 'text', 'content', 'rawText', 'html']) {
      assert.equal(SourceArtifactSchema.safeParse({ ...artifact(), [field]: 'Hi, the field trip is on Friday...' }).success, false, `${field} must be refused`);
    }
    assert.equal(SourceArtifactSchema.safeParse(artifact({ contentRef: 'a whole email pasted here with spaces' })).success, false, 'contentRef is an opaque token, not text');
    assert.equal(SourceArtifactSchema.safeParse(artifact({ contentRef: 'store:blob/2026/09/abc123' })).success, true);
  });

  test('every source kind the ambition needs is representable: voice, email, calendar, document, screenshot, notice, receipt, bill, message, connected object', () => {
    const kinds = ['voice-utterance', 'email', 'calendar-item', 'document', 'screenshot', 'school-notice', 'receipt', 'bill', 'message', 'connected-object'];
    for (const kind of kinds) {
      const origin = kind === 'voice-utterance' ? 'voice' : kind === 'connected-object' ? 'connector' : 'user-submitted';
      assert.equal(SourceArtifactSchema.safeParse(artifact({ kind, origin, provider: origin === 'connector' ? 'gmail' : null })).success, true, kind);
    }
    assert.equal(SourceArtifactSchema.safeParse(artifact({ kind: 'invoice-pdf' })).success, false);
  });

  test('a spoken utterance is voice, and a connector-delivered artifact says which connector', () => {
    assert.equal(SourceArtifactSchema.safeParse(artifact({ kind: 'voice-utterance', origin: 'user-submitted' })).success, false);
    assert.equal(SourceArtifactSchema.safeParse(artifact({ kind: 'email', origin: 'voice' })).success, false);
    assert.equal(SourceArtifactSchema.safeParse(artifact({ origin: 'connector', provider: null })).success, false);
  });

  test('duplicate detection: the same digest is the same artifact, and state refuses two rows sharing one', () => {
    const first = artifact();
    assert.equal(findDuplicateArtifact([first], DIGEST_A), first);
    assert.equal(findDuplicateArtifact([first], DIGEST_B), null);
    assert.equal(findDuplicateArtifact([first], null), null);
    const dup = validateAppState(withRows({ sourceArtifacts: [first, artifact({ id: 'artifact-2' })] }));
    assert.equal(dup.ok, false);
    assert.match(dup.issues.join(' '), /duplicate source artifact digest/);
    assert.equal(validateAppState(withRows({ sourceArtifacts: [first, artifact({ id: 'artifact-2', contentDigest: DIGEST_B })] })).ok, true);
    assert.equal(validateAppState(withRows({ sourceArtifacts: [artifact({ contentDigest: null }), artifact({ id: 'artifact-2', contentDigest: null })] })).ok, true, 'no digest, no dedupe claim');
  });

  test('retraction is the only edit an artifact takes, and it can be made once', () => {
    const retracted = retractArtifact(artifact(), '2026-09-19T08:00:00.000Z');
    assert.equal(retracted.retractedAt, '2026-09-19T08:00:00.000Z');
    assert.equal(retractArtifact(retracted, '2026-09-20T08:00:00.000Z').retractedAt, '2026-09-19T08:00:00.000Z', 'a second retraction does not rewrite the first');
    assert.deepEqual({ ...retracted, retractedAt: null }, artifact(), 'nothing else moved');
  });

  test('lineage: one email yields several structured rows and every one names it — and a name that resolves to nothing is refused', () => {
    const base = createEmptyState(TZ);
    const task = (id, title) => ({ id, title, categoryId: 'cat-kids', subjectMemberId: null, durationMinutes: 10, commitment: 'flexible', dueDate: '2026-09-25', plan: { kind: 'unplanned' }, notes: null, status: 'open', completedAt: null, createdAt: AT, updatedAt: AT, provenance: externalProvenance('possible', 'artifact-1'), scope: 'household' });
    const lineage = withRows({ sourceArtifacts: [artifact()], tasks: [task('task-form', 'Return the permission form'), task('task-fee', 'Pay the $35 trip fee')], categories: base.categories });
    assert.equal(validateAppState(lineage).ok, true);
    assert.deepEqual(lineage.tasks.map((t) => t.provenance.artifactId), ['artifact-1', 'artifact-1']);

    const orphan = validateAppState({ ...lineage, sourceArtifacts: [] });
    assert.equal(orphan.ok, false);
    assert.match(orphan.issues.join(' '), /names missing source artifact artifact-1/);
  });
});

describe('B4-FE01-004 — external reference identity and feedback-loop prevention', () => {
  test('the tuple every integration needs: provider, account, object, version, origin, direction, authority, last observed', () => {
    const ok = ExternalReferenceSchema.safeParse(reference());
    assert.equal(ok.success, true);
    for (const field of ['provider', 'externalAccount', 'externalObjectId', 'origin', 'direction', 'authority', 'status']) {
      const { [field]: _omitted, ...rest } = reference();
      assert.equal(ExternalReferenceSchema.safeParse(rest).success, false, `${field} is required`);
    }
  });

  test('a returning object is recognised by IDENTITY, never by title or time', () => {
    const known = reference({ linked: { kind: 'event', id: 'evt-1' } });
    const back = resolveObservation([known], { provider: 'gcal', externalAccount: 'acct-hash-1', externalObjectId: 'evt-abc', externalVersion: 'etag-2', observedAt: '2026-09-19T09:00:00.000Z', observedDigest: DIGEST_B });
    assert.equal(back.kind, 'known');
    assert.equal(back.reference.externalVersion, 'etag-2');
    assert.equal(back.reference.lastObservedAt, '2026-09-19T09:00:00.000Z');
    assert.deepEqual(back.reference.linked, { kind: 'event', id: 'evt-1' }, 'it is still the same linked object');

    const other = resolveObservation([known], { provider: 'gcal', externalAccount: 'acct-hash-1', externalObjectId: 'evt-DIFFERENT', externalVersion: null, observedAt: AT, observedDigest: null });
    assert.equal(other.kind, 'new');
    const otherAccount = resolveObservation([known], { provider: 'gcal', externalAccount: 'acct-hash-2', externalObjectId: 'evt-abc', externalVersion: null, observedAt: AT, observedDigest: null });
    assert.equal(otherAccount.kind, 'new', 'the same object id in a different account is a different object');
  });

  test('THE LOOP: Her Keys writes an external object, the provider hands it back, and no duplicate is required', () => {
    // Her Keys created this calendar entry itself.
    const written = reference({
      id: 'xref-out', origin: 'her-keys', direction: 'outbound', authority: 'her-keys', externalObjectId: 'evt-made-by-us',
      writtenAt: AT, linked: { kind: 'event', id: 'evt-1' }, provenance: automationProvenance(),
    });
    assert.equal(ExternalReferenceSchema.safeParse(written).success, true);

    // Later ingestion sees the very same object.
    const seen = resolveObservation([written], { provider: 'gcal', externalAccount: 'acct-hash-1', externalObjectId: 'evt-made-by-us', externalVersion: 'etag-9', observedAt: '2026-09-19T10:00:00.000Z', observedDigest: DIGEST_B });
    assert.equal(seen.kind, 'known', 'recognised — so no second domain object is created');
    assert.equal(seen.selfWritten, true, 'and it is known to be OUR write coming back');
    assert.deepEqual(seen.reference.linked, { kind: 'event', id: 'evt-1' }, 'lineage preserved: still the one event');
    assert.equal(seen.reference.origin, 'her-keys', 'observing it does not turn it into an external-origin object');

    const state = withRows({ externalReferences: [written], events: [] });
    assert.equal(validateAppState(state).ok, false, 'linked to an event that does not exist is refused');
  });

  test('two rows may never claim the same external identity — that is what makes the loop detectable', () => {
    const dup = validateAppState(withRows({ externalReferences: [reference(), reference({ id: 'xref-2' })] }));
    assert.equal(dup.ok, false);
    assert.match(dup.issues.join(' '), /duplicate external identity/);
    assert.equal(externalIdentityKey(reference()), 'gcal|acct-hash-1|evt-abc');
    assert.equal(validateAppState(withRows({ externalReferences: [reference(), reference({ id: 'xref-2', externalObjectId: 'evt-xyz' })] })).ok, true);
  });

  test('origin is honest: a Her Keys write records when it was written; an external object was not written by us', () => {
    assert.equal(ExternalReferenceSchema.safeParse(reference({ origin: 'her-keys', writtenAt: null, linked: { kind: 'event', id: 'e' } })).success, false);
    assert.equal(ExternalReferenceSchema.safeParse(reference({ origin: 'external', writtenAt: AT })).success, false);
  });

  test('a server-side connector has no device to mint a local id, so its rows use ext:<provider>:<hash> — a legal id', () => {
    const id = serverOriginLocalId('gcal', 'evt-abc', 'f'.repeat(64));
    assert.match(id, /^ext:gcal:f{32}$/);
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 'it satisfies the same id pattern every row uses');
  });

  test('THE TOKEN BOUNDARY: no credential can be stored — the shape has no field for one and refuses any that is added', () => {
    const forbidden = ['accessToken', 'refreshToken', 'access_token', 'refresh_token', 'token', 'secret', 'clientSecret', 'apiKey', 'password', 'bearer', 'credential', 'authorization'];
    for (const field of forbidden) {
      assert.equal(ExternalReferenceSchema.safeParse({ ...reference(), [field]: 'ya29.a0AfH6SMB...' }).success, false, `${field} must be refused`);
      assert.equal(SourceArtifactSchema.safeParse({ ...artifact(), [field]: 'ya29.a0AfH6SMB...' }).success, false, `${field} must be refused on an artifact`);
    }
    const shape = Object.keys(ExternalReferenceSchema.shape ?? ExternalReferenceSchema._def?.schema?.shape ?? reference());
    assert.ok(!shape.some((key) => /token|secret|password|credential|bearer|apikey/i.test(key)), `unexpected credential-shaped field in ${shape.join(', ')}`);
  });
});

describe('B4-FE01-027 — the typed reference convention', () => {
  test('one registry names every referenceable kind, its collection and its cloud column', () => {
    assert.deepEqual(Object.keys(KIND_COLLECTION).sort(), [...TYPED_REF_KINDS].sort());
    assert.deepEqual(Object.keys(KIND_CLOUD).sort(), [...TYPED_REF_KINDS].sort());
    assert.equal(new Set(Object.values(KIND_CLOUD).map((c) => c.column)).size, TYPED_REF_KINDS.length, 'every kind has its own typed column');
    assert.ok(Object.values(KIND_CLOUD).every((c) => /^[a-z_]+_id$/.test(c.column)));
  });

  test('a reference is a KIND and an id — never a bare id whose meaning depends on a second field', () => {
    assert.equal(ContentRefSchema.safeParse({ kind: 'task', id: 'task-1' }).success, true);
    assert.equal(ContentRefSchema.safeParse({ id: 'task-1' }).success, false);
    assert.equal(ContentRefSchema.safeParse({ kind: 'oneMove', id: 'om-1' }).success, false, 'content refs are restricted to content kinds');
    assert.equal(ContentRefSchema.safeParse({ kind: 'task', id: '__proto__' }).success, false);
    assert.equal(refOf(['task', 'event']).safeParse({ kind: 'meal', id: 'm-1' }).success, false);
  });

  test('resolution is by kind: the same id under two kinds is two different things', () => {
    const state = { tasks: [{ id: 'x-1' }], events: [{ id: 'x-2' }] };
    assert.equal(refExists(state, { kind: 'task', id: 'x-1' }), true);
    assert.equal(refExists(state, { kind: 'event', id: 'x-1' }), false);
    assert.equal(refExists(state, { kind: 'goal', id: 'x-1' }), false, 'a kind whose collection is absent resolves to nothing');
    assert.equal(sameRef({ kind: 'task', id: 'a' }, { kind: 'task', id: 'a' }), true);
    assert.equal(sameRef({ kind: 'task', id: 'a' }, { kind: 'event', id: 'a' }), false);
    assert.equal(sameRef(null, null), true);
  });
});
