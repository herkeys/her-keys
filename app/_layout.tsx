import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/design/tokens';
import { OnboardingProvider } from '../src/store/OnboardingContext';
import { OneMoveProvider } from '../src/store/OneMoveContext';
import { ScheduleProvider } from '../src/store/ScheduleContext';
import { TalkItOutProvider } from '../src/store/TalkItOutContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <OnboardingProvider>
        <ScheduleProvider>
          <OneMoveProvider>
            <TalkItOutProvider>
              <Stack
                initialRouteName="index"
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="talk-it-out" options={{ presentation: 'modal', headerShown: true, title: 'Talk It Out' }} />
              </Stack>
            </TalkItOutProvider>
          </OneMoveProvider>
        </ScheduleProvider>
      </OnboardingProvider>
    </SafeAreaProvider>
  );
}
