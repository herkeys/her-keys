import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/design/tokens';
import { canOpenScreen, isSettled, type RootScreen } from '../src/domain/routeAccess';
import { RevenueCatProvider } from '../src/monetization/RevenueCatProvider';
import { AccountProvider, useAccount } from '../src/store/AccountProvider';
import { AppStateProvider, useStoreSnapshot } from '../src/store/AppStateProvider';
import { appStore, internalTools } from '../src/store/appStoreInstance';
import { OnboardingProvider } from '../src/store/OnboardingContext';
import { OneMoveProvider } from '../src/store/OneMoveContext';
import { ScheduleProvider } from '../src/store/ScheduleContext';
import { TalkItOutProvider } from '../src/store/TalkItOutContext';

// Keep the launch screen up until household state has loaded.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) console.info('[herkeys] root-mounted');
  }, []);

  return (
    <SafeAreaProvider>
      <RevenueCatProvider>
        <AppStateProvider store={appStore}>
          <AccountProvider>
            <RootNavigator />
          </AccountProvider>
        </AppStateProvider>
      </RevenueCatProvider>
    </SafeAreaProvider>
  );
}

/**
 * The routing authority. Every root screen is declared inside its own guard
 * from the access table, so a link can't reach the app before onboarding is
 * finished, or onboarding after it — and a device holding another account's
 * household opens nothing but the conflict screen.
 */
function RootNavigator() {
  const snapshot = useStoreSnapshot();
  const account = useAccount();
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

  const access = { status: snapshot.status, onboarding: snapshot.state.onboarding, internalTools, account: account.state };
  const allow = (screen: RootScreen) => canOpenScreen(screen, access);

  return (
    <OnboardingProvider>
      <ScheduleProvider>
        <OneMoveProvider>
          <TalkItOutProvider>
            <Stack
              // Welcome anchors onboarding only while it can be opened; otherwise the first allowed screen leads.
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
}
