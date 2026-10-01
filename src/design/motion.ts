/**
 * Motion — the small, shared animation language (HK-FE-UI-01 §21).
 *
 * Three categories, taken 1:1 from the motion tokens:
 *   QUICK      — press/selection feedback (tab emphasis, chips, toggles)
 *   STANDARD   — content state changes (loading→content, completion settle)
 *   DELIBERATE — meaningful transitions (expansion, completion acknowledgment)
 *
 * Everything here is presentation-only, built on the core Animated API — no new
 * animation dependency, nothing blocking, everything interruptible. Reduce
 * Motion is honored: when the OS asks for it, animations collapse to immediate
 * state changes (duration 0).
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { motion } from './tokens';

export const motionDuration = {
  quick: motion.quick.duration,
  standard: motion.standard.duration,
  deliberate: motion.deliberate.duration,
} as const;

/** Content entrance: a short fade with a barely-there rise. */
export const ENTRANCE_RISE = 6;

/**
 * Whether the user has asked the OS to reduce motion. Defaults to false until
 * the accessibility read resolves; changes are picked up live.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduce(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** Resolve a duration to zero when Reduce Motion is on. */
export function durationFor(duration: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : duration;
}

/**
 * Animate a value with the house easing (ease-out, matching the tokens).
 * Returns a function to run the animation to a new target; safe to re-call —
 * the running animation is simply re-targeted (interruptible).
 */
export function useTiming(value: Animated.Value, duration: number, reduceMotion: boolean) {
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const ref = useRef<((to: number) => void) | undefined>(undefined);
  if (!ref.current) {
    ref.current = (to: number) => {
      Animated.timing(value, {
        toValue: to,
        duration: durationFor(durationRef.current, reduceRef.current),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
  }
  return ref.current;
}
