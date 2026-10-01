/**
 * Animated shared primitives — presentation-only wrappers over the motion
 * language in `src/design/motion.ts`. Use them to explain a state change
 * (a section appearing, a completion settling), never to decorate.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { ENTRANCE_RISE, motionDuration, useReduceMotion } from '../motion';

interface FadeInProps {
  children: ReactNode;
  /** Motion category: standard for content appearing, deliberate for meaningful settles. */
  speed?: keyof typeof motionDuration;
  /** Rise distance in dp. Pass 0 for a pure fade. */
  rise?: number;
  /** Delay before the entrance starts (ms). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mount entrance: fades in while rising a few dp. Honors Reduce Motion (the
 * content simply appears). Re-key the component to replay the entrance when
 * the underlying state changes (e.g. recommendation → completed).
 */
export function FadeIn({ children, speed = 'standard', rise = ENTRANCE_RISE, delay = 0, style }: FadeInProps) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : motionDuration[speed],
      delay: reduceMotion ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, speed, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [reduceMotion ? 0 : rise, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
