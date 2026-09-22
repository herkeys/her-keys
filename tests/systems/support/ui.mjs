/**
 * Rendering helpers for Systems screens. Import this BEFORE any screen module: it registers the
 * Systems-local stubs (expo-router, react-native + AppState) for the current test file's process.
 */
import { registerHooks } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPO_ROUTER_STUB = pathToFileURL(join(HERE, 'expo-router-stub.tsx')).href;
const RN_STUB_SYSTEMS = pathToFileURL(join(HERE, 'rn-stub-systems.tsx')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-router') return nextResolve(EXPO_ROUTER_STUB, context);
    if (specifier === 'react-native') return nextResolve(RN_STUB_SYSTEMS, context);
    return nextResolve(specifier, context);
  },
});

const React = (await import('react')).default;
const TestRenderer = (await import('react-test-renderer')).default;
const { render } = await import('../../support/render.tsx');
const { AppStateProvider } = await import('../../../src/store/AppStateProvider.tsx');
const stub = await import('./expo-router-stub.tsx');

export const navigation = stub.navigation;
export { React, TestRenderer };

/** A store that never finishes hydrating, for "loading is not empty". */
export const neverSettles = (snapshot) => ({
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  hydrate: () => new Promise(() => {}),
  refreshDay: () => {},
});

/**
 * A store already settled on a given snapshot, with no commit path — for rendering a shape the real
 * store's write/load validation would now refuse outright (e.g. legacy data predating a later invariant).
 * Read-only: exercises the screen's own defensive rendering, not the store lifecycle.
 */
export const readyStore = (snapshot) => ({
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  hydrate: () => Promise.resolve(),
  refreshDay: () => {},
});

export async function mount(store, element) {
  navigation.calls.length = 0;
  navigation.params = {};
  return render(React.createElement(AppStateProvider, { store }, element));
}

export const act = async (fn) => TestRenderer.act(async () => void (await fn()));

/** Every string the user could read, in tree order. Components inside a closed Modal are excluded. */
export function texts(renderer) {
  const out = [];
  const flatten = (node) => (typeof node === 'string' ? node : (node?.children ?? []).map(flatten).join(''));
  const walk = (node, hidden) => {
    if (typeof node === 'string') {
      if (!hidden) out.push(node);
      return;
    }
    if (!node) return;
    const closed = hidden || (node.type === 'Modal' && node.props.visible === false);
    // Adjacent text inside ONE <Text> is one run of text, exactly as React Native renders it.
    if (node.type === 'Text') {
      if (!closed) out.push(flatten(node));
      return;
    }
    for (const child of node.children ?? []) walk(child, closed);
  };
  walk(renderer.toJSON(), false);
  return out;
}

const isOpen = (instance) => {
  for (let n = instance; n; n = n.parent) if (n.type === 'Modal' && n.props.visible === false) return false;
  return true;
};

/** Interactive elements the user can currently reach: not inside a closed sheet. */
export const buttons = (renderer) =>
  renderer.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && isOpen(n));

export const labelOf = (node) => node.props.accessibilityLabel;
export const buttonLabels = (renderer) => buttons(renderer).map(labelOf);

export async function press(renderer, label) {
  const target = buttons(renderer).find((n) => labelOf(n) === label);
  if (!target) throw new Error(`no reachable button "${label}". Reachable: ${buttonLabels(renderer).join(' | ')}`);
  await act(() => target.props.onPress());
}

/** Press the LAST reachable button with this label: the one in the open sheet, when a card shares its label. */
export async function pressLast(renderer, label) {
  const matches = buttons(renderer).filter((n) => labelOf(n) === label);
  if (matches.length === 0) throw new Error(`no reachable button "${label}"`);
  await act(() => matches[matches.length - 1].props.onPress());
}

/** A field, found by its accessibility label (TextField sets it from its visible label). */
export const field = (renderer, label) => {
  const found = renderer.root.findAll((n) => n.type === 'TextInput' && n.props.accessibilityLabel === label);
  if (found.length !== 1) throw new Error(`expected one field "${label}", found ${found.length}`);
  return found[0];
};
export const typeInto = (renderer, label, text) => act(() => field(renderer, label).props.onChangeText(text));

export const allText = (renderer) => texts(renderer).join(' ');

/** Mount, run, and ALWAYS unmount: the provider owns a 60s interval that would keep the process alive. */
export async function withScreen(store, element, run) {
  const renderer = await mount(store, element);
  try {
    return await run(renderer);
  } finally {
    await act(() => renderer.unmount());
  }
}
