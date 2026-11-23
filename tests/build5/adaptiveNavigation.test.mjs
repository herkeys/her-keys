import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { SIDEBAR_WIDTH } from '../../src/design/adaptive/sizeClass.ts';
import { appTabsScreenOptions } from '../../src/design/adaptive/appTabs.tsx';
import { darkTheme, lightTheme } from '../../src/design/theme/palettes.ts';
import { spacing } from '../../src/design/tokens.ts';
import { ratio } from '../design-system/contrastPairs.mjs';

/**
 * BUILD 5 (PR 2) — adaptive navigation and the first screens that adopt the two-pane workspace (Today, Calendar, Life, Systems).
 *
 * Source and option-level contracts under the project's react-native stub. Rendered navigation on a simulator or device, VoiceOver
 * and pointer input are NOT RUN here; see docs/build5/BUILD5_RESPONSIVE_TEST_MATRIX.md.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('BUILD 5 tab options in both presentations', () => {
  test('tab options: the sidebar is wide enough for its own leading inset (it never draws under a rail or notch)', () => {
    const options = appTabsScreenOptions({ routeName: 'today', theme: lightTheme, insets: { top: 0, right: 0, bottom: 0, left: 84 }, layout: { navigation: 'sidebar' } });
    assert.equal(options.tabBarStyle.width, SIDEBAR_WIDTH + 84);
    assert.equal(options.tabBarStyle.minWidth, SIDEBAR_WIDTH + 84);
  });

  test('sidebar labels scale with Dynamic Type; the fixed-height bottom bar keeps its documented cap', () => {
    const insets = { top: 0, right: 0, bottom: 34, left: 0 };
    assert.equal(appTabsScreenOptions({ routeName: 'today', theme: lightTheme, insets, layout: { navigation: 'sidebar' } }).tabBarAllowFontScaling, true);
    assert.equal(appTabsScreenOptions({ routeName: 'today', theme: lightTheme, insets, layout: { navigation: 'tabBar' } }).tabBarAllowFontScaling, false);
  });

  test('the bottom-bar options are byte-for-byte the pre-Build-5 options (the Android and iPhone tab bar is unchanged)', () => {
    const insets = { top: 0, right: 0, bottom: 24, left: 0 };
    const { tabBarIcon, ...options } = appTabsScreenOptions({ routeName: 'calendar', theme: lightTheme, insets, layout: { navigation: 'tabBar' } });
    const c = lightTheme.colors;
    assert.deepEqual(options, {
      headerShown: false,
      sceneStyle: { backgroundColor: c.background },
      tabBarActiveTintColor: c.accent,
      tabBarInactiveTintColor: c.textTertiary,
      tabBarLabelStyle: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
      tabBarAllowFontScaling: false,
      tabBarItemStyle: { paddingVertical: spacing.xs },
      tabBarIconStyle: { marginTop: spacing.xxs },
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.borderSubtle, height: 68 + 24, paddingTop: spacing.xs },
    });
    assert.equal(typeof tabBarIcon, 'function');
    for (const key of ['tabBarPosition', 'tabBarVariant', 'tabBarLabelPosition']) assert.equal(key in options, false, key);
  });
});

describe('BUILD 5 navigation: one navigator, two presentations, the same five destinations', () => {
  test('the tabs layout declares exactly one Tabs navigator, whose options come from the adaptive builder', () => {
    const layout = read('app/(app)/_layout.tsx');
    assert.equal((layout.match(/<Tabs[\s>]/g) ?? []).length, 1, 'one navigator: a resize changes options, never the navigator');
    assert.equal((layout.match(/<Tabs\.Screen /g) ?? []).length, 5, 'the same five destinations');
    assert.match(layout, /screenOptions=\{\(\{ route \}\) => appTabsScreenOptions\(\{ routeName: route\.name, theme, insets, layout \}\)\}/);
    assert.doesNotMatch(layout, /isPad|Platform\./, 'no device-model branch');
  });

  test('sidebar presentation: leading, horizontal labels, restrained width, 44pt rows', () => {
    const options = appTabsScreenOptions({ routeName: 'ai', theme: lightTheme, insets: { top: 0, right: 0, bottom: 0, left: 0 }, layout: { navigation: 'sidebar' } });
    assert.equal(options.tabBarPosition, 'left');
    assert.equal(options.tabBarVariant, 'uikit');
    assert.equal(options.tabBarLabelPosition, 'beside-icon');
    assert.equal(options.tabBarStyle.width, SIDEBAR_WIDTH);
    assert.ok(options.tabBarItemStyle.minHeight >= 44);
    assert.equal(options.headerShown, false);
  });

  for (const [scheme, theme] of [['light', lightTheme], ['dark', darkTheme]]) {
    test(`${scheme}: the selected sidebar destination and the resting ones meet 4.5:1 on their surfaces`, () => {
      const options = appTabsScreenOptions({ routeName: 'today', theme, insets: { top: 0, right: 0, bottom: 0, left: 0 }, layout: { navigation: 'sidebar' } });
      assert.ok(ratio(options.tabBarActiveTintColor, options.tabBarActiveBackgroundColor) >= 4.5, 'selected');
      assert.ok(ratio(options.tabBarInactiveTintColor, options.tabBarStyle.backgroundColor) >= 4.5, 'resting');
    });
  }
});

describe('BUILD 5 adoption is presentation-only', () => {
  const ADOPTED = [
    'src/features/today/TodayBriefing.tsx',
    'src/features/calendar/CalendarScreen.tsx',
    'app/(app)/life/index.tsx',
    'app/(app)/systems/index.tsx',
  ];

  test('the adopted screens use AdaptiveSplit and opt into the workspace width', () => {
    for (const path of ADOPTED) assert.match(read(path), /<AdaptiveSplit\b/, path);
    for (const path of ['app/(app)/today.tsx', 'src/features/calendar/CalendarScreen.tsx', 'app/(app)/life/index.tsx', 'app/(app)/systems/index.tsx']) {
      assert.match(read(path), /<Screen workspace>/, path);
    }
  });

  test('the adaptive module imports nothing from the store, accounts, monetization, persistence or the network', () => {
    for (const file of ['sizeClass.ts', 'useAdaptiveLayout.ts', 'AdaptiveSplit.tsx', 'appTabs.tsx', 'index.ts']) {
      const source = read(`src/design/adaptive/${file}`);
      assert.doesNotMatch(source, /from '[^']*(store|account|monetization|persistence|supabase|revenuecat|premium|sync)[^']*'/i, file);
      assert.doesNotMatch(source, /fetch\(|AsyncStorage|SecureStore/, file);
    }
  });

  test('Calendar keeps its presentation state above the split, and its projection stays inside the ready path', () => {
    const source = read('src/features/calendar/CalendarScreen.tsx');
    const ready = source.split('function ReadyCalendar')[1];
    assert.match(ready, /const \[preview, setPreview\] = useState/);
    assert.match(ready, /const contextWeek = useMemo\(\s*\(\) => \(twoPane && !week \? projectCalendarWeek/);
    assert.ok(ready.indexOf('useState<ActionPreview') < ready.indexOf('<AdaptiveSplit'), 'state is declared before (above) the split');
  });

  test('Today keeps its composition order: header, load, weather, sections, then tomorrow, momentum, Talk It Out', () => {
    const source = read('src/features/today/TodayBriefing.tsx');
    const order = ['<TodayHeader', '<LoadMeter', '<WeatherContextCard', 'view.composition.map', '<TomorrowReminderCard', '<PremiumMomentumSection', '<TalkItOutEntry'];
    const positions = order.map((token) => source.indexOf(token));
    assert.ok(positions.every((p) => p > 0), positions.join(','));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  });

  test('Systems keeps the paywall action above the split (a resize never starts a second purchase sheet)', () => {
    const source = read('app/(app)/systems/index.tsx');
    assert.ok(source.indexOf("usePaywallAction('systems_upgrade')") < source.indexOf('<AdaptiveSplit'));
  });
});
