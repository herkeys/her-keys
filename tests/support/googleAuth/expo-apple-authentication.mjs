/** Scriptable `expo-apple-authentication` answering from `globalThis.__hkApple`; records the options of every request. */
export const AppleAuthenticationScope = { FULL_NAME: 0, EMAIL: 1 };
export async function isAvailableAsync() {
  return true;
}
export async function signInAsync(options) {
  globalThis.__hkApple.requests = [...(globalThis.__hkApple.requests ?? []), options];
  if (globalThis.__hkApple.error) throw globalThis.__hkApple.error;
  return globalThis.__hkApple.credential;
}
