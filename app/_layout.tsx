import { SplashScreen, Stack } from 'expo-router';
import * as NativeSplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/design/tokens';
import { canOpenScreen, isSettled, type RootScreen } from '../src/domain/routeAccess';
import { WelcomeAuthSettling } from '../src/features/account/WelcomeAuthFlow';
import { ConsentGate } from '../src/features/consent/ConsentFlow';
import { RevenueCatProvider, useEntitlement } from '../src/monetization/RevenueCatProvider';
import { AccountProvider, useAccount } from '../src/store/AccountProvider';
import { AppStateProvider, useStoreSnapshot } from '../src/store/AppStateProvider';
import { appStore, internalTools } from '../src/store/appStoreInstance';
import { OnboardingProvider } from '../src/store/OnboardingContext';
import { OneMoveProvider } from '../src/store/OneMoveContext';
import { LocalNotificationProvider } from '../src/store/LocalNotificationProvider';
import { ScheduleProvider } from '../src/store/ScheduleContext';
import { TalkItOutProvider } from '../src/store/TalkItOutContext';

// Keep the launch screen up until household state has loaded.
SplashScreen.preventAutoHideAsync();
// The launch bridge: the native splash (charcoal + the gold brand mark) fades
// quickly into the warm interior instead of snapping. iOS honors the fade;
// Android's system splash performs its own crossfade.
NativeSplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) console.info('[herkeys] root-mounted');
  }, []);

  return (
    <SafeAreaProvider>
      <RevenueCatProvider>
        <AppStateProvider store={appStore}>
          <LocalNotificationProvider>
            <AccountProvider>
              <RootNavigator />
            </AccountProvider>
          </LocalNotificationProvider>
        </AppStateProvider>
      </RevenueCatProvider>
    </SafeAreaProvider>
  );
}

/**
 * The routing authority. Every root screen is declared inside its own guard
 * from the access table, so a link can't reach the audit or the app without an
 * account, the app before onboarding is finished, or onboarding after it — and
 * a device holding another account's household opens nothing but the conflict
 * screen.
 */
function RootNavigator() {
  const snapshot = useStoreSnapshot();
  const account = useAccount();
  const { refresh: refreshPremium } = useEntitlement();
  // Recheck the store's canonical entitlement when a Supabase session is
  // activated (including a pre-signup purchase) or signed out. The runtime
  // identifies the RevenueCat UUID before publishing a bound account.
  useEffect(() => {
    if (account.settled && (account.state.kind === 'accountBound' || account.state.kind === 'unauthenticated')) {
      void refreshPremium();
    }
  }, [account.settled, account.state.kind, refreshPremium]);
  const settled = isSettled(snapshot.status);

  useEffect(() => {
    if (!settled) return;
    SplashScreen.hide();
    if (__DEV__) console.info('[herkeys] navigator-ready');
  }, [settled]);

  // No navigator until state has loaded. The navigation container holds on to
  // the launch URL until one mounts, so a deep link waits through hydration and
  // is then checked against the guards — nothing is decided, or shown, early.
  if (!settled || !snapshot.state) return null;

  // The household has loaded but the stored session is still being resolved. Account state is not an answer yet, so
  // there is still no navigator: a returning account must not see Welcome, and nobody may see the audit or the app, for
  // however long the restore takes. The launch URL keeps waiting, exactly as it does through hydration.
  if (!account.settled) return <WelcomeAuthSettling />;

  const access = {
    status: snapshot.status,
    onboarding: snapshot.state.onboarding,
    internalTools,
    account: account.state,
    accountSettled: account.settled,
  };
  const allow = (screen: RootScreen) => canOpenScreen(screen, access);

  const guardedNavigator = (
    <OnboardingProvider>
      <ScheduleProvider>
        <OneMoveProvider>
          <TalkItOutProvider>
            <Stack
              // The entry anchors the stack only while it can be opened; otherwise the first allowed screen leads.
              initialRouteName={allow('index') ? 'index' : undefined}
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
            >
              <Stack.Protected guard={allow('index')}>
                <Stack.Screen name="index" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/goals')}>
                <Stack.Screen name="onboarding/goals" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/strengths')}>
                <Stack.Screen name="onboarding/strengths" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/struggles')}>
                <Stack.Screen name="onboarding/struggles" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/talk-it-out')}>
                <Stack.Screen name="onboarding/talk-it-out" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/profile')}>
                <Stack.Screen name="onboarding/profile" />
              </Stack.Protected>
              <Stack.Protected guard={allow('onboarding/plus')}>
                <Stack.Screen name="onboarding/plus" />
              </Stack.Protected>
              <Stack.Protected guard={allow('(app)')}>
                <Stack.Screen name="(app)" />
              </Stack.Protected>
              <Stack.Protected guard={allow('talk-it-out')}>
                <Stack.Screen name="talk-it-out" options={{ presentation: 'modal', headerShown: true, title: 'Talk It Out' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('event-editor')}>
                <Stack.Screen name="event-editor" options={{ presentation: 'modal', headerShown: true, title: 'Event' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('task-editor')}>
                <Stack.Screen name="task-editor" options={{ presentation: 'modal', headerShown: true, title: 'Task' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('opportunity-editor')}>
                <Stack.Screen name="opportunity-editor" options={{ presentation: 'modal', headerShown: true, title: 'Opportunity' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('dev-tools')}>
                <Stack.Screen name="dev-tools" options={{ headerShown: true, title: 'Internal tools' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('gallery')}>
                <Stack.Screen name="gallery" options={{ headerShown: true, title: 'Design gallery' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('sign-in')}>
                <Stack.Screen name="sign-in" options={{ presentation: 'modal', headerShown: true, title: 'Your account' }} />
              </Stack.Protected>
              <Stack.Protected guard={allow('account-conflict')}>
                <Stack.Screen name="account-conflict" />
              </Stack.Protected>
            </Stack>
          </TalkItOutProvider>
        </OneMoveProvider>
      </ScheduleProvider>
    </OnboardingProvider>
  );

  // Opt-in staging activation only after the proposed RLS ledger has been
  // reviewed and applied. While checking or saving mandatory legal receipts,
  // NO protected Stack is mounted and deep links cannot bypass consent.
  // Production is not silently activated by this development branch.
  if (process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE === 'true' && account.state.kind === 'accountBound') {
    return <ConsentGate session={account.state.session}>{guardedNavigator}</ConsentGate>;
  }
  return guardedNavigator;
}
