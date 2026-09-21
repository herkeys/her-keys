import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { COPY, EVIDENCE_GATED_SENTENCES, NEGATED_BOUNDARY_SENTENCES } from '../../src/features/coparent/copy.ts';
import {
  hubTextManifest,
  presentFollowUp,
  presentHub,
  presentTransitionDetail,
  presentTransitionRow,
  responsibilityActionLabel,
  availableResponsibilityActions,
} from '../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView, buildMoneyFollowUpDetail, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { DAY, NOW, TZ, showcaseWorld } from '../fixtures/coparent/world.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { today: DAY, zone: TZ };

// ---------------------------------------------------------------------------------------------------------- the rules
/** Words that state something a third party did / agreed / received / paid / verified, or that make a legal or blame claim. */
const FORBIDDEN = {
  agreement: /\bagree(d|s|ment|ments)?\b/i,
  legal: /\b(court|courts|custody|legal|lawful|law|judge|attorney|contempt|violat\w*|complian\w*|complied|comply|complies|enforc\w*|admissible|verified|verify|proof|prove[sd]?|evidence|binding)\b/i,
  arrangement: /\b(parenting (plan|order|time|schedule)|visitation|court-ordered|custody (schedule|plan|order))\b/i,
  money: /\b(owe[sd]?|owing|debt|debts|settle[sd]?|settlement|paid|payment|payments|reimburse\w*|refund\w*|invoice|arrears)\b/i,
  sharing: /\b(shar(e|ed|es|ing)|visible to|can see|sent to|both parents|access to)\b/i,
  delivery: /\b(sent|delivered|received|notified|messaged|invited|emailed|texted)\b/i,
  blame: /\b(ignored|late again|failed|refus(ed|al)|uncooperative|no-show|missed|didn't respond|never responded|unreliable)\b/i,
  score: /\b(score|scores|rating|reliab\w*|cooperat\w*|conflict|fairness|percent|streak)\b|%/i,
  alarm: /\b(urgent|critical|alert|warning|danger|risk)\b/i,
};

/** A claim that someone ANSWERED must always be worded as what she recorded (or negated). */
const ANSWER_CLAIM = /\b(accepted|acknowledged|declined|covered)\b/i;
const RECORDED_OR_NEGATED = /\b(you recorded|record that|record\b|recorded|can't|cannot|nothing|isn't|no longer|not)\b/i;

const isAllowedBoundary = (text) => NEGATED_BOUNDARY_SENTENCES.some((s) => text.includes(s)) || EVIDENCE_GATED_SENTENCES.some((s) => text.includes(s));

function stripAllowed(text) {
  let out = text;
  for (const sentence of [...NEGATED_BOUNDARY_SENTENCES, ...EVIDENCE_GATED_SENTENCES]) out = out.split(sentence).join('');
  return out;
}

function violations(strings, { allowEvidence = false } = {}) {
  const found = [];
  for (const raw of strings) {
    const text = allowEvidence ? raw : raw;
    const scanned = stripAllowed(text);
    for (const [name, pattern] of Object.entries(FORBIDDEN)) if (pattern.test(scanned)) found.push(`${name}: ${JSON.stringify(text)}`);
    if (ANSWER_CLAIM.test(scanned) && !RECORDED_OR_NEGATED.test(scanned) && scanned.trim() !== 'Covered') found.push(`answer-claim: ${JSON.stringify(text)}`);
  }
  return found;
}

// --------------------------------------------------------------------------------------- catalogue of every COPY string
const SAMPLE_ARGS = [[], ['Alex'], ['Alex', 'Fri, Sep 18'], ['80.00', 'USD'], [1, 2], [2, 3], [2, 'Friday'], [18], [2, 18], [['Friday', 'Sunday']], ['America/New_York'], ['USD'], ['Front desk']];
function catalogue(node, path = 'COPY') {
  const out = [];
  if (typeof node === 'string') out.push({ path, text: node });
  else if (typeof node === 'function') {
    for (const args of SAMPLE_ARGS) {
      try {
        const value = node(...args);
        if (typeof value === 'string' && !/undefined|NaN|\[object/.test(value)) out.push({ path: `${path}(${JSON.stringify(args)})`, text: value });
      } catch {
        // wrong argument shape for this function: try the next sample
      }
    }
  } else if (Array.isArray(node)) node.forEach((item, i) => out.push(...catalogue(item, `${path}[${i}]`)));
  else if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) out.push(...catalogue(value, `${path}.${key}`));
  return out;
}

describe('Copy-truth audit — every claim word has canonical evidence, and unsupported claims are ZERO', () => {
  test('the catalogue of every user-facing COPY string is non-trivial and every entry was evaluated', () => {
    const all = catalogue(COPY);
    assert.ok(all.length > 150, `catalogued ${all.length} strings`);
    assert.ok(all.every((e) => e.text.trim().length > 0));
  });

  test('no COPY string carries an unsupported claim (agreement, legal, custody, owed/paid/settled, sharing, sent/delivered, blame, scores, alarm)', () => {
    const strings = catalogue(COPY).map((e) => e.text);
    assert.deepEqual(violations(strings), []);
  });

  test('the ONLY sentences allowed to contain a boundary word are the listed negated ones and the evidence-gated ones', () => {
    const boundary = new RegExp(Object.values(FORBIDDEN).map((r) => r.source).join('|'), 'i');
    const holders = catalogue(COPY).filter((e) => boundary.test(e.text));
    for (const holder of holders) assert.ok(isAllowedBoundary(holder.text), `${holder.path}: ${holder.text}`);
    // ...and every listed sentence really exists in COPY (a stale whitelist entry would silently allow nothing and hide nothing).
    const texts = new Set(catalogue(COPY).map((e) => e.text));
    for (const sentence of [...NEGATED_BOUNDARY_SENTENCES, ...EVIDENCE_GATED_SENTENCES]) assert.ok(texts.has(sentence) || [...texts].some((t) => t.includes(sentence)), sentence);
  });

  test('a negated boundary sentence really is a NEGATION (it denies the claim it names)', () => {
    for (const sentence of NEGATED_BOUNDARY_SENTENCES) assert.match(sentence, /\b(isn't|doesn't|no record|not)\b/i, sentence);
  });

  test('every claim of a THIRD PARTY\'S answer is worded as what she recorded (or negated)', () => {
    const claims = catalogue(COPY).filter((e) => ANSWER_CLAIM.test(e.text));
    assert.ok(claims.length >= 8);
    for (const claim of claims) assert.match(claim.text, RECORDED_OR_NEGATED, claim.path);
  });

  test('copy that names relationship, money, sharing or completion is exactly the neutral wording the contract lists', () => {
    assert.equal(COPY.privacy.ownerOnly, 'Only your account can open this in Her Keys.');
    assert.equal(COPY.money.done, 'Marked done. Her Keys has no record of a payment.');
    assert.equal(COPY.money.amount('80.00', 'USD'), 'Amount you entered: 80.00 USD');
    assert.equal(COPY.responsibility.requested('Alex'), 'You recorded a request to Alex. No answer is recorded.');
    assert.equal(COPY.responsibility.covered('Alex'), 'Covered: you recorded that Alex accepted this and it no longer needs you.');
    assert.equal(COPY.time.past, 'This time has passed. Nothing is recorded about whether it happened.');
  });
});

describe('Copy-truth audit — the presentations the user actually sees, for a household showing every state', () => {
  const { w, ids } = showcaseWorld();
  const clock = { nowMs: NOW };
  const view = buildCoParentLogisticsView(w.state, w.state.household.id, clock);
  const hub = presentHub(view, ctx, { showAllUpcoming: true });
  const strings = hubTextManifest(hub);
  for (const t of view.transitions) {
    const detail = buildTransitionDetail(w.state, w.state.household.id, t.id, clock);
    strings.push(JSON.stringify(presentTransitionDetail(detail, ctx)));
  }
  for (const f of view.moneyFollowUps) strings.push(JSON.stringify(presentFollowUp(f, ctx)));
  const done = buildMoneyFollowUpDetail(w.state, w.state.household.id, ids.followDone, clock);
  strings.push(JSON.stringify(presentFollowUp(done.followUp, ctx)));

  test('the showcase really shows every state (guards the audit against a vacuous pass)', () => {
    const stages = new Set(view.transitions.map((t) => t.responsibility.stage));
    for (const stage of ['none_recorded', 'requested', 'acknowledged', 'accepted', 'declined']) assert.ok(stages.has(stage), stage);
    const coverage = new Set(view.transitions.map((t) => t.responsibility.coverage));
    for (const c of ['covered', 'not_covered', 'unknown', 'needs_review']) assert.ok(coverage.has(c), c);
    assert.ok(view.transitions.some((t) => t.repeat !== null));
    assert.ok(view.transitions.some((t) => t.preparation.readiness === 'needs_review'));
    assert.ok(view.transitions.some((t) => t.child.status === 'not_recorded'));
    assert.ok(hub.money.length >= 2 && hub.recentlyCompleted.length >= 2 && hub.preparation.length >= 2);
    assert.ok(hub.needsYou.length + hub.waiting.length + hub.needsReview.length >= 5);
  });

  test('zero unsupported claims in anything the hub, a handoff detail or a follow-up shows', () => {
    assert.deepEqual(violations(strings), []);
  });

  test('evidence-gated sentences ("sent", "delivered", "a payment was reported") NEVER appear without a real execution row', () => {
    const joined = strings.join('\n');
    for (const sentence of EVIDENCE_GATED_SENTENCES) assert.ok(!joined.includes(sentence), sentence);
    assert.doesNotMatch(joined, /\b(sent|delivered)\b/i);
  });

  test('no presentation contains the raw scope label, a person-name grouping, or an actor other than "you recorded"', () => {
    const joined = strings.join('\n');
    assert.doesNotMatch(joined, /coparent-shared|co-parent-shared/i);
    assert.doesNotMatch(joined, /Alex's items|Ex #|their items|Jordan's items/i);
    // Every "X accepted/acknowledged/declined" is preceded by "you recorded that".
    for (const match of joined.matchAll(/[^.\n"]*\b(accepted|acknowledged|declined)\b[^.\n"]*/gi)) {
      assert.match(match[0], /you recorded|Record that|can't count|Nothing here|no longer/i, match[0]);
    }
  });

  test('the exact location is never on the hub presentation or in its screen-reader labels — only on detail', () => {
    assert.ok(!strings.slice(0, hubTextManifest(hub).length).join('\n').includes('Elm St'));
    const detail = buildTransitionDetail(w.state, w.state.household.id, ids.requested, clock);
    assert.equal(detail.location, "Dad's place, 12 Elm St", 'the detail view carries it for the explicit reveal');
    const spoken = presentTransitionDetail(detail, ctx);
    assert.ok(!JSON.stringify(spoken).includes('Elm St'), 'even the detail presentation only says a location is recorded; the text is revealed by the UI on request');
  });

  test('every screen-reader label states child, time, responsibility/coverage and unknowns in WORDS (no state is colour-only)', () => {
    for (const row of [hub.next, ...hub.needsYou, ...hub.waiting, ...hub.needsReview, ...hub.upcoming].filter(Boolean)) {
      assert.match(row.accessibilityLabel, new RegExp(row.childName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(row.accessibilityLabel, /\d{1,2}:\d{2} (AM|PM)/);
      assert.match(row.accessibilityLabel, /recorded|Covered|Back with you|With you|responsib|Review it|no longer/i, row.accessibilityLabel);
      assert.doesNotMatch(row.accessibilityLabel, /\.\./, 'no doubled full stops');
      for (const tag of row.tags) assert.ok(row.accessibilityLabel.includes(tag.label), `tag "${tag.label}" is spoken`);
    }
    const unknownRow = hub.upcoming.find((r) => r.title === 'Thursday handoff') ?? hub.next;
    assert.match(unknownRow.accessibilityLabel, /No one is recorded as responsible|No preparation recorded/);
  });

  test('responsibility action labels never claim an outcome — they only record one', () => {
    for (const action of ['record_asked', 'acknowledged', 'accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'returned', 'reassign', 'still_needs_me', 'no_longer_needs_me']) {
      const label = responsibilityActionLabel(action, 'Alex');
      assert.deepEqual(violations([label]), [], label);
      if (/accepted|acknowledged|declined|complete/i.test(label)) assert.match(label, /^Record\b/);
    }
    assert.ok(availableResponsibilityActions(view.transitions[0].responsibility).length > 0);
  });

  test('the empty and blocked states never reassure', () => {
    const blocked = [COPY.blocked.no_child, COPY.blocked.no_category, COPY.blocked.category_archived, { title: COPY.states.emptyTitle, body: COPY.states.emptyBody }, { title: COPY.states.unrecoveredTitle, body: COPY.states.unrecoveredBody }]
      .flatMap((b) => [b.title, b.body]);
    assert.deepEqual(violations(blocked), []);
    assert.doesNotMatch(blocked.join(' '), /all caught up|all clear|everything is|no issues|no problems|you're set|coordinated|smooth/i);
  });
});

// --------------------------------------------------------------------------------------------------- source audits
const FEATURE_DIR = join(ROOT, 'src', 'features', 'coparent');
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const featureFiles = walk(FEATURE_DIR).filter((f) => /\.(ts|tsx)$/.test(f));
const routeFile = join(ROOT, 'app', '(app)', 'life', 'coparent.tsx');
const allSource = [...featureFiles, ...(statSync(routeFile, { throwIfNoEntry: false }) ? [routeFile] : [])];
const text = (file) => readFileSync(file, 'utf8');
const rel = (file) => relative(ROOT, file).replaceAll('\\', '/');
const DOMAIN_FILES = ['projection.ts', 'mutations.ts', 'identity.ts', 'time.ts', 'evidence.ts', 'present.ts', 'copy.ts', 'availability.ts', 'guard.ts', 'types.ts'].map((n) => join(FEATURE_DIR, n));

describe('Affordance and boundary audit of the feature source', () => {
  test('there are no unexplained unresolved affordances: no TODO / Coming soon / Not implemented / fake anything', () => {
    for (const file of allSource) {
      assert.doesNotMatch(text(file), /\b(TODO|FIXME|TBD|XXX|Coming soon|Not implemented|lorem ipsum)\b/i, rel(file));
      assert.doesNotMatch(text(file), /\bfake[- ](message|send|request|payment|acknowledg\w*|shar\w*|legal|custody)\b/i, rel(file));
    }
  });

  test('no control offers messaging, notifying, inviting or sharing — the feature contacts no one and shares nothing', () => {
    for (const file of allSource) {
      const source = text(file);
      assert.doesNotMatch(source, /(label|title)=(\{)?['"](Send|Message|Notify|Invite|Share|Text them|Email them|Call)\b/i, rel(file));
      assert.doesNotMatch(source, /\b(Linking\.|Share\.share|mailto:|sms:|tel:|fetch\(|XMLHttpRequest|createClient|AsyncStorage|SecureStore|expo-notifications|expo-contacts|expo-sms|expo-mail)/, rel(file));
    }
    for (const value of Object.values(COPY.actions)) {
      const label = typeof value === 'function' ? value('Alex') : value;
      assert.doesNotMatch(label, /^(Send|Message|Notify|Invite|Share|Text|Email|Call)\b/i, label);
    }
  });

  test('nothing is logged or sent to analytics: no console, no analytics, no tracking calls', () => {
    for (const file of allSource) assert.doesNotMatch(text(file), /\b(console\.(log|info|warn|error|debug)|analytics|logEvent|trackEvent|Sentry|crashlytics|posthog|amplitude)\b/i, rel(file));
  });

  test('the domain layers are pure: no React, no React Native, no Expo, no store or platform imports beyond types', () => {
    for (const file of DOMAIN_FILES) {
      const imports = [...text(file).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        assert.doesNotMatch(spec, /^(react|react-native|expo|expo-)/, `${rel(file)} imports ${spec}`);
        assert.doesNotMatch(spec, /\.\.\/\.\.\/(store|platform|monetization)\b/, `${rel(file)} imports ${spec}`);
      }
      // `clock.deviceTimeZone` is DATA passed in (used only to say "times are shown in your household zone"); what is forbidden is
      // importing or CALLING the device-zone API from a domain layer: only the container may read the device.
      assert.doesNotMatch(text(file), /import[^;]*\bdeviceTimeZone\b|\bdeviceTimeZone\(/, `${rel(file)}: only the container may read the device zone, and only for the zone note`);
      assert.doesNotMatch(text(file), /\b(Date\.now|new Date\(\))/, `${rel(file)}: the clock is always passed in`);
    }
  });

  test('BE: no sibling-feature import — every relative import stays in this feature, the domain, the design system, the store or the state', () => {
    const allowed = ['src/features/coparent/', 'src/domain/', 'src/design/', 'src/store/', 'src/state/'];
    for (const file of allSource) {
      for (const match of text(file).matchAll(/from '(\.\.?\/[^']+)'/g)) {
        const target = rel(resolve(dirname(file), match[1]) + '/');
        assert.ok(allowed.some((prefix) => target.startsWith(prefix)), `${rel(file)} imports ${match[1]} → ${target}`);
      }
      assert.doesNotMatch(text(file), /feature\/0[568]|src\/features\/(kids|home|meals|today|calendar|life|systems|money|work|daily-load|one-move|talk-it-out|tasks|onboarding)/, rel(file));
    }
  });

  test('presentation uses design tokens only — no hard-coded colours in the feature UI', () => {
    for (const file of featureFiles.filter((f) => f.endsWith('.tsx'))) assert.doesNotMatch(text(file), /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, rel(file));
  });

  test('no prose is composed in JSX: no multi-word literal labels or text nodes outside COPY / presentation', () => {
    for (const file of featureFiles.filter((f) => f.endsWith('.tsx'))) {
      const source = text(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.doesNotMatch(source, /\b(label|accessibilityLabel|title|placeholder|body)="[^"{}]*[A-Za-z]{3,}[^"{}]* [^"{}]*"/, `${rel(file)}: a literal multi-word attribute`);
      assert.doesNotMatch(source, />\s*[A-Z][a-z]+(?: [A-Za-z']+){1,}[.!?]?\s*<\//, `${rel(file)}: a literal text node`);
    }
  });

  test('the hub surfaces never read a location', () => {
    for (const name of ['HubView.tsx', 'TransitionRow.tsx', 'HubContainer.tsx']) {
      const file = join(FEATURE_DIR, 'ui', name);
      if (!statSync(file, { throwIfNoEntry: false })) continue;
      assert.doesNotMatch(text(file), /\.location\b|hasLocation/, `${name} must not print or branch on an exact location`);
    }
  });

  test('exactly ONE route file was added, and no shared layout or Life index was touched', () => {
    const lifeRoutes = readdirSync(join(ROOT, 'app', '(app)', 'life'));
    assert.ok(lifeRoutes.includes('coparent.tsx'));
    for (const name of ['_layout.tsx', 'index.tsx']) assert.doesNotMatch(text(join(ROOT, 'app', '(app)', 'life', name)), /coparent/i, `${name} must not register the route (HK-INT-WAVE2-LIFE-REGISTRATION)`);
  });
});
