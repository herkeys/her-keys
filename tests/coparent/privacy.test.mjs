import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { proposeInterpretation, recordArtifact } from '../../src/domain/interpretations.ts';
import { hubTextManifest, presentHub } from '../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { createHandoff, createMoneyFollowUp, createPreparation } from '../../src/features/coparent/mutations.ts';
import { DAY, FOLLOW_UP, HANDOFF, JOSIE, NOW, TZ, handoff, world } from '../fixtures/coparent/world.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANARY = 'CANARY-RAW-TALK-IT-OUT-9c41e7';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('Privacy: raw source excluded, nothing secret, nothing leaked', () => {
  test('BF: a Talk It Out reading / raw source in the household never appears in anything Feature 07 shows, and Feature 07 never touches it', () => {
    const w = world();
    handoff(w);
    const at = { nowMs: NOW, today: DAY, createId: (p) => `${p}-canary` };
    const recorded = recordArtifact(w.state, at, { kind: 'talk-it-out', origin: 'user-submitted', provider: null, contentDigest: 'd'.repeat(64), contentRef: null });
    let s = recorded.state;
    s = proposeInterpretation(s, at, { artifactId: recorded.artifact.id, proposedKind: 'task', title: CANARY });
    w.state = s;
    const artifacts = s.sourceArtifacts;
    const readings = s.interpretations;
    assert.ok(JSON.stringify(s.interpretations).includes(CANARY), 'the canary is in the household, on purpose');

    const view = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    const shown = JSON.stringify([view, hubTextManifest(presentHub(view, { today: DAY, zone: TZ }, { showAllUpcoming: true }))]);
    assert.ok(!shown.includes(CANARY), 'Feature 07 never reads or shows a reading');

    // Using every mutation leaves the reading and the artifact exactly as they were (same references).
    const a = createHandoff(w.state, w.at(), { ...HANDOFF, childId: JOSIE }, { kind: 'none' });
    const b = createPreparation(a.state, w.at(), { childId: JOSIE, title: 'x', dueDate: '', notes: '', linkEventId: null });
    const c = createMoneyFollowUp(b.state, w.at(), { ...FOLLOW_UP }, { kind: 'none' });
    assert.equal(c.state.sourceArtifacts, artifacts);
    assert.equal(c.state.interpretations, readings);
  });

  test('a mutation never persists the words of anything except the fields the user typed into the form', () => {
    const w = world();
    const id = handoff(w, { title: 'Pickup', location: 'Front desk', notes: 'Bring the blue bag' });
    const event = w.state.events.find((e) => e.id === id);
    const stored = JSON.stringify(event);
    for (const value of ['Pickup', 'Front desk', 'Bring the blue bag']) assert.ok(stored.includes(value));
    assert.deepEqual(w.state.observations.filter((o) => o.about.kind === 'event').map((o) => o.outcome), [], 'no free text is copied into observations');
    assert.ok(!JSON.stringify(w.state.observations).includes('Front desk'));
  });

  test('BG: a secret / credential scan of every file Feature 07 owns finds nothing', () => {
    const roots = ['src/features/coparent', 'tests/coparent', 'tests/fixtures/coparent', 'docs/builds', 'scripts-dev'];
    const owned = roots.flatMap((r) => walk(join(ROOT, r))).filter((f) => /coparent|HK_FEATURE_07|f07-/i.test(f) || f.includes(`${join('src', 'features', 'coparent')}`));
    owned.push(join(ROOT, 'app', '(app)', 'life', 'coparent.tsx'), join(ROOT, 'supabase', 'tests', 'journey-coparent.mjs'), join(ROOT, 'supabase', 'tests', 'run-coparent.mjs'));
    assert.ok(owned.length > 25, `scanned ${owned.length} files`);

    // The published Supabase LOCAL-DEMO anon key is public documentation, present in the repo's own harness (support/syncDevice.mjs).
    const PUBLISHED_LOCAL_DEMO_KEY = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9\.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0/g;
    const PATTERNS = {
      jwt: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
      stripe: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/,
      aws: /\bAKIA[0-9A-Z]{16}\b/,
      google: /\bAIza[0-9A-Za-z_-]{35}\b/,
      privateKey: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
      serviceRole: /service_role\s*[:=]\s*['"][^'"]{8,}/i,
      secretAssign: /\b(secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*['"][A-Za-z0-9+/_-]{12,}['"]/i,
      credentialedUrl: /https?:\/\/[^\s/:@]+:[^\s/@]+@/,
    };
    const hits = [];
    for (const file of owned) {
      const text = readFileSync(file, 'utf8').replace(PUBLISHED_LOCAL_DEMO_KEY, '<published-local-demo-key>');
      for (const [name, pattern] of Object.entries(PATTERNS)) if (pattern.test(text)) hits.push(`${relative(ROOT, file)}: ${name}`);
    }
    assert.deepEqual(hits, []);
  });

  test('the feature never writes to a log or an analytics sink, and holds no module-level copy of household data', () => {
    const files = walk(join(ROOT, 'src', 'features', 'coparent')).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /\bconsole\.\w+\(/, relative(ROOT, file));
      assert.doesNotMatch(text, /localStorage|sessionStorage|AsyncStorage|SecureStore/, relative(ROOT, file));
    }
  });
});
