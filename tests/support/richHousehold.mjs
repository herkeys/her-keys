/**
 * A real household holding ONE ROW OF EVERY FOUNDATION KIND, built through the domain's own
 * operations wherever an operation exists — so it is the shape the product will actually write, not a
 * fixture that merely satisfies a schema.
 *
 * Used by the projection round trip, the real-Supabase sync journeys and the acceptance suite, so the
 * three are looking at the same household. Executions and outcomes are SERVER-written; they are added
 * as literals (what a device would hold after pulling them) only when `withServerRows` is set.
 */
import { acceptInterpretation, proposeInterpretation, recordArtifact } from '../../src/domain/interpretations.ts';
import { decideIntent, grantAuthority, proposeIntent, approveUnderAuthority } from '../../src/domain/authorization.ts';
import { parseMoney } from '../../src/domain/foundation/money.ts';
import { addPerson, acknowledge, delegate } from '../../src/domain/responsibility.ts';
import { addDependency, addGoal, addRecurrence, addSystemStep, setCapacity } from '../../src/domain/structure.ts';
import { addEvidence, proposePattern } from '../../src/domain/patterns.ts';
import { addEvent } from '../../src/domain/events.ts';
import { addTask, completeTask } from '../../src/domain/tasks.ts';
import { appendObservation } from '../../src/domain/observations.ts';
import { captureNeedsMeItem } from '../../src/domain/needsMe.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addFollowUp, openPersonContext } from '../../src/domain/people.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ } from './fixtures.mjs';

export const DIGEST = 'c'.repeat(64);
export const USER = { producer: 'user-action', artifactId: null, confidence: null };

/** The kinds a device WRITES. Executions and outcomes are written by the server and pulled. */
export const CLIENT_WRITTEN = [
  'sourceArtifact', 'externalReference', 'interpretation', 'authority', 'intent', 'decision', 'observation', 'person',
  'responsibility', 'dependency', 'recurrence', 'goal', 'systemStep', 'capacity', 'pattern', 'evidenceLink',
  'personContext', 'personTaskLink',
];

