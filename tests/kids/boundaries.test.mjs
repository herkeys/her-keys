/**
 * HK-FEATURE-05 — boundaries: demo isolation, account switching, the feature boundary, no second universe, no dead affordance
 * (scenarios AJ, AK, AS and the sibling-import, feature-boundary and affordance audits).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { isSyncable } from '../../src/domain/foundation/provenance.ts';
import { canOpenScreen, rootScreenForPath } from '../../src/domain/routeAccess.ts';
import { addDependency } from '../../src/domain/structure.ts';
import { buildChildDetail, buildKidsView } from '../../src/features/kids/projection.ts';
import { addChildToHousehold, createChildEvent, createChildTask, recordAccepted, requestHandoffToNewPerson } from '../../src/features/kids/mutations.ts';
import { demoState, onboardedState } from '../support/fixtures.mjs';
import { NOW, stringLiterals, withoutComments } from './support.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const kidsFiles = () => walk(join(ROOT, 'src', 'features', 'kids')).filter((p) => /\.(ts|tsx)$/.test(p));
const routeFiles = () => [join(ROOT, 'app', '(app)', 'life', 'kids.tsx'), join(ROOT, 'app', '(app)', 'life', 'child-add.tsx'), join(ROOT, 'app', '(app)', 'life', 'child-item.tsx'), join(ROOT, 'app', '(app)', 'life', 'child', '[childId].tsx')];
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(ROOT, p).split('\\').join('/');

describe('AK. demo isolation: what Kids writes into a demo household can never reach an account', () => {
  const nextCtx = () => { let n = 0; return { nowMs: NOW, today: '2026-09-16', createId: (p) => `${p}-k-${++n}` }; };

  test('every row Kids writes in a demo household is demo-seed provenance, and demo-seed is not syncable', () => {
    const c = nextCtx();
    let s = demoState();
    s = addChildToHousehold(s, c, { displayName: 'Kai', birthDate: '2022-01-01' }).state;
    const kai = s.children.at(-1).id;
    s = createChildTask(s, c, { childId: kai, title: 'Demo task', dueDate: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', handoffToPersonId: null, partOf: null }).state;
    const ev = createChildEvent(s, c, { childId: kai, title: 'Demo event', date: '2026-09-17', startText: '5:00 PM', endText: '6:00 PM', location: '', notes: '', commitment: 'fixed', handoffToPersonId: null });
    s = ev.state;
    const asked = requestHandoffToNewPerson(s, c, { ref: { kind: 'event', id: ev.eventId }, name: 'Alex', relationship: 'co-parent' });
    s = recordAccepted(asked.state, c, asked.state.responsibilities[0].id, false).state;
    const written = [s.tasks.find((t) => t.title === 'Demo task'), s.events.find((e) => e.title === 'Demo event'), s.people[0], s.responsibilities[0]];
    for (const row of written) {
      assert.equal(row.provenance.producer, 'demo-seed');
      assert.equal(isSyncable(row.provenance.producer), false);
    }
    assert.equal(s.origin, 'demo');
  });

  test('Kids works on the demo household without a second universe: the seeded children and their rows are read as they are', () => {
    const s = demoState();
    const v = buildKidsView(s, s.household.id, { nowMs: Date.UTC(2026, 8, 16, 14) });
    assert.deepEqual(v.children.map((k) => k.label.displayName), ['Josie', 'Theo']);
    const josie = buildChildDetail(s, s.household.id, s.children.find((k) => k.displayName === 'Josie').id, { nowMs: Date.UTC(2026, 8, 16, 14) });
    const titles = [...josie.upcoming, ...Object.values(josie.openWork).flat()].map((i) => i.title);
    assert.ok(titles.some((t) => /soccer/i.test(t)) || titles.some((t) => /field trip/i.test(t)), titles.join('|'));
    // "Pick up Josie & Theo" is recorded against the ADULT, so it is household-level and is not under either child.
    assert.equal(titles.includes('Pick up Josie & Theo'), false);
  });
});

describe('AJ. account switching: another account\'s household is never rendered, so Kids cannot expose it', () => {
  const base = () => {
    const s = onboardedState();
    return { status: 'ready', onboarding: s.onboarding, internalTools: false };
  };
  const session = { accountId: 'acct-a', accessToken: 'x', refreshToken: 'y', expiresAt: 0, provider: { provider: 'apple', subject: 's', suggestedDisplayName: null } };

  test('every Kids route resolves to the (app) group, which is closed while a different account\'s household is on the device', () => {
    for (const path of ['/life/kids', '/life/child/child-1', '/life/child-item', '/life/child-add']) assert.equal(rootScreenForPath(path), '(app)', path);
    const other = { ...base(), account: { kind: 'boundOther', session, quarantinedAccountId: 'acct-other' } };
    assert.equal(canOpenScreen('(app)', other), false);
    const mine = { ...base(), account: { kind: 'accountBound', session, householdId: 'h' } };
    assert.equal(canOpenScreen('(app)', mine), true);
  });

  test('a screen kept from the previous account asks for a household id it is not holding, and gets nothing', () => {
    const s = onboardedState();
    const previous = buildKidsView(s, 'household-of-account-a', { nowMs: NOW });
    assert.equal(previous.status, 'household_mismatch');
    assert.deepEqual(previous.children, []);
  });
});

describe('the feature boundary and the sibling-import scan', () => {
  test('SIBLING IMPORTS: ZERO. Kids imports no sibling Wave 2 feature and no Wave 1 feature implementation', () => {
    const files = [...kidsFiles(), ...routeFiles()];
    const hits = [];
    for (const file of files) {
      for (const line of read(file).split('\n')) {
        if (!/^\s*(import|export)\b.*\bfrom\b|import\(/.test(line)) continue;
        if (/feature\/0[678]|features\/(home|meals|coparent|co-parent|people|lifeadmin|life-admin)|talk-it-out|features\/today|features\/calendar|features\/systems|daily-load|one-move/i.test(line)) hits.push(`${rel(file)}: ${line.trim()}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  test('the only feature Kids imports from is Life (the machinery the inherited Kids screen already used)', () => {
    const others = new Set();
    for (const file of kidsFiles()) {
      for (const match of read(file).matchAll(/from '(\.\.\/)+([a-z-]+)\/[^']*'/g)) {
        if (/features/.test(file) && match[0].includes("'../") && !/domain|design|store|state|platform|config|types|data/.test(match[2])) others.add(match[2]);
      }
    }
    assert.deepEqual([...others].sort(), ['life']);
  });

  test('no sync mechanism, no provider, no network and no model SDK is touched from the feature', () => {
    const banned = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|supabase|gemini|openai|anthropic|@google|createSyncCoordinator|enqueue\s*\()/i;
    for (const file of [...kidsFiles(), ...routeFiles()]) {
      const code = read(file).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert.doesNotMatch(code, banned, rel(file));
    }
  });

  test('NO SECOND UNIVERSE: no KidTask, KidEvent, KidCalendarEntry, KidResponsibility, KidDependency, KidDuration or second Child model is declared', () => {
    const decl = /\b(interface|type|class|const|function)\s+(KidTask|KidEvent|KidCalendarEntry|KidResponsibility|KidDependency|KidDuration|KidItem|ChildModel|KidsChild)\b/;
    for (const file of kidsFiles()) assert.doesNotMatch(read(file), decl, rel(file));
    // and the canonical collections are the only place children, tasks, events and responsibilities live
    assert.match(read(join(ROOT, 'src', 'domain', 'children.ts')), /children: \[\.\.\.state\.children, child\]/);
  });

  test('a child is never identified by name or position in Kids code', () => {
    for (const file of kidsFiles().filter((f) => !/identity\.ts$/.test(f))) {
      const code = read(file);
      assert.doesNotMatch(code, /children\[\d\]|children\.find\(\s*\(?\w+\)?\s*=>\s*\w+\.displayName\s*===|displayName\s*===\s*['"`]/, rel(file));
    }
  });

  test('nothing in the projection or mutations reads the device clock', () => {
    for (const name of ['projection.ts', 'mutations.ts', 'responsibility.ts', 'identity.ts', 'time.ts']) {
      assert.doesNotMatch(read(join(ROOT, 'src', 'features', 'kids', name)).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'), /Date\.now\(|new Date\(\)/, name);
    }
  });
});

describe('AFFORDANCE AUDIT: nothing unexplained, fake or dead reaches a user', () => {
  const userFacing = () => [...kidsFiles().filter((f) => !/\.test\./.test(f)), ...routeFiles()].flatMap((f) => stringLiterals(read(f)).map((s) => [rel(f), s]));

  test('no "coming soon", TODO, TBD, "not implemented", lorem, or fake reminder / notification / AI / save / covered / plan / authorization text', () => {
    const banned = /coming soon|\bTODO\b|\bTBD\b|not implemented|lorem ipsum|fake (reminder|notification|ai|save|responsibility|authorization|covered|plan)/i;
    const hits = userFacing().filter(([, s]) => banned.test(s));
    assert.deepEqual(hits, []);
  });

  test('no disabled control is left without an explanation, and no control does nothing', () => {
    for (const file of kidsFiles().filter((f) => f.endsWith('.tsx'))) {
      for (const match of read(file).matchAll(/onPress=\{(?:\(\)\s*=>\s*)?(?:noop|undefined|null)\}/g)) assert.fail(`${rel(file)}: ${match[0]}`);
    }
  });
});

describe('PRIVACY: child-operational content is never logged, sent or borrowed from Talk It Out (AS)', () => {
  const code = (file) => withoutComments(read(file));
  const all = () => [...kidsFiles(), ...routeFiles()];

  test('nothing in the feature logs, reports or leaves the device with a child\'s details, notes or instructions', () => {
    for (const file of all()) assert.doesNotMatch(code(file), /\bconsole\.|\bLogger\b|analytics|track\(|Sentry|crashlytics|Share\.share|Linking\.|clipboard/i, rel(file));
  });

  test('Kids never reads an interpretation, a source artifact or a Talk It Out reading, so no raw utterance or derived title can enter it', () => {
    for (const file of all()) assert.doesNotMatch(code(file), /\binterpretations?\b|sourceArtifacts?|talkItOut|TalkItOut|utterance|readingTitle|titleForCloud/, rel(file));
  });

  test('the only durable things Kids writes are canonical rows the store already validates and syncs (no new collection, no new stored field)', () => {
    const writes = code(join(ROOT, 'src', 'features', 'kids', 'mutations.ts'));
    for (const forbidden of ['kids:', 'kidItems', 'childProfiles', 'fallbackPlans', 'emergency', 'authorization']) assert.equal(writes.includes(forbidden), false, forbidden);
  });
});
