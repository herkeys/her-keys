import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ColorValue } from 'react-native';
import { motionDuration, useReduceMotion } from '../motion';
import { color as palette, radius } from '../tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface TabIconSpec {
  /** Outline form — the resting state. */
  outline: IoniconName;
  /** Filled form — the selected state. Same family, same optical weight. */
  filled: IoniconName;
}

interface TabIconProps {
  spec: TabIconSpec;
  color: ColorValue;
  size: number;
  focused: boolean;
}

/**
 * One tab icon from the single Ionicons family: outline at rest, filled when
 * selected, with a restrained QUICK emphasis (a small rise-and-settle, never a
 * bounce). Color comes from the navigator so active/inactive tint stays in one
 * place. Honors Reduce Motion: the icon swaps without animating.
 *
 * HK-FE-UI-02: the selected tab also sits in a Soft Lilac pill (Berry glyph on Lilac is a 4.16:1 graphic, above the 3:1 floor), so
 * selection is carried by shape and fill as well as by tint. The pill is static; only the icon's quick rise animates.
 */
export function TabIcon({ spec, color, size, focused }: TabIconProps) {
  const reduceMotion = useReduceMotion();
  const emphasis = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(emphasis, {
      toValue: focused ? 1 : 0,
      duration: reduceMotion ? 0 : motionDuration.quick,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [emphasis, focused, reduceMotion]);

  return (
    <View style={[styles.pill, focused ? styles.pillSelected : null]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View
      style={{
        transform: [
          { translateY: emphasis.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) },
          { scale: emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
        ],
      }}
    >
      <Ionicons name={focused ? spec.filled : spec.outline} color={color} size={size} />
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { minWidth: 56, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  pillSelected: { backgroundColor: palette.surface.tint },
});
