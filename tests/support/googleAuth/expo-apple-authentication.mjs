/** Scriptable `expo-apple-authentication` answering from `globalThis.__hkApple`. */
export const AppleAuthenticationScope = { FULL_NAME: 0, EMAIL: 1 };
export async function isAvailableAsync() {
  return true;
}
export async function signInAsync() {
  return globalThis.__hkApple.credential;
}
