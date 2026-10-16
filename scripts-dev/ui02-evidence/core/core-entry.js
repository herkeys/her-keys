// HK-FE-UI-02 core-app evidence entry (TEMPORARY copy at repo root; see ../README.md). Mounts the REAL demo-household store and the
// REAL screens/layout under inert navigation + notification stubs, because the baseline root cannot mount in Expo Go 57.0.9.
// Account, RevenueCat and Premium providers are deliberately absent: those screens are Phase 3 / not renderable here.
import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from './src/design/theme';
import { __setParams, __tabs } from 'expo-router';
import { AppStateProvider, useStoreSnapshot } from './src/store/AppStateProvider';
import { isSettled } from './src/domain/routeAccess';
import { appStore } from './src/store/appStoreInstance';
import { AccountProvider, useAccount } from './src/store/AccountProvider';
import { RevenueCatProvider } from './src/monetization/RevenueCatProvider';
import { PremiumStateProvider } from './src/monetization/PremiumStateProvider';
import { PremiumReaderBridge } from './src/features/smart-inbox/PremiumReaderBridge';
import { PremiumIntentProvider } from './src/store/PremiumIntentContext';
import { accountRuntime, premiumAppVersion, premiumLedgerClient, premiumServerClient } from './src/store/accountRuntimeInstance';
import { LocalNotificationProvider } from './src/store/LocalNotificationProvider';
import { OnboardingProvider } from './src/store/OnboardingContext';
import { OneMoveProvider } from './src/store/OneMoveContext';
import { ScheduleProvider } from './src/store/ScheduleContext';
import { TalkItOutProvider } from './src/store/TalkItOutContext';
import { Ui02Evidence, isEvidenceMode } from './src/dev/Ui02Evidence';
import AppTabsLayout from './app/(app)/_layout';
import TodayScreen from './app/(app)/today';
import CalendarScreen from './app/(app)/calendar';
import LifeIndex from './app/(app)/life/index';
import SystemsIndex from './app/(app)/systems/index';
import TalkItOut from './app/talk-it-out';
import ProfileResult from './app/onboarding/profile';
import GoalsStep from './app/onboarding/goals';
import KidsScreen from './app/(app)/life/kids';
import MoneyScreen from './app/(app)/life/money';
import MealsScreen from './app/(app)/life/meals';
import HomeScreen from './app/(app)/life/home';
import WorkScreen from './app/(app)/life/work';
import PeopleScreen from './app/(app)/life/people';
import RebuildScreen from './app/(app)/life/rebuild';
import NeedsMe from './app/(app)/life/needs-me';

__tabs.scenes = { today: TodayScreen, life: LifeIndex, calendar: CalendarScreen, systems: SystemsIndex, ai: () => <View /> };
const STANDALONE = { talk: TalkItOut, profile: ProfileResult, goals: GoalsStep, kids: KidsScreen, money: MoneyScreen, meals: MealsScreen, home: HomeScreen, work: WorkScreen, people: PeopleScreen, rebuild: RebuildScreen, needsme: NeedsMe };

const param = (url, key) => { const m = new RegExp('[?&]' + key + '=([^&#]*)').exec(url || ''); return m ? decodeURIComponent(m[1]) : undefined; };

/** The real root renders nothing until household state has loaded; so does the harness. */
function Settled({ children }) {
  const snapshot = useStoreSnapshot();
  return isSettled(snapshot.status) && snapshot.state ? children : <View />;
}

/** Mirrors PremiumStateBridge in app/_layout.tsx (signed out here, so Premium surfaces render their signed-out/unavailable states). */
function PremiumBridge({ children }) {
  const account = useAccount();
  return (
    <PremiumIntentProvider accountId={null}>
      <PremiumStateProvider client={premiumServerClient} accountState={account.state} ledger={premiumLedgerClient} appVersion={premiumAppVersion} isAccountCurrent={() => false}>
        <PremiumReaderBridge>{children}</PremiumReaderBridge>
      </PremiumStateProvider>
    </PremiumIntentProvider>
  );
}

function Host() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    Linking.getInitialURL().then((u) => setUrl(u || ''));
    const sub = Linking.addEventListener('url', (e) => setUrl(e.url));
    return () => sub.remove();
  }, []);
  if (url === null) return <View />;
  const screen = param(url, 'screen') || 'tab:today';
  __setParams({ id: param(url, 'id') });
  let body;
  if (screen === 'ui' && isEvidenceMode(param(url, 'mode'))) {
    body = <Ui02Evidence mode={param(url, 'mode')} params={{ scene: param(url, 'scene'), platform: param(url, 'platform'), stage: param(url, 'stage'), step: param(url, 'step'), state: param(url, 'state') }} />;
  } else if (screen.startsWith('tab:')) { __tabs.current = screen.slice(4); body = <AppTabsLayout />; }
  else { const C = STANDALONE[screen]; body = C ? <C /> : <Text>unknown screen {screen}</Text>; }
  // HK-FE-UI-02-DM: &scheme=dark|light seeds the appearance provider (no storage: a capture never writes the device preference)
  const scheme = param(url, 'scheme') === 'dark' ? 'dark' : 'light';
  return (
    <SafeAreaProvider>
      <AppearanceProvider initialPreference={scheme}>
      <RevenueCatProvider>
      <AppStateProvider store={appStore}>
        <Settled>
        <LocalNotificationProvider>
          <AccountProvider>
          <PremiumBridge>
          <OnboardingProvider>
            <ScheduleProvider>
              <OneMoveProvider>
                <TalkItOutProvider>{body}</TalkItOutProvider>
              </OneMoveProvider>
            </ScheduleProvider>
          </OnboardingProvider>
          </PremiumBridge>
          </AccountProvider>
        </LocalNotificationProvider>
        </Settled>
      </AppStateProvider>
      </RevenueCatProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(Host);
