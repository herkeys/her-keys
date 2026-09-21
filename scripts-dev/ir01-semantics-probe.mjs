// HK-INTEGRATION-READINESS-01: observe the three shared-semantic defects (HA-009, HA-010, HA-011) on a tree. Run from a repository root,
// or point ROOT at another one:  ROOT=<path to a checkout of c2e56b9> node scripts-dev/ir01-semantics-probe.mjs
// Read-only: it imports the domain modules and prints what they answer.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.ROOT ?? process.cwd();
await import(pathToFileURL(join(ROOT, 'tests', 'support', 'register-ts.mjs')).href);
const load = (...p) => import(pathToFileURL(join(ROOT, 'src', ...p)).href);
const [structure, tasks, events, initial, apply, stateMod] = await Promise.all([
  load('domain', 'structure.ts'), load('domain', 'tasks.ts'), load('domain', 'events.ts'), load('state', 'initialState.ts'), load('domain', 'sync', 'apply.ts'), load('domain', 'state.ts'),
]);

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const ctx = () => { let n = 0; return { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-${++n}` }; };
const out = {};

// ---- HA-009: the same edge, a prerequisite that is REMOVED
{
  const c = ctx();
  let s = initial.createEmptyState('America/Chicago');
  s = events.addEvent(s, c, { title: 'Parent meeting', categoryId: 'cat-home', startsAt: '2026-09-25T23:00:00.000Z', endsAt: '2026-09-26T00:00:00.000Z', commitment: 'fixed', scope: 'household' });
  s = tasks.addTask(s, c, { title: 'File the form', categoryId: 'cat-home', scope: 'household', durationMinutes: 10 });
  const task = { kind: 'task', id: s.tasks[0].id };
  const event = { kind: 'event', id: s.events[0].id };
  s = structure.addDependency(s, c, { relation: 'requires', from: task, to: event }).state;
  const live = { blocked: structure.isBlocked(s, task), eventDone: structure.isDone(s, event) };
  s = events.removeEvent(s, c, event.id);
  out.HA009 = {
    live,
    afterRemoval: { eventIsDone: structure.isDone(s, event), blockersNamed: structure.blockersOf(s, task).length, dependentBlocked: structure.isBlocked(s, task), readiness: structure.readinessOf ? structure.readinessOf(s, task) : '(no such vocabulary)' },
  };
}

// ---- HA-010: an explicit 15 and a defaulted 15
{
  const strip = (t) => { const { id, createdAt, updatedAt, title, ...rest } = t; return rest; };
  const defaulted = tasks.addTask(initial.createEmptyState('America/Chicago'), ctx(), { title: 'A', categoryId: 'cat-home', scope: 'household' }).tasks[0];
  const explicit = tasks.addTask(initial.createEmptyState('America/Chicago'), ctx(), { title: 'A', categoryId: 'cat-home', scope: 'household', durationMinutes: 15, ...(structure.readinessOf ? { durationSource: 'user' } : {}) }).tasks[0];
  out.HA010 = {
    defaultedMinutes: defaulted.durationMinutes,
    explicitMinutes: explicit.durationMinutes,
    defaultedSource: 'durationSource' in defaulted ? defaulted.durationSource : '(field does not exist)',
    explicitSource: 'durationSource' in explicit ? explicit.durationSource : '(field does not exist)',
    indistinguishable: JSON.stringify(strip(defaulted)) === JSON.stringify(strip(explicit)),
  };
}

// ---- HA-011: a child's routine arrives from the cloud
{
  const CH = '55555555-5555-4555-8555-555555555555';
  const CAT = '66666666-6666-4666-8666-666666666666';
  let s = { ...initial.createEmptyState('America/Chicago'), children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }] };
  const resolve = (cloud) => (cloud === CH ? 'child-1' : cloud === CAT ? s.categories[0].id : null);
  const row = { id: '77777777-7777-4777-8777-777777777777', revision: 1, name: 'Homework wind-down', description: '', category_id: CAT, subject_member_id: CH, scope: 'child', automation_mode: 'manual', producer: 'user-action' };
  const back = apply.applyCloudRow(s, 'system', 'sys-1', row, resolve);
  const system = back.systems[0];
  const validated = stateMod.validateAppState(back);
  out.HA011 = {
    schemaHasSubjectField: Boolean(stateMod.HouseholdSystemSchema?.shape && 'subjectMemberId' in stateMod.HouseholdSystemSchema.shape),
    pulledScope: system?.scope,
    pulledSubject: system && 'subjectMemberId' in system ? system.subjectMemberId : '(field does not exist: the child was dropped)',
    stateAccepted: validated.ok,
  };
}

console.log(JSON.stringify(out, null, 2));
