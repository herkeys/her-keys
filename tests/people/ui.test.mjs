/**
 * HK-FEATURE-13 (People OS) — the screens, rendered under the RN stub (props contract and visible text, not pixels), plus the
 * structural guarantees that keep private context where it belongs.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, test } from 'node:test';
import { addFollowUp, openPersonContext } from '../../src/domain/people.ts';
import { peopleCopy } from '../../src/features/people/copy.ts';
import { draftKeyFrom } from '../../src/features/people/draftKey.ts';
import { personDetail } from '../../src/features/people/privateNote.ts';
import { buildPeopleHome } from '../../src/features/people/projection.ts';
import { demoState } from '../support/fixtures.mjs';
import { AddPersonView } from '../../src/features/people/ui/AddPersonView.tsx';
import { FollowUpFormView } from '../../src/features/people/ui/FollowUpFormView.tsx';
import { PeopleHomeView } from '../../src/features/people/ui/PeopleHomeView.tsx';
import { PersonDetailView } from '../../src/features/people/ui/PersonDetailView.tsx';
import { render } from '../support/render.tsx';
import { DAY, draft, world } from './world.mjs';

const textOf = (node) => {
  const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v === null || v === undefined || v === false ? [] : [String(v)]);
  return flat(node.props.children).join('');
};
const allText = (r) => r.root.findAllByType('Text').map(textOf).join('\n');
const noop = () => {};

const SECRET = 'NOTE-4c1a only mine';

function peopled() {
  const w = world();
  const opened = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId }, { relationshipName: 'Co-parent', contextNote: SECRET });
  let s = opened.state;
  for (let i = 0; i < 4; i += 1) s = addFollowUp(s, w.at(), { contextId: opened.id, draftKey: draft(i), title: `Follow-up ${i}`, dueDate: DAY }).state;
  return { w, s, contextId: opened.id };
}

describe('People home', () => {
  test('verdict first; at most three follow-ups with "See all N"; everyone in name order; the note is NOT on the home', async () => {
    const { s } = peopled();
    const r = await render(<PeopleHomeView view={buildPeopleHome(s, DAY)} showAllFollowUps={false} onOpenPerson={noop} onAddPerson={noop} onSeeAllFollowUps={noop} />);
    const text = allText(r);
    assert.match(text, /Four follow-ups need attention\./);
    assert.equal((text.match(/Follow-up \d/g) ?? []).length, 3, 'three at first glance');
    assert.match(text, /See all 4/);
    assert.ok(!text.includes(SECRET), 'contextNote never appears on the People list');
    for (const name of ['Alex Rivera', 'Josie', 'Milo']) assert.ok(text.includes(name), name);
  });

  test('"See all" shows every follow-up', async () => {
    const { s } = peopled();
    const r = await render(<PeopleHomeView view={buildPeopleHome(s, DAY)} showAllFollowUps onOpenPerson={noop} onAddPerson={noop} onSeeAllFollowUps={noop} />);
    assert.equal((allText(r).match(/Follow-up \d/g) ?? []).length, 4);
  });

  test('EMPTY: the gentle invitation, and no CRM or social-pressure framing', async () => {
    const w = world({ coParent: false });
    const r = await render(<PeopleHomeView view={buildPeopleHome({ ...w.state, children: [] }, DAY)} showAllFollowUps={false} onOpenPerson={noop} onAddPerson={noop} onSeeAllFollowUps={noop} />);
    const text = allText(r);
    assert.match(text, /Add someone you want Her Keys to remember\./);
    for (const banned of [/build your network/i, /grow your relationships/i, /stay connected/i]) assert.doesNotMatch(text, banned);
  });

  test('DEMO: the fictional cast renders, the two "Jordan Lee"s are two rows told apart by her own labels', async () => {
    const s = demoState();
    const home = buildPeopleHome(s, DAY);
    const jordans = home.people.filter((row) => row.displayName === 'Jordan Lee');
    assert.equal(jordans.length, 2);
    assert.notEqual(jordans[0].key, jordans[1].key);
    assert.deepEqual(jordans.map((j) => j.secondary).sort(), ['Friend', 'Soccer coach']);
    const r = await render(<PeopleHomeView view={home} showAllFollowUps={false} onOpenPerson={noop} onAddPerson={noop} onSeeAllFollowUps={noop} />);
    const rows = r.root.findAllByType('Pressable').filter((p) => (p.props.accessibilityLabel ?? '').startsWith('Jordan Lee,'));
    assert.deepEqual(rows.map((p) => p.props.accessibilityLabel).sort(), ['Jordan Lee, Friend', 'Jordan Lee, Soccer coach'], 'two People rows, never merged or numbered');
  });
});

describe('Person detail', () => {
  test('the detail shows the private note (its only surface) and says who owns a read-only identity', async () => {
    const { s, w } = peopled();
    const detail = personDetail(s, `person:${w.coParentId}`, DAY);
    const r = await render(
      <PersonDetailView detail={detail} busy={false} message={null} onRemember={noop} onSaveContext={noop} onArchiveContext={noop} onRestoreContext={noop} onRename={noop} onArchivePerson={noop} onRestorePerson={noop} onAddFollowUp={noop} />
    );
    const inputs = r.root.findAllByType('TextInput').map((i) => i.props.value);
    assert.ok(inputs.includes(SECRET), 'the note is in its own field on the detail screen');
    assert.match(allText(r), /Their details are managed in Co-Parent\./);
    assert.ok(!r.root.findAllByType('Pressable').some((p) => p.props.accessibilityLabel === peopleCopy.detail.archivePerson), 'no identity archive for the co-parent');
    assert.ok(r.root.findAllByType('Pressable').some((p) => p.props.accessibilityLabel === peopleCopy.followUp.add), 'Add a follow-up is offered');
  });
});

describe('Add Follow-up form', () => {
  test('opens with an EMPTY title — no name, label, note or suggested action — and states that it is private', async () => {
    const { s, w } = peopled();
    const detail = personDetail(s, `person:${w.coParentId}`, DAY);
    const r = await render(<FollowUpFormView displayName={detail.displayName} busy={false} message={null} onSave={noop} onCancel={noop} />);
    const [title, date] = r.root.findAllByType('TextInput');
    assert.equal(title.props.value, '');
    assert.equal(date.props.value, '');
    assert.match(allText(r), /Private to you\./);
    assert.ok(!allText(r).includes(SECRET));
  });

  test('OPEN then CANCEL writes nothing: rendering the form and pressing Cancel never touches state', async () => {
    const { s, w } = peopled();
    const before = JSON.stringify(s);
    let saved = 0;
    let cancelled = 0;
    const r = await render(<FollowUpFormView displayName="Alex Rivera" busy={false} message={null} onSave={() => (saved += 1)} onCancel={() => (cancelled += 1)} />);
    const cancel = r.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === peopleCopy.followUp.cancel);
    assert.ok(cancel, 'the Cancel control exists');
    cancel.props.onPress();
    assert.equal(cancelled, 1);
    assert.equal(saved, 0, 'no save was issued');
    assert.equal(JSON.stringify(s), before, 'state is exactly as it was');
    void w;
  });

  test('the draft key is minted from random bytes, fits the command\'s pattern, and differs for different bytes', () => {
    const a = draftKeyFrom(new Uint8Array(20).fill(7));
    const b = draftKeyFrom(Uint8Array.from({ length: 20 }, (_, i) => i * 13));
    assert.match(a, /^[a-z0-9]{24,48}$/);
    assert.notEqual(a, b);
    assert.throws(() => draftKeyFrom(new Uint8Array(4)));
  });
});

describe('Add someone', () => {
  test('a name plus optional label/org/note; the label is described as a short label, not as notes', async () => {
    const r = await render(<AddPersonView busy={false} message={null} onSubmit={noop} />);
    const text = allText(r);
    assert.match(text, /short label/i);
    assert.doesNotMatch(text, /Notes about this person/i);
  });
});

// ------------------------------------------------------------------ static guarantees ---

const walk = (dir) =>
  readdirSync(new URL(`../../${dir}`, import.meta.url)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(new URL(`../../${rel}`, import.meta.url)).isDirectory() ? walk(rel) : [rel];
  });
const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('PRIVATE CONTEXT DOES NOT BECOME VISIBLE ELSEWHERE — static', () => {
  const peopleFiles = walk('src/features/people').filter((f) => /\.(ts|tsx)$/.test(f));

  // A READ of the note: a property access (`x.contextNote`) or a destructuring/shorthand (`{ contextNote }`, `, contextNote,`). A copy
  // key (`contextNote: 'Private note'`) or the sync manifest's field NAME (`local: 'contextNote'`) is not a read.
  const READS_NOTE = /\.contextNote\b|[{,]\s*contextNote\s*[,}]/;

  test('only the detail selector and the detail/add surfaces read `contextNote`; the list, verdict, tile, copy and follow-up code never do', () => {
    // privateNote.ts: the one selector. PersonDetailView / AddPersonView: the person's own detail/edit and creation surfaces.
    // containers.tsx only passes the form's fields straight to a command.
    const allowed = new Set(['src/features/people/privateNote.ts', 'src/features/people/ui/PersonDetailView.tsx', 'src/features/people/ui/AddPersonView.tsx']);
    for (const file of peopleFiles) {
      if (allowed.has(file)) continue;
      assert.equal(READS_NOTE.test(code(file)), false, `${file} reads contextNote`);
    }
  });

  test('nothing outside People OS reads a context note: no Today, Life, sync log, analytics or error path', () => {
    const others = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/features/people/'));
    // The model that defines it, the commands that write it, and the demo seed (which sets it to null).
    const allowed = new Set(['src/domain/foundation/personContext.ts', 'src/domain/people.ts', 'src/data/seed/demoPeople.ts']);
    for (const file of others) {
      if (allowed.has(file)) continue;
      assert.equal(READS_NOTE.test(code(file)), false, `${file} reads contextNote`);
    }
  });

  test('People code logs nothing and calls no network, contacts, SMS, mail or phone API', () => {
    for (const file of [...peopleFiles, 'src/domain/people.ts', 'src/domain/foundation/personContext.ts']) {
      const c = code(file);
      assert.equal(/console\.|fetch\(|XMLHttpRequest|expo-contacts|Linking\.openURL|sms:|mailto:|tel:/.test(c), false, file);
    }
  });

  test('the Life hub, its layout and the Today/One Move code are untouched by F13 (registration is deferred to integration)', () => {
    // Asserted by content markers rather than git so it holds in any checkout: none of these files mention People OS.
    for (const file of ['app/(app)/life/index.tsx', 'app/(app)/life/_layout.tsx', 'src/features/life/lifeStatus.ts', 'src/domain/oneMove.ts', 'src/features/today/model/todayView.ts']) {
      assert.equal(/HK-FEATURE-13|people\/|personContext/i.test(read(file)), false, file);
    }
  });
});

describe('COPY SAFETY — no moralising, ranking or social pressure', () => {
  const BANNED = [/reach out/i, /lost touch/i, /relationship health/i, /relationship score/i, /important people/i, /neglect/i, /stay connected/i, /you should/i, /haven.t (talked|checked|spoken)/i, /top relationships/i, /streak/i, /reconnect/i, /last contacted/i, /close friends?/i, /build your network/i];

  test('every People string (copy module and rendered views) is free of the banned phrases', () => {
    const files = [...walk('src/features/people').filter((f) => /\.(ts|tsx)$/.test(f)), 'src/domain/people.ts', 'src/data/seed/demoPeople.ts'];
    for (const file of files) {
      const strings = [...code(file).matchAll(/(['`"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
      for (const s of strings) for (const re of BANNED) assert.doesNotMatch(s, re, `${file}: "${s}"`);
    }
  });
});
