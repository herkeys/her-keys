/**
 * HK-FEATURE-13 (People OS) — the doctrine, stated as tests. Where a doctrine is already proven behaviourally elsewhere the test here
 * is the STRUCTURAL half: the thing it forbids has no field, no code path and no word to exist through.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { PersonContextSchema, PersonTaskLinkSchema } from '../../src/domain/foundation/personContext.ts';
import { HouseholdPersonSchema } from '../../src/domain/foundation/responsibility.ts';
import {
  addExternalPerson,
  archivePersonContext,
  editPersonContext,
  openPersonContext,
  renamePerson,
} from '../../src/domain/people.ts';
import { buildPeopleHome, peopleRows } from '../../src/features/people/projection.ts';
import { DAY, JOSIE, world } from './world.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const F13_CODE = ['src/domain/people.ts', 'src/domain/foundation/personContext.ts', 'src/features/people/projection.ts', 'src/features/people/privateNote.ts', 'src/features/people/lifeTile.ts'];
const MIGRATION = read('supabase/migrations/20260922200000_f13_people_os.sql');

describe('identity', () => {
  test('PERSON IDENTITY IS NOT DISPLAY NAME — no F13 code finds, matches or merges anybody by name', () => {
    for (const file of F13_CODE) {
      const c = code(file);
      assert.equal(/\.(find|filter|some|findIndex)\([^)]*displayName\s*===/.test(c), false, `${file} looks a person up by name`);
      assert.equal(/merge|dedup/i.test(c), false, `${file} merges or de-duplicates people`);
    }
  });

  test('SAME EMAIL / PHONE DOES NOT MEAN SAME PERSON — there is no email, phone or address to match on, locally or in the cloud', () => {
    const fields = [...Object.keys(HouseholdPersonSchema.shape), ...Object.keys(PersonContextSchema.shape ?? PersonContextSchema.def?.in?.shape ?? {}), ...Object.keys(PersonTaskLinkSchema.shape)];
    for (const f of fields) assert.equal(/email|phone|address|contact|mobile|sms/i.test(f), false, f);
    const createTables = MIGRATION.slice(MIGRATION.indexOf('CREATE TABLE public.person_contexts'), MIGRATION.indexOf('-- Phase 2'));
    assert.equal(/email|phone|address|mobile/i.test(createTables), false, 'no contact column in the People tables');
  });

  test('RELATIONSHIP LABEL DOES NOT DEFINE IDENTITY — editing her label changes no identity and the same label on two people keeps two', () => {
    const w = world();
    const a = addExternalPerson(w.state, w.at(), { displayName: 'Kai', relationshipName: 'Coach' });
    const b = addExternalPerson(a.state, w.at(), { displayName: 'Rio', relationshipName: 'Coach' });
    const edited = editPersonContext(b.state, w.at(), b.state.personContexts[0].id, { relationshipName: 'Mentor' });
    assert.deepEqual(edited.state.people.map((p) => [p.id, p.displayName, p.relationship]), b.state.people.map((p) => [p.id, p.displayName, p.relationship]));
    assert.equal(edited.state.people.filter((p) => p.relationship === 'other').length, 2, 'the canonical relationship never follows her label');
  });

  test('CHILD RENAMED elsewhere: the context follows the id, not the name', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE }, { relationshipName: 'Daughter' });
    const renamed = { ...opened.state, children: opened.state.children.map((c) => (c.id === JOSIE ? { ...c, displayName: 'Josephine' } : c)) };
    const row = peopleRows(renamed).find((r) => r.key === `child:${JOSIE}`);
    assert.deepEqual([row.displayName, row.secondary, row.contextId], ['Josephine', 'Daughter', opened.id]);
  });
});

describe('a person is not work', () => {
  test('PERSON DOES NOT BECOME A TASK — no People command but Add Follow-up creates a Task', () => {
    const w = world();
    let s = w.state;
    const steps = [
      (x) => addExternalPerson(x, w.at(), { displayName: 'Ana', relationshipName: 'Friend', contextNote: 'n' }),
      (x) => openPersonContext(x, w.at(), { kind: 'child', id: JOSIE }),
      (x) => editPersonContext(x, w.at(), x.personContexts[0].id, { contextNote: 'changed' }),
      (x) => archivePersonContext(x, w.at(), x.personContexts[0].id),
      (x) => renamePerson(x, w.at(), x.people.find((p) => p.displayName === 'Ana').id, 'Ana B'),
    ];
    for (const step of steps) {
      const r = step(s);
      assert.equal(r.state.tasks.length, s.tasks.length, 'no Task');
      assert.equal(r.state.events.length, s.events.length, 'no Event');
      assert.equal(r.state.needsMe.length, s.needsMe.length, 'no Needs Me item');
      assert.equal((r.state.personTaskLinks ?? []).length, 0, 'no link');
      s = r.state;
    }
  });
});

describe('no social inference, no scores', () => {
  test('F13 DOES NOT GENERATE RELATIONSHIP SCORES — no stored or projected field measures a person or a relationship', () => {
    const SCORE = /score|health|strength|closeness|importance|rank|streak|lastContact|contactCount|lastContacted|momentum|neglect/i;
    for (const f of [...Object.keys(PersonTaskLinkSchema.shape), ...Object.keys(HouseholdPersonSchema.shape)]) assert.equal(SCORE.test(f), false, f);
    assert.equal(SCORE.test(MIGRATION.slice(MIGRATION.indexOf('CREATE TABLE public.person_contexts'), MIGRATION.indexOf('-- Phase 2'))), false);
    const w = world();
    const home = buildPeopleHome(openPersonContext(w.state, w.at(), { kind: 'child', id: JOSIE }, { relationshipName: 'Daughter' }).state, DAY);
    for (const row of home.people) assert.deepEqual(Object.keys(row).sort(), ['contextId', 'displayName', 'identityEditable', 'key', 'kindLabel', 'secondary', 'source']);
  });

  test('F13 DOES NOT INFER SOCIAL HEALTH — nothing about a person is computed from time, activity or notes', () => {
    for (const file of F13_CODE) {
      const c = code(file);
      assert.equal(/Date\.now\(\)|daysBetween|lastContact|since/.test(c.replace(/formatFollowUpDate/g, '')), false, `${file} reads the clock or computes elapsed time about a person`);
    }
  });

  test('PRIVATE CONTEXT IS STATED BY HER — the cloud refuses any other producer', () => {
    const producerChecks = MIGRATION.match(/stated_by_her_check CHECK \(producer = 'user-action'\)/g) ?? [];
    assert.equal(producerChecks.length, 2, 'both People tables accept only what she did');
  });
});
