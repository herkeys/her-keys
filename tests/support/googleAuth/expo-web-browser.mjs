/** Scriptable `expo-web-browser`: every call is recorded, the answer comes from `globalThis.__hkWebBrowser`. */
const control = () => globalThis.__hkWebBrowser;
export async function openAuthSessionAsync(url, redirectUrl) {
  const c = control();
  c.calls.push({ fn: 'openAuthSessionAsync', url, redirectUrl });
  return c.respond(url, redirectUrl);
}
export function maybeCompleteAuthSession() {
  control().calls.push({ fn: 'maybeCompleteAuthSession' });
  return { type: 'failed', message: 'Not supported on this platform' };
}
export default { openAuthSessionAsync, maybeCompleteAuthSession };
