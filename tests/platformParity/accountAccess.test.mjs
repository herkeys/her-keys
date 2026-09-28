import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { ACCOUNT_A, ACCOUNT_B, accountCloudFor, makeDevice, sessionFor } from '../support/accountDevice.mjs';
import { createFakeCloud } from '../support/fakeCloud.mjs';
import { onboardedState } from '../support/fixtures.mjs';
import { initialOnboarding } from '../../src/domain/onboarding.ts';
import { canOpenScreen, ROOT_SCREEN_GUARDS } from '../../src/domain/routeAccess.ts';
import {
  ACCOUNT_ROUTE,
  CROSS_PLATFORM_NOTE,
  accountEntryLabel,
  accountModalMode,
  showsCrossPlatformNote,
} from '../../src/features/account/accountModel.ts';

/**
 * PP-D04 — an ordinary way to Your Account, sign-out from a normally bound account, and account switching through the
 * existing quarantine rules. PP-D21 — a provider flow in flight must not close every root screen. PP-D03 — the Apple
 * cross-platform limitation is disclosed where (and only where) Apple is offered.
 *
 * Route decisions use the real `canOpenScreen`; the runtime journeys use the real AccountRuntime + sync composition
 * (`composeAccountApp`, via tests/support/accountDevice.mjs); the panel renders the real component.
 */

const { render } = await import('../support/render.tsx');
const { AccountPanel } = await import('../../src/features/account/AccountPanel.tsx');
const { AccountEntryButton } = await import('../../src/features/account/AccountEntryButton.tsx');

const read = (path) => readFileSync(path, 'utf8');
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const finished = onboardedState().onboarding;
const unfinished = initialOnboarding();
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const session = sessionFor(ACCOUNT_A);
const STATES = {
  unauthenticated: { kind: 'unauthenticated' },
  authError: { kind: 'authError', detail: 'x', recoverable: true },
  authenticating: { kind: 'authenticating' },
  authenticatedUnbound: { kind: 'authenticatedUnbound', session },
  bootstrapping: { kind: 'bootstrapping', session },
  claiming: { kind: 'claiming', session },
  accountBound: { kind: 'accountBound', session, householdId: HOUSEHOLD },
  authDegraded: { kind: 'authDegraded', accountId: ACCOUNT_A, householdId: HOUSEHOLD, reason: 'expired' },
  boundOther: { kind: 'boundOther', session: sessionFor(ACCOUNT_B), quarantinedAccountId: ACCOUNT_A },
};
const access = (account, onboarding = finished) => ({ status: 'ready', onboarding, internalTools: false, account });
const opens = (screen, account, onboarding) => canOpenScreen(screen, access(account, onboarding));

/** All text a rendered tree shows, and the accessibility labels of every pressable. */
const texts = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children);
const buttons = (tree) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').map((n) => ({
    label: n.props.accessibilityLabel,
    disabled: Boolean(n.props.disabled),
    press: () => TestRenderer.act(async () => n.props.onPress()),
  }));

async function panel(props) {
  const calls = { signIn: [], signOut: 0, close: 0 };
  const tree = await render(
    <AccountPanel
      providers={[]}
      busy={false}
      failed={false}
      onSignIn={(p) => calls.signIn.push(p)}
      onSignOut={() => calls.signOut++}
      onClose={() => calls.close++}
      {...props}
    />
  );
  return { tree, calls, texts: texts(tree), buttons: buttons(tree) };
}

