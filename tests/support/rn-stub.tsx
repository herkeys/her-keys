/**
 * Minimal react-native stub for component render/props contract tests.
 *
 * Rendering real React Native sources under plain `node --test` would require
 * RN's full Metro/babel pipeline (Flow `import typeof`, platform-file
 * resolution, native modules) — that is what jest-expo exists for, and adding
 * a jest stack is far more machinery than this test floor needs. Instead the
 * loader redirects `react-native` imports from component tests to this stub:
 * components render as a tree of stub elements, and tests assert the props
 * contract (variant resolution, accessibilityRole/State/Label, disabled and
 * selected behavior, semantic-input-derived treatments).
 *
 * Honest scope: layout, native behavior and visual output are verified in the
 * running app (design gallery + screenshots), not in unit tests.
 */
import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

export const View = (props: AnyProps) => React.createElement('View', props, props.children);
export const Text = (props: AnyProps) => React.createElement('Text', props, props.children);
export const ScrollView = (props: AnyProps) => React.createElement('ScrollView', props, props.children);
export const Pressable = (props: AnyProps) => {
  const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
  return React.createElement('Pressable', { ...props, style }, props.children);
};
export const TextInput = (props: AnyProps) => React.createElement('TextInput', props);
export const KeyboardAvoidingView = (props: AnyProps) =>
  React.createElement('KeyboardAvoidingView', props, props.children);
export const Modal = (props: AnyProps) => React.createElement('Modal', props, props.children);
export const SafeAreaView = (props: AnyProps) => React.createElement('SafeAreaView', props, props.children);
export const ActivityIndicator = (props: AnyProps) => React.createElement('ActivityIndicator', props);
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });

export const Platform = { OS: 'ios', select: (map: AnyProps) => map.ios ?? map.default };
export const StyleSheet = {
  create: (styles: AnyProps) => styles,
  hairlineWidth: 1,
  // Recursive, like RN's real flatten: style arrays nest (Card composes a
  // caller style array into its own), and tests read resolved properties.
  flatten: (style: AnyProps): AnyProps => {
    if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map((s) => StyleSheet.flatten(s)));
    return style;
  },
};

/** Enough of RN's AppState for the store provider to mount: it subscribes, and never fires. */
export const AppState = { addEventListener: (_event: string, _handler: (state: string) => void) => ({ remove: () => {} }) };

/**
 * Android hardware Back. Handlers register exactly as on a device; a test presses Back with `BackHandler.__press()`, which
 * asks the most recently added handler first (RN's order) and reports whether any handler consumed it. `false` means the
 * press was left to the system — on a root screen, that is leaving the app.
 */
const backHandlers: Array<() => boolean | null | undefined> = [];
export const BackHandler = {
  addEventListener: (_event: string, handler: () => boolean | null | undefined) => {
    backHandlers.push(handler);
    return {
      remove: () => {
        const index = backHandlers.indexOf(handler);
        if (index !== -1) backHandlers.splice(index, 1);
      },
    };
  },
  __press: (): boolean => {
    for (let index = backHandlers.length - 1; index >= 0; index--) if (backHandlers[index]() === true) return true;
    return false;
  },
  __count: (): number => backHandlers.length,
};

/** Easing functions are identities in tests — timing is not asserted here. */
export const Easing = {
  cubic: (t: number) => t,
  out: (f: (t: number) => number) => f,
  inOut: (f: (t: number) => number) => f,
};

/** Reduce Motion is off in the test environment, and never changes. */
export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_event: string, _handler: (value: boolean) => void) => ({ remove: () => {} }),
};

/**
 * Enough of Animated for entrance/emphasis wrappers to mount: values hold
 * their current number, interpolate returns it (tests assert structure and
 * props, not frames), and timing completes immediately.
 */
class AnimatedValue {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  interpolate() {
    return this.value;
  }
}
const AnimatedView = (props: AnyProps) => React.createElement('View', props, props.children);
export const Animated = {
  Value: AnimatedValue,
  View: AnimatedView,
  timing: (_value: unknown, _config: AnyProps) => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }) }),
};

const rn = {
  View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Modal,
  SafeAreaView, ActivityIndicator, useSafeAreaInsets, Platform, StyleSheet, AppState,
  Easing, AccessibilityInfo, Animated, BackHandler,
};
export default rn;
