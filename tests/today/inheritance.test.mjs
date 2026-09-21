/**
 * TODAY — the inherited Today: what was PRESERVED, and regressions for what was wrong in it.
 *
 * Addendum §D/§E: existing certified Today behavior must not disappear because a composition is cleaner, and a
 * replaced guarantee needs a test that keeps it. These read the inherited components' source (the honest scope for
 * components that need a live store to render), as tests/build3Audit.capture.test.mjs does for other screens.
 *
 * The defects (TODAY-PD-xxx, see the ledger §7) are pinned so they cannot return:
 *   PD-001  "Handled by Her Keys" labelled a list of DECISIONS (an approval is not an execution)
 *   PD-002  the ledger's times used the DEVICE's timezone, not the household's
 *   PD-003  a component read the system clock (`Date.now()`), and an always-on "Tomorrow" card said nothing
 *   PD-004  filler cards ("Nothing needs moving", "Nothing scheduled today", "Nothing entered yet") were the card's job
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { describeDayState } from '../../src/features/today/dayState.ts';
import { describeLoad } from '../../src/features/daily-load/describeLoad.ts';

const source = (path) => readFileSync(path, 'utf8');
const todayFiles = () => readdirSync('src/features/today').filter((f) => f.endsWith('.tsx'));

describe('PRESERVE — the certified decision card keeps every action and guard', () => {
  const card = source('src/features/daily-load/DailyLoadCard.tsx');

  test('every recommendation action is still wired to its existing mutation', () => {
    for (const call of ['moveEvent(', 'dropTask(', 'shortenTask(', 'keepCapacity', 'protectItem(', 'moveRecommendedTask', 'keepAsPlanned', 'showNextCandidate']) {
      assert.ok(card.includes(call), call);
    }
    assert.match(card, /canShortenTask\(/);
  });

  test('every action label is unchanged', () => {
    for (const label of ['Move it to tomorrow', 'Keep today as planned', 'Protect it', 'Shorten it', 'Drop it', 'Keep as planned', 'Show another option', 'Got it']) {
      assert.ok(card.includes(`label="${label}"`), label);
    }
  });

  test('a save that fails still says nothing changed, and a second tap in the same frame cannot double-run an action', () => {
    assert.match(card, /Her Keys couldn’t save that yet\. Nothing changed — try again\./);
    assert.match(card, /inFlight\.current/);
  });

  test('the two day-state sentences the Build 3 audit certified are byte-identical', () => {
    // (the full matrix is tests/dailyLoad*.test.mjs and build3Audit.dailyLoad.test.mjs — untouched)
    const balanced = { status: 'balanced', bufferMinutes: 60, requiredBufferMinutes: 45, gap: null, candidates: [] };
    assert.equal(describeDayState(balanced, 'moved'), 'One change made. Today has room now.');
    assert.equal(describeDayState(balanced, 'kept'), 'Today stays as you planned it.');
    assert.equal(typeof describeLoad, 'function');
  });
});

describe('PRESERVE — One Move keeps its four presentations and its one gesture', () => {
  const card = source('src/features/one-move/OneMoveCard.tsx');
  test('the certified copy and the “I did it” gesture survive; no gesture without a domain mutation was added', () => {
    assert.match(card, /actionLabel="I did it"/);
    assert.match(card, /Done\. That’s enough for today\./);
    assert.match(card, /Her Keys won’t ask for anything else\./);
    assert.match(card, /Today is already full, so Her Keys isn’t adding anything\./);
    assert.doesNotMatch(card, /onNotToday|onShowAlternative|Not today|Show another option/, 'MP-02: no such mutation exists');
  });
});

describe('PRESERVE — the shell and the providers', () => {
  test('the five tabs are the same, in the same order: Today is still the first tab, and no route was added', () => {
    const layout = source('app/(app)/_layout.tsx');
    const names = [...layout.matchAll(/Tabs\.Screen name="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['today', 'life', 'calendar', 'systems', 'ai']);
    const root = source('app/_layout.tsx');
    for (const provider of ['ScheduleProvider', 'OneMoveProvider', 'TalkItOutProvider', 'OnboardingProvider']) assert.match(root, new RegExp(`<${provider}>`));
  });

  test('the shell’s own notices stay where they were, and the talk-it-out entry is unchanged', () => {
    const briefing = source('src/features/today/TodayBriefing.tsx');
    assert.match(briefing, /<PersistenceNotice \/>/);
    assert.match(briefing, /<SyncNotice \/>/);
    assert.match(briefing, /<TalkItOutEntry \/>/);
    assert.match(source('src/features/talk-it-out/TalkItOutEntry.tsx'), /router\.push\('\/talk-it-out'\)/);
  });
});

describe('PD-001 — a list of decisions is not "handled by Her Keys"', () => {
  test('the ledger of approvals is labelled as her decisions; “Handled by Her Keys” exists only where an execution and an outcome do', () => {
    const ledger = source('src/features/today/HandledLedger.tsx');
    assert.match(ledger, /title="Changes you approved"/);
    assert.doesNotMatch(ledger.replace(/\/\*[\s\S]*?\*\//g, ''), /Handled by Her Keys/);
    assert.ok(ledger.includes('approved by you'), 'each row still says whose decision it was');
    const holders = todayFiles().filter((f) => /Handled by Her Keys/.test(source(`src/features/today/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.deepEqual(holders, ['TodayHandled.tsx']);
  });

  test('the ledger keeps every row and its Undo', () => {
    const ledger = source('src/features/today/HandledLedger.tsx');
    for (const call of ['undoMove', 'undoableMoveId', 'moveWasUndone', 'label="Undo"']) assert.ok(ledger.includes(call), call);
  });
});

describe('PD-002 — times are the household’s, never the device’s', () => {
  test('no Today component formats a time or a date with the device’s locale or zone', () => {
    for (const f of todayFiles()) assert.doesNotMatch(source(`src/features/today/${f}`), /toLocaleTimeString|toLocaleDateString|toLocaleString|getTimezoneOffset|new Date\(/, f);
    assert.match(source('src/features/today/HandledLedger.tsx'), /wallClockMinutesAt\(epochMsOf\(createdAt\), timeZone\)/);
  });
});

describe('PD-003 — no component reads the clock, and there is no always-on “Tomorrow” box', () => {
  test('the only place the system clock is read on the Today screen is useTodayView', () => {
    for (const f of todayFiles()) assert.doesNotMatch(source(`src/features/today/${f}`), /Date\.now\(|performance\.now\(/, f);
    assert.match(source('src/features/today/useTodayView.ts'), /Date\.now\(\)/);
    for (const file of ['src/features/one-move/OneMoveCard.tsx', 'src/features/daily-load/LoadMeter.tsx', 'src/features/life/LifeStatusSummary.tsx']) assert.doesNotMatch(source(file), /Date\.now\(/, file);
  });

  test('the replaced component is gone, and Today’s route is the only Today route', () => {
    assert.equal(readdirSync('src/features/today').includes('TomorrowPreview.tsx'), false);
    const routes = readdirSync('app/(app)');
    assert.deepEqual(routes.filter((f) => /today/i.test(f)), ['today.tsx']);
  });
});

describe('PD-004 — filler is not the decision card’s job, and an empty day is not dressed up', () => {
  test('the card no longer manufactures "nothing needs moving", "nothing scheduled" or "nothing entered" content', () => {
    const card = source('src/features/daily-load/DailyLoadCard.tsx');
    for (const filler of ['Nothing needs moving', 'Your commitments have room between them', 'Nothing scheduled today', 'Nothing entered yet', 'found nothing that needs changing']) {
      assert.equal(card.includes(filler), false, filler);
    }
  });

  test('the meter is not rendered over an empty calendar, and Today says “nothing entered” once, from the view model', () => {
    const meter = source('src/features/daily-load/LoadMeter.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(meter, /useSchedule|describeLoad/,'the estimate arrives from the projection, which withholds it without commitments');
    assert.equal(source('src/features/today/TodayStateNotice.tsx').includes('Nothing entered yet.'), true);
  });
});