describe('PP-D04 — Your Account is reachable in every ordinary account state', () => {
  test('1. an unauthenticated user can open Your Account, and Today offers "Sign in"', () => {
    assert.equal(opens('sign-in', STATES.unauthenticated), true);
    assert.equal(opens('sign-in', STATES.authError), true);
    assert.equal(accountEntryLabel(accountModalMode(STATES.unauthenticated, true)), 'Sign in');
    assert.equal(accountModalMode(STATES.unauthenticated, true), 'signIn');
  });

  test('2. an accountBound user can open Your Account, and Today offers "Your account"', () => {
    assert.equal(opens('sign-in', STATES.accountBound), true);
    assert.equal(accountModalMode(STATES.accountBound, true), 'connected');
    assert.equal(accountEntryLabel('connected'), 'Your account');
  });

  test('5. an authDegraded user reaches Reconnect, and keeps the app', () => {
    assert.equal(opens('sign-in', STATES.authDegraded), true);
    assert.equal(opens('(app)', STATES.authDegraded), true);
    assert.equal(accountModalMode(STATES.authDegraded, true), 'reconnect');
    assert.equal(accountEntryLabel('reconnect'), 'Reconnect');
  });

  test('Your Account opens before onboarding finishes too (unchanged from the old guard), without opening the app', () => {
    assert.equal(opens('sign-in', STATES.unauthenticated, unfinished), true);
    assert.equal(opens('(app)', STATES.unauthenticated, unfinished), false);
  });

  test('the entry opens the one existing route, and the modal route is the one guarded here', () => {
    assert.equal(ACCOUNT_ROUTE, '/sign-in');
    assert.equal(ROOT_SCREEN_GUARDS['sign-in'], 'account');
  });
});

describe('PP-D04 — quarantine is not weakened', () => {
  test('6. boundOther cannot open Your Account, the app, or anything but account-conflict', () => {
    for (const screen of Object.keys(ROOT_SCREEN_GUARDS)) {
      assert.equal(opens(screen, STATES.boundOther), screen === 'account-conflict', screen);
      assert.equal(opens(screen, STATES.boundOther, unfinished), screen === 'account-conflict', `${screen} (onboarding unfinished)`);
    }
    assert.equal(accountEntryLabel(accountModalMode(STATES.boundOther, true)), null, 'no entry is ever offered in quarantine');
  });

  test('6b. even rendered in quarantine, the panel offers no provider and no Sign out', async () => {
    const { buttons: b, calls } = await panel({ mode: 'quarantined', providers: ['apple', 'google'] });
    assert.deepEqual(b.map((x) => x.label), ['Not now']);
    assert.equal(calls.signOut, 0);
  });

  test('account-conflict is still the only screen that signs a quarantined device out', () => {
    assert.match(strip(read('app/account-conflict.tsx')), /<Button label="Sign out" onPress=\{\(\) => void signOut\(\)\} disabled=\{busy \|\| !quarantined\} \/>/);
    assert.equal(opens('account-conflict', STATES.accountBound), false);
    assert.equal(opens('account-conflict', STATES.unauthenticated), false);
  });
});

describe('PP-D21 — a provider flow in flight does not collapse the navigator', () => {
  test('while authenticating, Your Account and the screens she already had stay open', () => {
    assert.equal(opens('sign-in', STATES.authenticating), true, 'the modal running the flow must stay mounted');
    assert.equal(opens('(app)', STATES.authenticating), true);
    assert.equal(opens('talk-it-out', STATES.authenticating), true);
    assert.equal(opens('account-conflict', STATES.authenticating), false);
    assert.equal(opens('index', STATES.authenticating, unfinished), true);
    assert.equal(opens('(app)', STATES.authenticating, unfinished), false, 'onboarding guards are unchanged');
  });

  test('authenticating routes exactly like the signed-out state it started from', () => {
    for (const screen of Object.keys(ROOT_SCREEN_GUARDS)) {
      for (const onboarding of [finished, unfinished]) {
        assert.equal(opens(screen, STATES.authenticating, onboarding), opens(screen, STATES.unauthenticated, onboarding), screen);
      }
    }
  });

  test('resolving states keep the modal mounted but offer nothing contradictory', async () => {
    for (const kind of ['authenticating', 'authenticatedUnbound', 'bootstrapping', 'claiming']) {
      assert.equal(opens('sign-in', STATES[kind]), true, kind);
      assert.equal(accountModalMode(STATES[kind], true), 'resolving', kind);
    }
    const { buttons: b } = await panel({ mode: 'resolving', providers: ['apple', 'google'], busy: true });
    assert.deepEqual(b.map((x) => [x.label, x.disabled]), [['Not now', false]], 'no provider and no Sign out while ownership resolves');
  });
});

