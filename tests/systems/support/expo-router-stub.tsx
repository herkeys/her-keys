/**
 * A recording stand-in for `expo-router`, so Systems screens can be rendered under `node --test`.
 * Navigation is observable (`navigation.calls`); nothing actually navigates. What this proves is the
 * screens' contract with the router (which route they ask for, and with what params) — real
 * navigation is verified in the running app.
 */
export const navigation: { calls: Array<[string, unknown?]>; params: Record<string, string | undefined> } = { calls: [], params: {} };

export const router = {
  push: (href: unknown) => navigation.calls.push(['push', href]),
  replace: (href: unknown) => navigation.calls.push(['replace', href]),
  back: () => navigation.calls.push(['back']),
};

const Screen = (_props: unknown) => null;
export const Stack = Object.assign((_props: unknown) => null, { Screen, Protected: (props: { children?: unknown }) => props.children ?? null });

export const useLocalSearchParams = () => navigation.params;