export function richHousehold({ withServerRows = false, withOneMove = true } = {}) {
  let n = 0;
  const at = (ms = MORNING, today = DAY) => ({ nowMs: ms, today, createId: (p) => `${p}-${++n}` });

  let s = createEmptyState(TZ);
  s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(s, 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
  s = completeOnboarding(s, at());

  // ---- an email arrives, and is read into structured candidates ----------------------------------------
  const recorded = recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', provider: 'forward', contentDigest: DIGEST, contentRef: 'blob:email-1' });
  s = recorded.state;
  const artifact = recorded.artifact;
  s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'task', title: 'Pay the $35 trip fee', dueDate: '2026-09-24', value: parseMoney('35', 'USD', 'outflow') });
  s = acceptInterpretation(s, at(), s.interpretations[0].id, { categoryId: 'cat-money' });
  s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'event', title: 'Field trip', startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T18:00:00.000Z' });

  // ---- content she made herself, answering the commitment facets it can answer ----------------------------
  s = addTask(s, at(), { title: 'Sign the permission form', categoryId: 'cat-kids', dueDate: '2026-09-23', scope: 'household' });
  const form = s.tasks[s.tasks.length - 1];
  s = {
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === form.id
        ? {
            ...t, dueAt: '2026-09-23T20:00:00.000Z', earliestStartAt: '2026-09-21T13:00:00.000Z', latestFinishAt: '2026-09-23T20:00:00.000Z',
            splittable: true, minChunkMinutes: 5, preferredTimeOfDay: 'evening', energyDemand: 'low', consequence: 'high', needsMePersonally: true,
            travelMinutesBefore: 0, travelMinutesAfter: 0, preparationMinutes: 10, value: parseMoney('35', 'USD', 'outflow'),
          }
        : t
    ),
  };
  s = addEvent(s, at(), { title: 'Field trip day', categoryId: 'cat-kids', startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T18:00:00.000Z', commitment: 'fixed', scope: 'household' });
  const trip = s.events[s.events.length - 1];
  s = { ...s, events: s.events.map((e) => (e.id === trip.id ? { ...e, energyDemand: 'moderate', consequence: 'moderate', needsMePersonally: false, value: parseMoney('12.50', 'USD', 'outflow') } : e)) };
  // Systems and meals have no production create path yet; they arrive as the rows a real household would hold.
  s = {
    ...s,
    systems: [{ id: 'sys-1', name: 'Sunday reset', description: 'Reset the house for the week', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'suggest', effortMinutes: 20, energyDemand: 'moderate', provenance: USER, scope: 'household' }],
    meals: [{ id: 'meal-1', date: '2026-09-21', title: 'Sheet-pan chicken', categoryId: 'cat-meals', slot: 'dinner', status: 'active', prepMinutes: 25, energyDemand: 'low', provenance: USER, scope: 'household' }],
  };
  for (const title of ['Gather', 'Sort', 'Pay']) s = addSystemStep(s, at(), 'sys-1', { title, effortMinutes: 5 });

  // ---- people, responsibility, structure --------------------------------------------------------------------
  s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent', channel: 'sms' });
  s = delegate(s, at(), { about: { kind: 'task', id: form.id }, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 60 });
  s = acknowledge(s, at(MORNING + 60_000), s.responsibilities[0].id);
  ({ state: s } = addDependency(s, at(), { relation: 'requires', from: { kind: 'event', id: trip.id }, to: { kind: 'task', id: form.id } }));
  s = addGoal(s, at(), { title: 'Get the garage cleared', categoryId: 'cat-home' });
  ({ state: s } = addDependency(s, at(), { relation: 'part_of', from: { kind: 'task', id: form.id }, to: { kind: 'goal', id: s.goals[0].id }, provenance: { producer: 'ai-inference', artifactId: null, confidence: 'possible' } }));
  s = addRecurrence(s, at(), { kind: 'system', id: 'sys-1' }, { frequency: 'weekly', byWeekday: [0], anchorDate: '2026-09-13' });
  s = setCapacity(s, at(), { dayEndMinutes: 20 * 60, transitionBufferMinutes: 15 });

  // ---- authorization: a standing permission, an approved intent, an intent under the standing permission ------
  s = grantAuthority(s, at(), { category: 'internal_reminder', mode: 'execute_authorized', persistent: true });
  s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge_about_form', about: { kind: 'task', id: form.id } });
  s = decideIntent(s, at(), s.intents[0].id, 'approved');
  s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge_about_fee', about: { kind: 'task', id: s.tasks[0].id } });
  s = approveUnderAuthority(s, at(), s.intents[1].id);

  // ---- behavior: real completions, and a pattern standing on observed days ------------------------------------
  s = completeTask(s, at(), s.tasks[0].id);
  const ids = [];
  for (const day of ['2026-09-08', '2026-09-15', '2026-09-22']) {
    s = appendObservation(s, at(MORNING, day), { about: { kind: 'task', id: form.id }, outcome: 'skipped', plannedDate: day });
    ids.push(s.observations.at(-1).id);
  }
  s = proposePattern(s, at(), { kind: 'deferral', weekday: 2, timeBucket: 'evening', observationIds: ids, code: 'repeated_deferral', about: { kind: 'task', id: form.id } });
  s = addEvidence(s, at(), { for: { kind: 'intent', id: s.intents[0].id }, support: { kind: 'observation', id: ids[0] }, code: 'repeated_deferral' });

  // ---- an object in an external system, observed through the email and linked to the row it became -----------
  s = {
    ...s,
    externalReferences: [{
      id: 'xref-1', provider: 'gmail', externalAccount: 'acct-hash-1', externalObjectId: 'msg-42', externalVersion: 'v1', origin: 'external',
      direction: 'inbound', authority: 'external', lastObservedAt: '2026-09-16T13:00:00.000Z', lastObservedDigest: DIGEST,
      linked: { kind: 'task', id: s.tasks[0].id }, writtenAt: null, status: 'active',
      createdAt: '2026-09-16T13:00:00.000Z', updatedAt: '2026-09-16T13:00:00.000Z',
      provenance: { producer: 'import-sync', artifactId: artifact.id, confidence: 'likely' }, scope: 'personal',
    }],
  };

  // ---- a Needs Me item, and today's One Move (which decides among what is open) -------------------------------
  s = captureNeedsMeItem(s, at(), { title: 'Call the dentist back' });
  // A One Move's day is the SERVER's (it derives it from the account's timezone), so a household that is
  // going to be pushed to a live database leaves it out; the One Move journey covers it with today's date.
  if (withOneMove) s = resolveOneMoveForToday(s, at());

  // ---- People OS (HK-FEATURE-13): her private context about Grandma June, and a follow-up Task created from it -------------
  // After the One Move is decided, so this private Task cannot change which move the rest of the household's fixtures expect.
  ({ state: s } = openPersonContext(s, at(), { kind: 'person', id: s.people[0].id }, { relationshipLabel: 'Grandma', organizationLabel: 'Maple Street Library', contextNote: 'Likes a call on Sunday mornings.' }));
  ({ state: s } = addFollowUp(s, at(), { contextId: s.personContexts[0].id, draftKey: 'richhouseholdfollowupkey01', title: 'Ask about Sunday lunch', dueDate: '2026-09-26' }));

  if (withServerRows) {
    const intent = s.intents[0];
    s = {
      ...s,
      executions: [{
        id: 'exec-1', intentId: intent.id, decisionId: s.decisions[0].id, authorityId: null, attempt: 1, attemptedAt: '2026-09-16T14:05:00.000Z',
        provider: null, externalActionId: null, externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'reversible',
        compensationCode: null, compensatesExecutionId: null, createdAt: '2026-09-16T14:05:00.000Z',
        provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal',
      }],
      outcomes: [{
        id: 'outcome-1', executionId: 'exec-1', kind: 'delivered', observedAt: '2026-09-16T14:06:00.000Z', createdAt: '2026-09-16T14:06:00.000Z',
        provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal',
      }],
    };
  }

  const verdict = validateAppState(s);
  if (!verdict.ok) throw new Error(`the rich household is not valid state: ${verdict.reason}: ${verdict.issues.slice(0, 4).join('; ')}`);
  return { state: s, artifact, form, trip, at };
}
