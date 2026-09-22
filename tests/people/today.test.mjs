/**
 * HK-FEATURE-13 (People OS) — PERSON DOES NOT BECOME A TODAY OBJECT; PERSON DOES NOT BECOME A ONE MOVE.
 *
 * Today and One Move see a follow-up ONLY as the ordinary canonical Task it is, through their existing Task behaviour. A person or a
 * context is never a row, a candidate or a queue; a note or label never reaches Today; and a household with people but no follow-ups
 * produces EXACTLY the Today it would produce without them.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addExternalPerson, addFollowUp, followUpTaskId, openPersonContext } from '../../src/domain/people.ts';
import { oneMoveForDay } from '../../src/domain/oneMove.ts';
import { DAY, READY, household, mkCtx, nyMs, strings, tk, view, withMove } from '../today/fixtures.mjs';
import { draft } from './world.mjs';

const SECRET_NOTE = 'NOTE-7f3c private words';
const SECRET_LABEL = 'LABEL-9d1e';
const NAME = 'Quinn Harper';

function withPeople(state) {
  const person = addExternalPerson(state, mkCtx(), { displayName: NAME, relationshipLabel: SECRET_LABEL, contextNote: SECRET_NOTE });
  return { state: person.state, personId: person.id, contextId: person.state.personContexts.at(-1).id };
}

describe('Today and One Move are untouched by people and contexts', () => {
  test('with no follow-up, a household with a person and a private context has EXACTLY the Today and One Move it had without them', () => {
    const base = tk(household(), { title: 'Water the plants' });
    const { state: peopled } = withPeople(base);
    const a = view(withMove(base), nyMs(8), READY);
    const b = view(withMove(peopled), nyMs(8), READY);
    assert.deepEqual(b, a, 'NO FOLLOW-UP TASK DOES NOT MEAN RELATIONSHIP NEGLECT: nothing is added to Today');
    assert.deepEqual(oneMoveForDay(withMove(peopled), DAY), oneMoveForDay(withMove(base), DAY));
  });

  test('a follow-up appears in Today only as its own Task: the title she typed, never the person, the label or the note', () => {
    const { state, contextId, personId } = withPeople(household());
    const saved = addFollowUp(state, mkCtx(), { contextId, draftKey: draft(1), title: 'Drop off the casserole dish', dueDate: DAY });
    assert.equal(saved.outcome, 'saved');
    const v = view(withMove(saved.state), nyMs(8), READY);
    const words = strings(v).join('\n');
    assert.ok(words.includes('Drop off the casserole dish'), 'the canonical Task is visible through ordinary Task behaviour');
    for (const secret of [SECRET_NOTE, SECRET_LABEL, NAME]) assert.ok(!words.includes(secret), `Today never says "${secret}"`);
    const json = JSON.stringify(v);
    assert.ok(!json.includes(contextId) && !json.includes(personId), 'no Today element is a context or a person');
  });

  test('the One Move may be the follow-up TASK — and is never the person or the context', () => {
    const { state, contextId, personId } = withPeople(household());
    const saved = addFollowUp(state, mkCtx(), { contextId, draftKey: draft(2), title: 'Return the borrowed drill', dueDate: DAY });
    const decided = withMove(saved.state);
    const record = decided.oneMoves.find((r) => r.forDate === DAY);
    assert.ok(record, 'a decision was made');
    assert.notEqual(record.targetId, contextId);
    assert.notEqual(record.targetId, personId);
    assert.equal(record.targetType, 'task');
    assert.equal(record.targetId, followUpTaskId(draft(2)), 'the concrete Task "Return the borrowed drill" is the One Move — through the normal selector');
    const move = oneMoveForDay(decided, DAY);
    assert.ok(!JSON.stringify(move).includes(SECRET_NOTE));
  });

  test('a child context with no follow-up adds nothing to Today either (no child-level People queue)', () => {
    let s = household();
    s = { ...s, children: [{ id: 'child-1', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' }] };
    const before = view(withMove(s), nyMs(8), READY);
    const opened = openPersonContext(s, mkCtx(), { kind: 'child', id: 'child-1' }, { contextNote: SECRET_NOTE });
    assert.deepEqual(view(withMove(opened.state), nyMs(8), READY), before);
  });
});
