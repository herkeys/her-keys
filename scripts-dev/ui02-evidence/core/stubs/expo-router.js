// Evidence-only stand-in for expo-router: navigation is inert, search params come from the harness, and `Tabs` renders the REAL
// layout options (app/(app)/_layout.tsx) as a bottom bar over the scene the harness selected.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const router = { push() {}, replace() {}, back() {}, navigate() {}, setParams() {}, canGoBack: () => false };
export const useRouter = () => router;
let currentParams = {};
export const __setParams = (p) => { currentParams = p || {}; };
export const useLocalSearchParams = () => currentParams;
export const useGlobalSearchParams = () => currentParams;
export const useFocusEffect = (cb) => { React.useEffect(() => cb(), []); };
export const useNavigation = () => ({ setOptions() {}, goBack() {}, canGoBack: () => false, addListener: () => () => {} });
export const Redirect = () => null;
export const Link = ({ children }) => children;
export const SplashScreen = { preventAutoHideAsync: async () => {}, hide() {}, hideAsync: async () => {} };
export function Stack({ children }) { return children ?? null; }
Stack.Screen = () => null;
Stack.Protected = ({ children }) => children;

export const __tabs = { current: 'today', scenes: {} };
export function Tabs({ screenOptions, children }) {
  const screens = React.Children.toArray(children).map((c) => c.props);
  const optionsFor = (name) => ({
    ...(typeof screenOptions === 'function' ? screenOptions({ route: { name } }) : screenOptions),
    ...(screens.find((s) => s.name === name)?.options ?? {}),
  });
  const active = __tabs.current;
  const Scene = __tabs.scenes[active];
  const activeOptions = optionsFor(active);
  return (
    <View style={[{ flex: 1 }, activeOptions.sceneStyle]}>
      <View style={{ flex: 1 }}>{Scene ? <Scene /> : null}</View>
      <View style={[{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth }, activeOptions.tabBarStyle]}>
        {screens.map((s) => {
          const o = optionsFor(s.name);
          const focused = s.name === active;
          const tint = focused ? o.tabBarActiveTintColor : o.tabBarInactiveTintColor;
          return (
            <View key={s.name} style={[{ flex: 1, alignItems: 'center' }, o.tabBarItemStyle]}>
              <View style={o.tabBarIconStyle}>{o.tabBarIcon?.({ color: tint, focused, size: 24 })}</View>
              <Text style={[o.tabBarLabelStyle, { color: tint }]}>{s.options?.title ?? s.name}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
Tabs.Screen = () => null;
