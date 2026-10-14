import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';

/**
 * IOS-D04: a text field must never be left behind the iOS keyboard.
 *
 * Android resizes the window for the keyboard (adjustResize), so a ScrollView simply shrinks. iOS does not: the keyboard is drawn
 * over the app, and a ScrollView that is not told about it leaves lower fields (and the Save button of a bottom sheet) hidden
 * behind it. React Native's iOS-only `automaticallyAdjustKeyboardInsets` adds the overlap as a bottom inset and scrolls the focused
 * field into view. It is not in Android's native view config, so setting it cannot change Android.
 *
 * This is a SOURCE guard (no simulator or device was available to the audit); the on-device check stays registry item RT-18.
 */

const files = ['app', 'src']
  .flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`))
  // The design gallery and dev tools exist only in demo mode, which no EAS profile enables (all set EXPO_PUBLIC_HERKEYS_DATA_MODE=empty).
  .filter((f) => f.endsWith('.tsx') && f !== 'app/gallery.tsx' && f !== 'app/dev-tools.tsx');
const read = (file) => readFileSync(file, 'utf8');
const hasInput = (source) => /<TextField\b|<TextInput\b/.test(source);
const scrollViewTags = (source) => [...source.matchAll(/<ScrollView\b[^>]*>/g)].map((m) => m[0]);

/**
 * Sheets (and one page) that host a text field but have NO ScrollView at all, so there is nothing for the keyboard inset to act on.
 * Adding a ScrollView there changes the layout on both platforms, so it is a shared-file change and is registered, not repaired,
 * by the iOS audit. This list may only shrink: a new entry fails the test, and a fixed one must be removed.
 */
const KNOWN_UNSCROLLED_INPUT_HOSTS = {
  // SH-04 (the capture "Fix" sheet) was repaired by SC-06 (scrollable, keyboard-aware, Apply pinned) and removed from this list.
};

describe('IOS-D04 every ScrollView that hosts a text field is keyboard-inset aware on iOS', () => {
  const hosts = files.filter((f) => hasInput(read(f)) && scrollViewTags(read(f)).length > 0 && !/KeyboardAvoidingView/.test(read(f)));

  test('there are input-hosting scroll views to guard (the scan is not vacuous)', () => {
    assert.ok(hosts.length >= 5, `found ${hosts.length}`);
  });

  for (const file of hosts) {
    test(`${file}: every <ScrollView> sets automaticallyAdjustKeyboardInsets`, () => {
      for (const tag of scrollViewTags(read(file))) assert.match(tag, /\bautomaticallyAdjustKeyboardInsets\b/, tag);
    });
  }

  test('the shared Screen scroll container (the page-level editors) is keyboard-inset aware', () => {
    assert.match(scrollViewTags(read('src/design/components/Screen.tsx'))[0] ?? '', /\bautomaticallyAdjustKeyboardInsets\b/);
  });

  test('a ScrollView that hosts a text field and uses KeyboardAvoidingView is not double-adjusted by the guard', () => {
    // TalkItOutView, SystemEditor and the welcome views avoid the keyboard with KeyboardAvoidingView (registry PC-05/06/07/08).
    for (const file of files.filter((f) => hasInput(read(f)) && /KeyboardAvoidingView/.test(read(f)))) {
      assert.ok(scrollViewTags(read(file)).every((tag) => !/automaticallyAdjustKeyboardInsets/.test(tag)), file);
    }
  });
});

describe('IOS-D04 text-field hosts with no scroll container are a registered shared gap', () => {
  test('the set of unscrolled input hosts is exactly the registered one', () => {
    const unscrolled = files
      .filter((f) => hasInput(read(f)) && scrollViewTags(read(f)).length === 0 && /<Sheet\b/.test(read(f)))
      .sort();
    assert.deepEqual(unscrolled, Object.keys(KNOWN_UNSCROLLED_INPUT_HOSTS).sort());
  });
});

describe('IOS-D04 the prop is iOS-only in the installed React Native, so Android is unaffected', () => {
  test("it is in the iOS branch of RCTScrollView's native view config and not in Android's", () => {
    const source = readFileSync('node_modules/react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent.js', 'utf8');
    const [, android, ios] = source.split("uiViewClassName: 'RCTScrollView'");
    assert.ok(android && ios, 'both branches found');
    assert.doesNotMatch(android, /automaticallyAdjustKeyboardInsets/);
    assert.match(ios, /automaticallyAdjustKeyboardInsets/);
  });

  test('the shared source never branches on Platform to do it (no new registry conditional)', () => {
    for (const file of ['src/design/components/Screen.tsx']) assert.doesNotMatch(read(file), /Platform\./);
  });
});
