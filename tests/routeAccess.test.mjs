import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { initialOnboarding, recordOnboardingStep, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { INITIAL_ACCOUNT_STATE } from '../src/domain/account/authState.ts';
import { canOpenScreen, isRoutingSettled, ROOT_SCREEN_GUARDS, rootScreenForPath } from '../src/domain/routeAccess.ts';
import { demoState, onboardedState } from './support/fixtures.mjs';
import { HELD_ACCOUNT } from './support/store.mjs';

const PROTECTED_LINKS = ['/today', '/life', '/life/kids', '/calendar', '/systems', '/ai', '/talk-it-out'];
const ONBOARDING_LINKS = ['/onboarding/goals', '/onboarding/strengths', '/onboarding/struggles', '/onboarding/talk-it-out', '/onboarding/profile', '/onboarding/plus'];
const SCREENS = Object.keys(ROOT_SCREEN_GUARDS);
const unfinished = initialOnboarding();
const finished = onboardedState().onboarding;

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const session = HELD_ACCOUNT.session;
const degraded = { kind: 'authDegraded', accountId: ACCOUNT_A, householdId: HOUSEHOLD, reason: 'refreshFailed' };
const quarantined = { kind: 'boundOther', session, quarantinedAccountId: '44444444-4444-4444-8444-444444444444' };

/** Every state in which nobody yet holds this household under an account. */
const WITHOUT_AN_ACCOUNT = {
  unauthenticated: INITIAL_ACCOUNT_STATE,
  authenticating: { kind: 'authenticating' },
  authError: { kind: 'authError', detail: 'x', recoverable: true },
  authenticatedUnbound: { kind: 'authenticatedUnbound', session },
  bootstrapping: { kind: 'bootstrapping', session },
  claiming: { kind: 'claiming', session },
};

/** A household held under an account, by default: the only state the audit and the app open for. */
const access = (onboarding, { status = 'ready', internalTools = false, account = HELD_ACCOUNT, accountSettled = true } = {}) => ({
  status,
  onboarding,
  internalTools,
  account,
  accountSettled,
});
const opens = (path, input) => canOpenScreen(rootScreenForPath(path), input);
const open = (input) => SCREENS.filter((screen) => canOpenScreen(screen, input));
/** Code, not prose: a comment may name a forbidden thing to say why it is absent. */
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('Route access', () => {
  test('until state has loaded, nothing opens — protected or not', () => {
    for (const status of ['unhydrated', 'hydrating']) {
      for (const onboarding of [unfinished, finished, null]) {
        for (const screen of SCREENS) assert.equal(canOpenScreen(screen, access(onboarding, { status, internalTools: true })), false, `${status} ${screen}`);
      }
    }
  });

  test('SESSION RESTORE: until the stored session is resolved nothing opens — not Welcome, not the audit, not the app', () => {
    // Before the restore answers, `account` is only the runtime's starting value (signed out). Routing on it would show
    // Welcome to a returning account for as long as the restore takes.
    for (const account of [INITIAL_ACCOUNT_STATE, HELD_ACCOUNT, degraded, quarantined]) {
      for (const onboarding of [unfinished, finished]) {
        assert.deepEqual(open(access(onboarding, { account, accountSettled: false, internalTools: true })), [], `${account.kind}`);
      }
    }
    assert.equal(isRoutingSettled({ status: 'ready', accountSettled: false }), false);
    assert.equal(isRoutingSettled({ status: 'hydrating', accountSettled: true }), false);
    assert.equal(isRoutingSettled({ status: 'ready', accountSettled: true }), true);
    assert.equal(isRoutingSettled({ status: 'recovery', accountSettled: true }), true);
  });

  test('WELCOME REQUIRES AUTH BEFORE THE AUDIT: without an account, the welcome tree is the only screen — whatever onboarding says', () => {
    for (const [kind, account] of Object.entries(WITHOUT_AN_ACCOUNT)) {
      for (const onboarding of [unfinished, finished]) {
        assert.deepEqual(open(access(onboarding, { account })), ['index'], `${kind}: the entry and nothing else`);
      }
    }
  });

  test('SIGNED-OUT ONBOARDING GUARD: a deep link into the audit, or the app, is refused for a signed-out device', () => {
    // Even with every choice made, so that no onboarding rule is what refuses the link.
    let state = toggleOnboardingOption(demoState(), 'goals', 'calmer-household');
    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = recordOnboardingStep(toggleOnboardingOption(state, 'struggles', 'overcommitting'), 'plus');

    for (const [kind, account] of Object.entries(WITHOUT_AN_ACCOUNT)) {
      for (const path of ONBOARDING_LINKS) assert.equal(opens(path, access(state.onboarding, { account })), false, `${kind} ${path}`);
      for (const path of [...PROTECTED_LINKS, '/sign-in']) assert.equal(opens(path, access(finished, { account })), false, `${kind} ${path}`);
      assert.equal(opens('/', access(state.onboarding, { account })), true, `${kind}: the link falls back to the welcome tree`);
    }
    // The same links open for the same household once an account holds it.
    for (const path of ONBOARDING_LINKS) assert.equal(opens(path, access(state.onboarding)), true, path);
  });

  test('a signed-in session is not yet a held household: nothing account-held opens while ownership is still being decided', () => {
    // `authenticatedUnbound` is the instant after ANY sign-in — including another account's on a device already bound to
    // someone. Opening the app then would put that household on screen for the frame before quarantine is declared.
    for (const kind of ['authenticatedUnbound', 'bootstrapping', 'claiming']) {
      const input = access(finished, { account: WITHOUT_AN_ACCOUNT[kind] });
      for (const path of PROTECTED_LINKS) assert.equal(opens(path, input), false, `${kind} ${path}`);
    }
  });

  test('with onboarding unfinished, a held household is handed on to the audit and every app link is refused', () => {
    for (const path of PROTECTED_LINKS) assert.equal(opens(path, access(unfinished)), false, path);
    assert.equal(opens('/', access(unfinished)), true, 'the entry stays open: it is where she is handed on to the step she had reached');
    assert.equal(opens('/onboarding/goals', access(unfinished)), true);
  });

  test('RETURNING USER BYPASS: with onboarding finished, a held household opens the app — and neither Welcome nor the audit', () => {
    for (const path of PROTECTED_LINKS) assert.equal(opens(path, access(finished)), true, path);
    for (const screen of SCREENS.filter((s) => s === 'index' || s.startsWith('onboarding/'))) {
      assert.equal(canOpenScreen(screen, access(finished)), false, screen);
    }
  });

  test('recovery routes exactly like ready', () => {
    for (const onboarding of [unfinished, finished]) {
      for (const account of [HELD_ACCOUNT, INITIAL_ACCOUNT_STATE]) {
        for (const screen of SCREENS) {
          assert.equal(
            canOpenScreen(screen, access(onboarding, { status: 'recovery', account })),
            canOpenScreen(screen, access(onboarding, { account })),
            `${account.kind} ${screen}`
          );
        }
      }
    }
  });

  test('AUTH DEGRADED: a bound account whose credential lapsed keeps its household locally and can reach Your Account to reconnect', () => {
    assert.equal(canOpenScreen('sign-in', access(finished, { account: degraded })), true);
    assert.equal(canOpenScreen('(app)', access(finished, { account: degraded })), true);
    assert.equal(canOpenScreen('index', access(finished, { account: degraded })), false, 'a degraded account is not sent back to Welcome');
    // ...and part-way through the audit she carries on with it, rather than being asked to start over.
    assert.equal(canOpenScreen('onboarding/goals', access(unfinished, { account: degraded })), true);
    assert.equal(canOpenScreen('(app)', access(unfinished, { account: degraded })), false);
    assert.deepEqual(open(access(finished, { account: degraded })), open(access(finished)), 'degraded routes exactly like bound');
  });

  test('PP-D04: a normally bound account can open Your Account (sign-in) to sign out; quarantine still opens only the conflict screen', () => {
    assert.equal(canOpenScreen('sign-in', access(finished)), true);
    assert.equal(canOpenScreen('(app)', access(finished)), true);
    for (const onboarding of [finished, unfinished]) {
      for (const internalTools of [false, true]) {
        assert.deepEqual(open(access(onboarding, { account: quarantined, internalTools })), ['account-conflict']);
      }
    }
    assert.equal(opens('/sign-in', access(finished, { account: quarantined })), false, 'a deep link to sign-in cannot escape quarantine');
    assert.equal(opens('/', access(finished, { account: quarantined })), false, 'nor can a link to the entry: no welcome tree, no audit');
    for (const path of ONBOARDING_LINKS) assert.equal(opens(path, access(unfinished, { account: quarantined })), false, path);
    assert.equal(canOpenScreen('account-conflict', access(finished)), false, 'the conflict screen is for quarantine alone');
    assert.equal(canOpenScreen('account-conflict', access(finished, { account: INITIAL_ACCOUNT_STATE })), false);
  });

  test('PP-D21: a sign-in in flight keeps the screen it is running on (the root stack never empties mid sign-in)', () => {
    const inFlight = { kind: 'authenticating' };
    for (const onboarding of [finished, unfinished]) {
      const during = open(access(onboarding, { account: inFlight }));
      assert.ok(during.includes('index'), 'the entry running the flow stays mounted');
      assert.deepEqual(during, open(access(onboarding, { account: INITIAL_ACCOUNT_STATE })), 'routes exactly like the signed-out state it started from');
    }
    assert.equal(canOpenScreen('index', access(finished, { status: 'hydrating', account: inFlight })), false, 'hydration still gates everything');
    // A reconnect never enters `authenticating`: the account stays degraded, so the modal it runs on stays open too.
    assert.equal(canOpenScreen('sign-in', access(finished, { account: degraded })), true);
  });

  test('a link cannot skip past an onboarding choice', () => {
    let state = demoState();
    const step = (screen) => canOpenScreen(screen, access(state.onboarding));
    assert.deepEqual(['onboarding/strengths', 'onboarding/struggles', 'onboarding/profile'].map(step), [false, false, false]);

    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    assert.deepEqual(['onboarding/strengths', 'onboarding/struggles'].map(step), [true, false]);

    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
    assert.deepEqual(['onboarding/talk-it-out', 'onboarding/profile'].map(step), [true, true]);
  });

  test('internal tools open only in internal builds, independent of onboarding and of the account', () => {
    for (const onboarding of [unfinished, finished]) {
      for (const account of [HELD_ACCOUNT, INITIAL_ACCOUNT_STATE]) {
        for (const screen of ['dev-tools', 'gallery']) {
          assert.equal(canOpenScreen(screen, access(onboarding, { account })), false, `${screen} ${account.kind}`);
          assert.equal(canOpenScreen(screen, access(onboarding, { account, internalTools: true })), true, `${screen} ${account.kind}`);
        }
      }
    }
  });

  test('NO GUEST PATH: in a release build, no state opens the audit or the app without a held household', () => {
    const accountHeld = new Set(['(app)', 'talk-it-out', 'event-editor', 'task-editor', 'opportunity-editor', 'sign-in', ...SCREENS.filter((s) => s.startsWith('onboarding/'))]);
    let state = toggleOnboardingOption(demoState(), 'goals', 'calmer-household');
    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = recordOnboardingStep(toggleOnboardingOption(state, 'struggles', 'overcommitting'), 'plus');
    for (const account of [...Object.values(WITHOUT_AN_ACCOUNT), quarantined]) {
      for (const onboarding of [unfinished, state.onboarding, finished]) {
        for (const status of ['ready', 'recovery']) {
          const reached = open(access(onboarding, { account, status })).filter((screen) => accountHeld.has(screen));
          assert.deepEqual(reached, [], `${account.kind}`);
        }
      }
    }
  });

  test('NO "WELCOME SEEN" PERSISTENCE: whether Welcome shows is derived from account, hydration and onboarding state alone', () => {
    const flag = /hasSeenWelcome|welcomeSeen|welcomeComplete|welcomeTreeComplete|authIntroSeen|seenWelcome|introSeen/i;
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(`${dir}/${entry.name}`) : /\.(ts|tsx)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []
      );
    for (const file of [...walk('src'), ...walk('app')]) assert.doesNotMatch(strip(readFileSync(file, 'utf8')), flag, file);
    // The route input carries those three facts and no fourth.
    const source = readFileSync('src/domain/routeAccess.ts', 'utf8');
    const fields = /export interface RouteAccessInput \{([\s\S]*?)\n\}/.exec(source)[1].match(/^\s{2}(\w+)[?]?:/gm).map((line) => line.trim().replace(/[?:]/g, ''));
    assert.deepEqual(fields.sort(), ['account', 'accountSettled', 'internalTools', 'onboarding', 'status']);
  });

  test('links resolve to the root screen whose guard applies', () => {
    const table = {
      '/': 'index',
      '/today': '(app)',
      '/life/kids': '(app)',
      '/ai': '(app)',
      '/talk-it-out': 'talk-it-out',
      '/talk-it-out?from=today': 'talk-it-out',
      '/onboarding/profile': 'onboarding/profile',
      '/onboarding/unknown': null,
      '/dev-tools': 'dev-tools',
      '/somewhere-else': null,
    };
    for (const [path, screen] of Object.entries(table)) assert.equal(rootScreenForPath(path), screen, path);
  });

  test('every root route is in the guard table, and the root layout wraps each one in its own guard', () => {
    const fileRoutes = [
      // `_layout` and Expo Router's `+` special files (e.g. `+native-intent`) are not routes.
      ...readdirSync('app').filter((name) => name.endsWith('.tsx') && !name.startsWith('_') && !name.startsWith('+')).map((name) => name.replace(/\.tsx$/, '')),
      ...readdirSync('app').filter((name) => /^\(.+\)$/.test(name)),
      ...readdirSync('app/onboarding').map((name) => `onboarding/${name.replace(/\.tsx$/, '')}`),
    ];
    assert.deepEqual(fileRoutes.sort(), [...SCREENS].sort());

    const layout = readFileSync('app/_layout.tsx', 'utf8');
    const escape = (text) => text.replace(/[()]/g, '\\$&');
    for (const screen of SCREENS) {
      assert.match(layout, new RegExp(`guard=\\{allow\\('${escape(screen)}'\\)\\}>\\s*<Stack\\.Screen name="${escape(screen)}"`), screen);
    }
    assert.equal((layout.match(/<Stack\.Screen /g) ?? []).length, SCREENS.length, 'no unguarded root screens');
  });

  test('the root stack never names a guarded screen as its fixed initial route', () => {
    // A fixed initialRouteName breaks every launch where that screen's guard is closed.
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    assert.doesNotMatch(layout, /initialRouteName="/);
    assert.match(layout, /initialRouteName=\{allow\('index'\) \? 'index' : undefined\}/);
  });

  test('ONE ROUTING AUTHORITY: no navigator mounts before the account settles, and the screens add no auth redirects of their own', () => {
    const layout = strip(readFileSync('app/_layout.tsx', 'utf8'));
    // The settling presentation is returned BEFORE the navigator is built, so nothing routable exists while the restore runs.
    const settling = layout.indexOf('if (!account.settled) return <WelcomeAuthSettling />;');
    assert.ok(settling > 0, 'the root shows the settling presentation while the account is unresolved');
    assert.ok(settling < layout.indexOf('<Stack'), 'and it does so before any navigator exists');
    assert.ok(layout.indexOf('if (!settled || !snapshot.state) return null;') < settling, 'hydration is still decided first');
    assert.match(layout, /accountSettled: account\.settled/);

    // Onboarding screens stay the sequential chain they were: none of them learned about accounts.
    for (const name of readdirSync('app/onboarding')) {
      assert.doesNotMatch(strip(readFileSync(`app/onboarding/${name}`, 'utf8')), /useAccount|AccountProvider|authState|<Redirect/, name);
    }
    // The entry decides WHAT to show from account state; whether it may be shown at all is the guard table's.
    const entry = strip(readFileSync('app/index.tsx', 'utf8'));
    assert.match(entry, /canRenderAccountData\(account\.state\) \? <ContinueAudit \/> : <WelcomeAuthFlow mode="first-run" \/>/);
    assert.doesNotMatch(entry, /router\.(push|replace|navigate)|recordStep\('goals'\)/, 'no Begin → onboarding/goals path survives for a signed-out user');
  });
});