describe('PP-D04 — the Your Account panel', () => {
  test('3. connected: Sign out is offered and calls the supplied runtime action exactly once', async () => {
    const { buttons: b, calls, texts: t } = await panel({ mode: 'connected', providers: ['apple', 'google'] });
    assert.ok(t.some((s) => /Your account\s+is connected\./.test(s)));
    assert.deepEqual(b.map((x) => x.label), ['Sign out', 'Done']);
    await b[0].press();
    assert.equal(calls.signOut, 1);
    assert.deepEqual(calls.signIn, [], 'a connected account is never offered another sign-in');
  });

  test('sign in: every available provider is offered; a failure says so and keeps the providers', async () => {
    const { buttons: b, calls, texts: t } = await panel({ mode: 'signIn', providers: ['google'], failed: true });
    assert.deepEqual(b.map((x) => x.label), ['Continue with Google', 'Not now']);
    assert.ok(t.some((s) => s.startsWith('That did not go through.')));
    await b[0].press();
    assert.deepEqual(calls.signIn, ['google']);
  });

  test('busy disables the account actions', async () => {
    const { buttons: b } = await panel({ mode: 'connected', busy: true });
    assert.deepEqual(b.map((x) => [x.label, x.disabled]), [['Sign out', true], ['Done', true]]);
  });

  test('no customer-facing account id, token or backend term is shown in any mode', async () => {
    for (const mode of ['signIn', 'reconnect', 'connected', 'resolving', 'unavailable', 'quarantined']) {
      const { texts: t } = await panel({ mode, providers: ['apple', 'google'] });
      assert.doesNotMatch(t.join(' '), /[0-9a-f]{8}-[0-9a-f]{4}|token|supabase|session|uuid|provider|backend/i, mode);
    }
  });
});

describe('PP-D04 — sign-out and switching go through AccountRuntime', () => {
  test('4. the account surface never touches storage, sessions or Supabase; sign-out is useAccount → accountRuntime.signOut', () => {
    const files = ['app/sign-in.tsx', 'src/features/account/AccountPanel.tsx', 'src/features/account/AccountEntry.tsx', 'src/features/account/AccountEntryButton.tsx', 'src/features/account/accountModel.ts'];
    for (const file of files) {
      assert.doesNotMatch(strip(read(file)), /expo-secure-store|@supabase|SecureStore|secureStore|sessions\.|supabaseCloud|AsyncStorage|setSession|auth\.signOut/, file);
    }
    assert.match(strip(read('app/sign-in.tsx')), /const \{ state, available, busy, signIn, signOut \} = useAccount\(\);/);
    assert.match(strip(read('app/sign-in.tsx')), /onSignOut=\{\(\) => void signOut\(\)\}/);
    assert.match(read('src/store/AccountProvider.tsx'), /signOut: \(\) => run\(\(\) => accountRuntime\.signOut\(\)\)/);
  });

  test('9. logout → sign in again: a bound device signs out, keeps its household and binding, and can sign straight back in', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const device = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    const bound = await device.signIn();
    assert.equal(bound.kind, 'accountBound');
    assert.equal(opens('sign-in', bound), true);

    const out = await device.accountRuntime.signOut();
    assert.equal(out.kind, 'unauthenticated');
    assert.equal(device.store.getSnapshot().identity.binding.accountId, ACCOUNT_A, 'signing out is not leaving the account');
    assert.notEqual(device.store.getSnapshot().state, null, 'the local household is still here');
    assert.equal(await device.secure.getItem('herkeys.secure.session'), null, 'the credential is gone');
    assert.equal(opens('(app)', out), true, 'she keeps using her household locally');
    assert.equal(opens('sign-in', out), true);
    assert.equal(accountModalMode(out, true), 'signIn');

    const again = await device.signIn();
    assert.equal(again.kind, 'accountBound');
    assert.equal(again.householdId, bound.householdId, 'the same account resumes the same household');
  });

  test('10. account switch = Sign out, then Sign in as another account: the existing quarantine applies, nothing merges', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const results = [
      { kind: 'success', session: sessionFor(ACCOUNT_A) },
      { kind: 'success', session: sessionFor(ACCOUNT_B) },
    ];
    const device = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, results });
    assert.equal((await device.signIn()).kind, 'accountBound');
    assert.equal((await device.accountRuntime.signOut()).kind, 'unauthenticated');

    const other = await device.signIn();
    assert.equal(other.kind, 'boundOther');
    assert.equal(other.quarantinedAccountId, ACCOUNT_A);
    assert.equal(opens('sign-in', other), false, 'Your Account is not a way around quarantine');
    assert.equal(opens('(app)', other), false);
    assert.equal(opens('account-conflict', other), true);

    const back = await device.accountRuntime.signOut();
    assert.equal(back.kind, 'unauthenticated');
    assert.equal(device.store.getSnapshot().identity.binding.accountId, ACCOUNT_A, 'A\'s household and binding are untouched');
    assert.equal(opens('(app)', back), true);
  });
});

