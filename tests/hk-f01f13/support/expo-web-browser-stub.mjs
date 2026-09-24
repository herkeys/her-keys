/**
 * An inert stand-in for `expo-web-browser`. The dormant Google Calendar panel only reaches it when the user presses Connect against a
 * deployed provider, which no test here does; if one ever did, this reports the browser as dismissed rather than pretending it linked.
 */
export const openAuthSessionAsync = async () => ({ type: 'dismiss' });
export const maybeCompleteAuthSession = () => ({ type: 'failed', message: 'not available under node' });
export default { openAuthSessionAsync, maybeCompleteAuthSession };
