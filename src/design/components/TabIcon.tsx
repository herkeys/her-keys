import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, type ColorValue } from 'react-native';
import { motionDuration, useReduceMotion } from '../motion';

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
  );
}