describe('PP-D04 — the Today entry, the same on iOS and Android', () => {
  test('7. Today renders the account entry beside its existing shell notices', () => {
    const briefing = strip(read('src/features/today/TodayBriefing.tsx'));
    assert.match(briefing, /<PersistenceNotice \/>\s*<SyncNotice \/>\s*<AccountEntry \/>\s*<\/TodayHeader>/);
    const entry = strip(read('src/features/account/AccountEntry.tsx'));
    assert.match(entry, /router\.push\(ACCOUNT_ROUTE\)/);
    assert.match(entry, /accountEntryLabel\(accountModalMode\(state, available\)\)/);
  });

  test('8. no platform input anywhere in account access', () => {
    for (const file of ['app/sign-in.tsx', 'src/features/account/AccountPanel.tsx', 'src/features/account/AccountEntry.tsx', 'src/features/account/accountModel.ts', 'src/domain/routeAccess.ts']) {
      assert.doesNotMatch(strip(read(file)), /Platform\.|\.ios\.|\.android\./, file);
    }
  });

  test('the entry button opens Your Account, and renders nothing where no entry applies', async () => {
    let opened = 0;
    const tree = await render(<AccountEntryButton label="Sign in" onOpen={() => opened++} />);
    const [button] = buttons(tree);
    assert.equal(button.label, 'Sign in');
    await button.press();
    assert.equal(opened, 1);
    const none = await render(<AccountEntryButton label={null} onOpen={() => opened++} />);
    assert.equal(none.toJSON(), null);
  });

  test('a build with no account backend shows no entry (nothing it could open would work)', () => {
    assert.equal(accountModalMode(STATES.unauthenticated, false), 'unavailable');
    assert.equal(accountEntryLabel('unavailable'), null);
  });
});

describe('PP-D03 — the Apple cross-platform limitation is disclosed where Apple is offered', () => {
  test('7. iOS (Apple offered): the provider choice carries the cross-platform note', async () => {
    const { texts: t, buttons: b } = await panel({ mode: 'signIn', providers: ['apple', 'google'] });
    assert.ok(t.includes(CROSS_PLATFORM_NOTE));
    assert.match(CROSS_PLATFORM_NOTE, /Android/);
    assert.match(CROSS_PLATFORM_NOTE, /Google/);
    assert.deepEqual(b.map((x) => x.label), ['Continue with Apple', 'Continue with Google', 'Not now']);
  });

  test('3. Android (Apple not offered): no Apple action and no note', async () => {
    const { texts: t, buttons: b } = await panel({ mode: 'signIn', providers: ['google'] });
    assert.ok(!t.includes(CROSS_PLATFORM_NOTE));
    assert.deepEqual(b.map((x) => x.label), ['Continue with Google', 'Not now']);
  });

  test('the note is not shown where she must return to the same account, or where no choice is offered', () => {
    for (const mode of ['reconnect', 'connected', 'resolving', 'unavailable', 'quarantined']) {
      assert.equal(showsCrossPlatformNote(mode, ['apple', 'google']), false, mode);
    }
    assert.equal(showsCrossPlatformNote('signIn', ['apple', 'google']), true);
    assert.equal(showsCrossPlatformNote('signIn', ['google']), false);
  });
});
