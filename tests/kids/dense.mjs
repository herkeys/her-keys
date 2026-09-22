/**
 * A dense, deterministic Kids household, built through the REAL transitions: several children (two who share a name), well over a
 * hundred child-linked records across many dates, every responsibility state, dependencies (live, completed, removed), plan steps,
 * default / stated / unrecorded lengths, unknown locations, an archived person. Used by the correctness test and by the performance
 * script, so both measure the same thing.
 */
import { completeTask, archiveTask } from '../../src/domain/tasks.ts';
import { addDependency } from '../../src/domain/structure.ts';
import { addPerson, archivePerson } from '../../src/domain/responsibility.ts';
import { acknowledge, accept, decline, delegate } from '../../src/domain/responsibility.ts';
import { createChildEvent, createChildTask } from '../../src/features/kids/mutations.ts';
import { emptyHousehold, makeCtx, withChildren } from './support.mjs';

const NAMES = [['Sam', '2018-03-03'], ['Sam', '2020-07-07'], ['Ivy', '2021-06-10'], ['Max', '2015-01-01'], ['Noor', '2017-11-30'], ['Ada', '2019-05-05']];
const D = { dueDate: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', handoffToPersonId: null, partOf: null };

export function denseHousehold({ children = 6, eventsPerChild = 10, tasksPerChild = 14, extraTasks = 0 } = {}) {
  const c = makeCtx();
  let s = withChildren(emptyHousehold(), c, NAMES.slice(0, children));
  for (const name of ['Alex', 'Jo', 'Pat']) s = addPerson(s, c, { displayName: name, relationship: 'co-parent' });
  const people = s.people.map((p) => p.id);
  const kids = s.children.map((k) => k.id);

  kids.forEach((childId, ci) => {
    const events = [];
    const tasks = [];
    for (let i = 0; i < eventsPerChild; i += 1) {
      const day = 22 + ((ci + i) % 20); // 22 Sep .. mid Oct
      const date = day <= 30 ? `2026-09-${day}` : `2026-10-${String(day - 30).padStart(2, '0')}`;
      const out = createChildEvent(s, c, { childId, title: `Practice ${ci}-${i}`, date, startText: `${1 + (i % 9)}:00 PM`, endText: `${1 + (i % 9)}:45 PM`, location: i % 3 === 0 ? '' : `Field ${i}`, notes: '', commitment: i % 2 ? 'fixed' : 'flexible', handoffToPersonId: null });
      s = out.state;
      events.push(out.eventId);
    }
    for (let i = 0; i < tasksPerChild; i += 1) {
      const out = createChildTask(s, c, { childId, title: `Form ${ci}-${i}`, ...D, dueDate: i % 4 === 0 ? '' : `2026-09-${String(20 + (i % 10)).padStart(2, '0')}`, durationText: i % 3 === 0 ? String(10 + i) : '', durationTouched: i % 3 === 0 });
      s = out.state;
      tasks.push(out.taskId);
    }

    // responsibility in every state, on events and tasks
    const ask = (ref, holder) => (s = delegate(s, c, { about: ref, to: { kind: 'person', id: holder } }));
    const respOf = (ref) => s.responsibilities.find((r) => r.about.id === ref.id && r.state !== 'returned');
    events.slice(0, 5).forEach((id, i) => {
      const ref = { kind: 'event', id };
      ask(ref, people[i % 3]);
      const r = respOf(ref);
      if (i === 1) s = acknowledge(s, c, r.id);
      if (i === 2) s = accept(s, c, r.id, true);
      if (i === 3) s = accept(s, c, r.id, false);
      if (i === 4) s = decline(s, c, r.id);
    });
    tasks.slice(0, 4).forEach((id, i) => {
      const ref = { kind: 'task', id };
      ask(ref, people[(i + 1) % 3]);
      if (i === 3) s = accept(s, c, respOf(ref).id, false);
    });

    // dependencies: live, satisfied by completion, and set aside by removal
    const dep = (from, to) => (s = addDependency(s, c, { relation: 'requires', from: { kind: 'task', id: from }, to: { kind: 'task', id: to } }).state);
    dep(tasks[5], tasks[6]);
    dep(tasks[7], tasks[8]);
    dep(tasks[9], tasks[10]);
    s = completeTask(s, c, tasks[8]);
    s = archiveTask(s, c, tasks[10]);
    // plan steps toward two commitments
    for (const id of events.slice(5, 7)) {
      const out = createChildTask(s, c, { childId, title: `Arrange backup ${id}`, ...D, partOf: { kind: 'event', id } });
      s = out.state;
    }
  });

  // one extra person is archived, so some accepted plans lose their holder
  s = archivePerson(s, c, people[2]);

  // a large bulk of extra open tasks spread across the children (scenario AQ)
  for (let i = 0; i < extraTasks; i += 1) {
    s = createChildTask(s, c, { childId: kids[i % kids.length], title: `Bulk ${i}`, ...D, dueDate: i % 5 ? `2026-09-${String(22 + (i % 8)).padStart(2, '0')}` : '' }).state;
  }
  return s;
}

/** Deterministic Fisher-Yates so a "shuffled" household is the same shuffle every run. */
export function shuffled(list, seed = 7) {
  const out = [...list];
  let x = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
