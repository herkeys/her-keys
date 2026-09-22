/**
 * HK-FEATURE-13 (People OS) — the commands, as pure transitions. Identity is an id; nothing merges; a context is private memory about
 * ONE canonical person; a follow-up is an ordinary owner-private Task created with its link in one transition.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addExternalPerson,
  addFollowUp,
  archiveExternalPerson,
  archivePersonContext,
  contextFor,
  editPersonContext,
  followUpLinkId,
  followUpTaskId,
  openPersonContext,
  renamePerson,
  restoreExternalPerson,
  restorePersonContext,
} from '../../src/domain/people.ts';
import { PEOPLE_LIMITS, PersonContextSchema, peopleIntegrityProblems } from '../../src/domain/foundation/personContext.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { JOSIE, MILO, draft, world } from './world.mjs';

const valid = (state) => {
  const verdict = validateAppState(state);
  assert.equal(verdict.ok, true, verdict.ok ? '' : verdict.issues.join('; '));
  return state;
};

describe('PERSON IDENTITY IS NOT DISPLAY NAME — SAME NAME DOES NOT MEAN SAME PERSON', () => {
  test('two people called "Jennifer Smith" are two identities, with two ids, and neither absorbs the other', () => {
    const w = world();
    const a = addExternalPerson(w.state, w.at(), { displayName: 'Jennifer Smith' });
    const b = addExternalPerson(a.state, w.at(), { displayName: 'Jennifer Smith' });
    assert.equal(a.outcome, 'saved');
    assert.equal(b.outcome, 'saved');
    assert.notEqual(a.id, b.id);
    const jennifers = b.state.people.filter((p) => p.displayName === 'Jennifer Smith');
    assert.equal(jennifers.length, 2);
    valid(b.state);
  });

  test('the same organization and the same label do not merge either: identity is only ever the id', () => {
    const w = world();
    let s = w.state;
    const ids = [];
    for (let i = 0; i < 2; i += 1) {
      const r = addExternalPerson(s, w.at(), { displayName: 'Sam Lee', relationshipLabel: 'Coach', organizationLabel: 'Riverside FC' });
      ids.push(r.id);
      s = r.state;
    }
    assert.notEqual(ids[0], ids[1]);
    assert.equal(s.personContexts.length, 2, 'each person has their own private context');
    assert.notEqual(s.personContexts[0].personId, s.personContexts[1].personId);
    valid(s);
  });

  test('a name alone creates a person with NO context; a label or note creates the context too', () => {
    const w = world();
    const bare = addExternalPerson(w.state, w.at(), { displayName: 'Jordan Lee' });
    assert.equal(bare.state.personContexts.length, 0);
    const withNote = addExternalPerson(bare.state, w.at(), { displayName: 'Dana Park', contextNote: 'Knows the building code.' });
    assert.equal(withNote.state.personContexts.length, 1);
    assert.equal(withNote.state.personContexts[0].personId, withNote.id);
  });

  test('a person created from People is a canonical non-account person recorded as `other`, never a household member', () => {
    const w = world();
    const r = addExternalPerson(w.state, w.at(), { displayName: 'Taylor Brooks', relationshipLabel: 'Mom' });
    const person = r.state.people.find((p) => p.id === r.id);
    assert.equal(person.relationship, 'other', 'her label stays hers; the canonical category says nothing more');
    assert.equal(person.channel, 'unspecified');
    assert.equal(person.scope, 'personal');
    assert.equal(r.state.children.length, w.state.children.length, 'no member was created');
  });

  test('a name is 1..80 characters on one line; blank is refused and nothing is written', () => {
    const w = world();
    for (const bad of ['', '   ', 'x'.repeat(81), 'two\u0007bells']) {
      const r = addExternalPerson(w.state, w.at(), { displayName: bad });
      assert.equal(r.outcome, 'invalid_name', JSON.stringify(bad));
      assert.equal(r.state, w.state);
    }
    assert.equal(addExternalPerson(w.state, w.at(), { displayName: '  Río  Ávila ' }).state.people.at(-1).displayName, 'Río Ávila', 'trimmed, runs collapsed, accents kept');
  });
});

describe('RENAME — the same person under a new name', () => {
  test('renaming keeps the id, the context and every follow-up link; nothing is created', () => {
    const w = world();
    let r = addExternalPerson(w.state, w.at(), { displayName: 'Chris', relationshipLabel: 'Neighbor' });
    const id = r.id;
    const ctxId = r.state.personContexts[0].id;
    r = addFollowUp(r.state, w.at(), { contextId: ctxId, draftKey: draft(1), title: 'Return the ladder' });
    const renamed = renamePerson(r.state, w.at(), id, 'Chris Morgan');
    assert.equal(renamed.outcome, 'saved');
    const s = renamed.state;
    assert.equal(s.people.length, r.state.people.length, 'no second identity');
    assert.equal(s.people.find((p) => p.id === id).displayName, 'Chris Morgan');
    assert.equal(s.personContexts[0].personId, id, 'the context still names the same person');
    assert.equal(s.personTaskLinks[0].contextId, ctxId, 'the link is untouched');
    assert.equal(s.tasks.find((t) => t.id === followUpTaskId(draft(1))).title, 'Return the ladder', 'the Task is untouched');
    valid(s);
  });

  test('the co-parent is a READ-ONLY identity here: People cannot rename or archive them (F07 owns it)', () => {
    const w = world();
    assert.equal(renamePerson(w.state, w.at(), w.coParentId, 'Someone Else').outcome, 'read_only_identity');
    assert.equal(archiveExternalPerson(w.state, w.at(), w.coParentId).outcome, 'read_only_identity');
    assert.equal(w.state.people.find((p) => p.id === w.coParentId).displayName, 'Alex Rivera');
  });
});

describe('PERSON CONTEXT — one private context per person', () => {
  test('a context on a CHILD names the child by id and does not touch the child', () => {
    const w = world();
    const r = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE }, { relationshipLabel: 'Daughter' });
    assert.equal(r.outcome, 'saved');
    assert.equal(r.state.personContexts[0].childId, JOSIE);
    assert.equal(r.state.personContexts[0].personId, null);
    assert.deepEqual(r.state.children, w.state.children, 'the child is exactly as Kids left it');
    assert.equal(r.state.people.length, w.state.people.length, 'F13 DOES NOT DUPLICATE A CHILD as a person');
    valid(r.state);
  });

  test('a context on the co-parent is allowed, and changes nothing about the co-parent', () => {
    const w = world();
    const r = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId }, { contextNote: 'Prefers texts before 8.' });
    assert.equal(r.outcome, 'saved');
    assert.deepEqual(r.state.people, w.state.people);
    assert.deepEqual(r.state.responsibilities, w.state.responsibilities);
  });

  test('opening a second context for the same person returns the FIRST (one per person)', () => {
    const w = world();
    const first = openPersonContext(w.state, w.at(), { kind: 'child', id: MILO });
    const again = openPersonContext(first.state, w.at(), { kind: 'child', id: MILO }, { relationshipLabel: 'Son' });
    assert.equal(again.outcome, 'already_saved');
    assert.equal(again.id, first.id);
    assert.equal(again.state.personContexts.length, 1);
  });

  test('ARCHIVED CONTEXT DOES NOT MEAN RELATIONSHIP ENDED — and archiving never frees a second slot: opening restores it', () => {
    const w = world();
    const first = openPersonContext(w.state, w.at(), { kind: 'child', id: MILO }, { relationshipLabel: 'Son' });
    const archived = archivePersonContext(first.state, w.at(), first.id);
    assert.equal(archived.state.personContexts[0].status, 'archived');
    assert.deepEqual(archived.state.children, w.state.children, 'the child is untouched');
    const reopened = openPersonContext(archived.state, w.at(), { kind: 'child', id: MILO });
    assert.equal(reopened.outcome, 'saved');
    assert.equal(reopened.id, first.id, 'the SAME context comes back');
    assert.equal(reopened.state.personContexts.length, 1);
    assert.equal(reopened.state.personContexts[0].relationshipLabel, 'Son', 'with what she saved');
  });

  test('the account holder and unknown ids are never a target', () => {
    const w = world();
    assert.equal(openPersonContext(w.state, w.at(), { kind: 'child', id: w.state.user.id }).outcome, 'not_found');
    assert.equal(openPersonContext(w.state, w.at(), { kind: 'person', id: w.state.user.id }).outcome, 'not_found');
    assert.equal(openPersonContext(w.state, w.at(), { kind: 'child', id: 'child-ghost' }).outcome, 'not_found');
  });

  test('an archived person cannot gain a new context (it is unavailable), and the existing one stays as it was', () => {
    const w = world();
    const r = addExternalPerson(w.state, w.at(), { displayName: 'Pat' });
    const archived = archiveExternalPerson(r.state, w.at(), r.id);
    assert.equal(openPersonContext(archived.state, w.at(), { kind: 'person', id: r.id }).outcome, 'person_unavailable');
  });
});

describe('RELATIONSHIP LABEL / ORGANIZATION / NOTE — validated in the model, not only in a form', () => {
  const base = () => {
    const w = world();
    const r = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE });
    return { w, state: r.state, id: r.id };
  };

  test('a label is trimmed, runs collapse, and 60 characters (code points) is the limit — an emoji counts once', () => {
    const { w, state, id } = base();
    assert.equal(editPersonContext(state, w.at(), id, { relationshipLabel: '  Big   sister  ' }).state.personContexts[0].relationshipLabel, 'Big sister');
    assert.equal(editPersonContext(state, w.at(), id, { relationshipLabel: 'x'.repeat(60) }).outcome, 'saved');
    assert.equal(editPersonContext(state, w.at(), id, { relationshipLabel: 'x'.repeat(61) }).outcome, 'invalid_label');
    const emoji = '\u{1F9E1}'.repeat(60);
    assert.equal(emoji.length, 120, 'UTF-16 length is twice the characters');
    assert.equal(editPersonContext(state, w.at(), id, { relationshipLabel: emoji }).outcome, 'saved', 'sixty characters, as PostgreSQL counts them');
  });

  test('a note is up to 500 characters and may hold line breaks; control characters are refused', () => {
    const { w, state, id } = base();
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: 'line one\nline two' }).outcome, 'saved');
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: 'n'.repeat(500) }).outcome, 'saved');
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: 'n'.repeat(501) }).outcome, 'invalid_note');
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: 'bell\u0007' }).outcome, 'invalid_note');
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: `a${String.fromCharCode(0x2028)}b` }).outcome, 'invalid_note');
    assert.equal(editPersonContext(state, w.at(), id, { contextNote: 'a\r\nb' }).state.personContexts[0].contextNote, 'a\nb');
  });

  test('every field can be cleared; clearing is a real edit and the schema holds null', () => {
    const { w, state, id } = base();
    let s = editPersonContext(state, w.at(), id, { relationshipLabel: 'Coach', organizationLabel: 'Riverside FC', contextNote: 'Tuesdays' }).state;
    s = editPersonContext(s, w.at(), id, { relationshipLabel: '', organizationLabel: '   ', contextNote: '' }).state;
    const c = s.personContexts[0];
    assert.deepEqual([c.relationshipLabel, c.organizationLabel, c.contextNote], [null, null, null]);
    valid(s);
  });

  test('the stored schema refuses an untrimmed or over-long label even if a caller skips the command layer', () => {
    const { state } = base();
    const row = state.personContexts[0];
    assert.equal(PersonContextSchema.safeParse({ ...row, relationshipLabel: ' padded' }).success, false);
    assert.equal(PersonContextSchema.safeParse({ ...row, relationshipLabel: 'x'.repeat(PEOPLE_LIMITS.relationshipLabel + 1) }).success, false);
    assert.equal(PersonContextSchema.safeParse({ ...row, contextNote: '' }).success, false, 'an empty note is null, not ""');
    assert.equal(PersonContextSchema.safeParse({ ...row, childId: null }).success, false, 'a context names exactly one person');
    assert.equal(PersonContextSchema.safeParse({ ...row, personId: 'person-1' }).success, false, 'never two');
  });

  test('an unchanged edit writes nothing', () => {
    const { w, state, id } = base();
    const r = editPersonContext(state, w.at(), id, { relationshipLabel: null });
    assert.equal(r.outcome, 'unchanged');
    assert.equal(r.state, state);
  });
});

describe('ADD FOLLOW-UP — one canonical private Task and one link, together or not at all', () => {
  const setup = () => {
    const w = world();
    const r = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId }, { relationshipLabel: 'Co-parent', contextNote: 'SECRET-NOTE-TEXT' });
    return { w, state: r.state, contextId: r.id };
  };

  test('success: exactly one owner-private Task and exactly one follow_up link, titled only with what she typed', () => {
    const { w, state, contextId } = setup();
    const r = addFollowUp(state, w.at(), { contextId, draftKey: draft(1), title: '  Send the school forms ', dueDate: '2026-09-18' });
    assert.equal(r.outcome, 'saved');
    assert.equal(r.state.tasks.length, state.tasks.length + 1);
    assert.equal(r.state.personTaskLinks.length, 1);
    const task = r.state.tasks.at(-1);
    assert.equal(task.id, followUpTaskId(draft(1)));
    assert.equal(task.scope, 'personal', 'a private context makes a PRIVATE Task');
    assert.equal(task.title, 'Send the school forms');
    assert.equal(task.dueDate, '2026-09-18');
    assert.equal(task.status, 'open');
    assert.equal(task.categoryId, 'cat-relationships');
    assert.ok(!task.title.includes('Alex') && !task.title.includes('Co-parent') && !(task.notes ?? '').includes('SECRET'), 'no name, label or note is copied into the Task');
    const link = r.state.personTaskLinks[0];
    assert.deepEqual([link.id, link.contextId, link.followUp, link.relation], [followUpLinkId(draft(1)), contextId, { kind: 'task', id: task.id }, 'follow_up']);
    valid(r.state);
  });

  test('CANCEL: a flow that is opened and abandoned never calls the command — state is exactly as before', () => {
    const { state } = setup();
    // Opening the flow mints a draft key in memory and nothing else (see the UI test); with no save, nothing is written.
    assert.equal(state.tasks.length, 0);
    assert.equal(state.personTaskLinks.length, 0);
  });

  test('RETRY: saving the same draft twice creates nothing more', () => {
    const { w, state, contextId } = setup();
    const once = addFollowUp(state, w.at(), { contextId, draftKey: draft(2), title: 'Call about Saturday' });
    const twice = addFollowUp(once.state, w.at(), { contextId, draftKey: draft(2), title: 'Call about Saturday' });
    assert.equal(twice.outcome, 'already_saved');
    assert.equal(twice.state, once.state);
    assert.equal(twice.state.tasks.length, 1);
    assert.equal(twice.state.personTaskLinks.length, 1);
  });

  test('PARTIAL STATE: a Task without its link is RECOVERED by adding the link, never reported done without it', () => {
    const { w, state, contextId } = setup();
    const saved = addFollowUp(state, w.at(), { contextId, draftKey: draft(3), title: 'Pay back for lunch' });
    const orphan = { ...saved.state, personTaskLinks: [] };
    const retried = addFollowUp(orphan, w.at(), { contextId, draftKey: draft(3), title: 'Pay back for lunch' });
    assert.equal(retried.outcome, 'saved');
    assert.equal(retried.state.tasks.length, 1, 'no second Task');
    assert.equal(retried.state.personTaskLinks.length, 1, 'the missing link is added');
    valid(retried.state);
  });

  test('refusals change nothing: blank title, bad date, bad draft key, archived context, archived person, archived category', () => {
    const { w, state, contextId } = setup();
    const cases = [
      [{ contextId, draftKey: draft(4), title: '   ' }, 'invalid_title', state],
      [{ contextId, draftKey: draft(4), title: 't'.repeat(201) }, 'invalid_title', state],
      [{ contextId, draftKey: draft(4), title: 'ok', dueDate: '2026-02-30' }, 'invalid_date', state],
      [{ contextId, draftKey: 'short', title: 'ok' }, 'invalid_draft', state],
      [{ contextId: 'pctx-ghost', draftKey: draft(4), title: 'ok' }, 'not_found', state],
      [{ contextId, draftKey: draft(4), title: 'ok' }, 'context_archived', archivePersonContext(state, w.at(), contextId).state],
      [{ contextId, draftKey: draft(4), title: 'ok' }, 'no_category', { ...state, categories: state.categories.map((c) => (c.systemRole === 'relationships' ? { ...c, status: 'archived' } : c)) }],
    ];
    for (const [input, outcome, s] of cases) {
      const r = addFollowUp(s, w.at(), input);
      assert.equal(r.outcome, outcome, JSON.stringify(input));
      assert.equal(r.state, s);
    }
    const person = addExternalPerson(w.state, w.at(), { displayName: 'Robin', relationshipLabel: 'Friend' });
    const pctx = person.state.personContexts.at(-1).id;
    const gone = archiveExternalPerson(person.state, w.at(), person.id).state;
    assert.equal(addFollowUp(gone, w.at(), { contextId: pctx, draftKey: draft(5), title: 'x' }).outcome, 'person_unavailable');
  });
});

describe('TASK COMPLETED DOES NOT MEAN RELATIONSHIP RESOLVED — a Task never rewrites People truth', () => {
  test('completing, archiving or losing the linked Task leaves the context and the link exactly as they were', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE }, { relationshipLabel: 'Daughter' });
    const saved = addFollowUp(opened.state, w.at(), { contextId: opened.id, draftKey: draft(6), title: 'Ask about the recital' });
    const taskId = followUpTaskId(draft(6));
    for (const s of [completeTask(saved.state, w.at(), taskId), archiveTask(saved.state, w.at(), taskId)]) {
      assert.deepEqual(s.personContexts, saved.state.personContexts);
      assert.deepEqual(s.personTaskLinks, saved.state.personTaskLinks);
      valid(s);
    }
  });

  test('archiving a context changes no Task, no person and no other subsystem', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId });
    const saved = addFollowUp(opened.state, w.at(), { contextId: opened.id, draftKey: draft(7), title: 'Confirm pickup' });
    const archived = archivePersonContext(saved.state, w.at(), opened.id);
    assert.deepEqual(archived.state.tasks, saved.state.tasks, 'the follow-up Task is still an open Task');
    assert.deepEqual(archived.state.people, saved.state.people);
    assert.deepEqual(archived.state.children, saved.state.children);
    assert.deepEqual(archived.state.responsibilities, saved.state.responsibilities);
    assert.equal(restorePersonContext(archived.state, w.at(), opened.id).state.personContexts[0].status, 'active');
  });

  test('archiving and restoring an external person never cascades to the context', () => {
    const w = world();
    const r = addExternalPerson(w.state, w.at(), { displayName: 'Kim', contextNote: 'Old friend from work.' });
    const archived = archiveExternalPerson(r.state, w.at(), r.id);
    assert.deepEqual(archived.state.personContexts, r.state.personContexts, 'no automatic context archive or delete');
    const restored = restoreExternalPerson(archived.state, w.at(), r.id);
    assert.equal(restored.state.people.find((p) => p.id === r.id).status, 'active');
    assert.deepEqual(restored.state.personContexts, r.state.personContexts);
  });
});

describe('integrity: what a shape cannot express', () => {
  test('two contexts for one person, a link to a household-visible Task, and dangling references are all integrity problems', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE });
    const saved = addFollowUp(opened.state, w.at(), { contextId: opened.id, draftKey: draft(8), title: 'x' });
    const dup = { ...saved.state, personContexts: [...saved.state.personContexts, { ...saved.state.personContexts[0], id: 'pctx-dup' }] };
    assert.ok(peopleIntegrityProblems(dup).some((p) => p.includes('more than one person context')));
    const shared = { ...saved.state, tasks: saved.state.tasks.map((t) => (t.id === followUpTaskId(draft(8)) ? { ...t, scope: 'household' } : t)) };
    assert.ok(peopleIntegrityProblems(shared).some((p) => p.includes('not owner-private')));
    const dangling = { ...saved.state, children: [] };
    assert.ok(peopleIntegrityProblems(dangling).some((p) => p.includes('missing child')));
    assert.equal(validateAppState(dup).ok, false, 'a state with two contexts for one person is refused by the store gate');
  });

  test('integrity messages carry ids only — never a label or a note', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE }, { relationshipLabel: 'LABEL-TEXT', contextNote: 'NOTE-TEXT' });
    const broken = { ...opened.state, children: [] };
    for (const problem of peopleIntegrityProblems(broken)) assert.ok(!/LABEL-TEXT|NOTE-TEXT/.test(problem), problem);
    const verdict = validateAppState(broken);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.issues.every((issue) => !/LABEL-TEXT|NOTE-TEXT/.test(issue)));
  });

  test('contextFor finds the one context by canonical id', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: MILO });
    assert.equal(contextFor(opened.state, { kind: 'child', id: MILO }).id, opened.id);
    assert.equal(contextFor(opened.state, { kind: 'child', id: JOSIE }), null);
  });
});
