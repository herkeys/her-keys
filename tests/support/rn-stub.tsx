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
  flatten: (style: AnyProps) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style),
};

const rn = {
  View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Modal,
  SafeAreaView, ActivityIndicator, useSafeAreaInsets, Platform, StyleSheet,
};
export default rn;
