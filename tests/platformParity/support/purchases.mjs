export const sdk = {
  id: '$RCAnonymousID:test', calls: [], info: { entitlements: { active: {} } },
  failLogin: false, failRestore: false, restoreWait: null,
  // Failure injection: a native call that never answers, and the offering the store resolved.
  hang: { login: false, customerInfo: false, offerings: false, restore: false, userId: false }, offering: null,
  // A held native call that finishes only when the test releases it (a late logIn/logOut landing after a newer operation).
  hold: { login: null, userId: null },
};
export const LOG_LEVEL = { INFO: 'INFO' };
export default {
  configure: () => {}, setLogLevel: async () => {},
  getAppUserID: async () => {
    if (sdk.hang.userId) return new Promise(() => {});
    const held = sdk.hold.userId;
    sdk.hold.userId = null;
    if (held) await held;
    return sdk.id;
  },
  logIn: async (id) => { sdk.calls.push(['login', id]); if (sdk.hang.login) return new Promise(() => {}); const held = sdk.hold.login;
    sdk.hold.login = null;
    if (held) await held; if (sdk.failLogin) throw new Error('login failed'); sdk.id = id; },
  logOut: async () => { sdk.calls.push(['logout']); sdk.id = '$RCAnonymousID:test'; },
  getCustomerInfo: async () => sdk.hang.customerInfo ? new Promise(() => {}) : sdk.info,
  getOfferings: async () => sdk.hang.offerings ? new Promise(() => {}) : { current: sdk.offering ?? {} },
  restorePurchases: async () => {
    sdk.calls.push(['restore', sdk.id]);
    if (sdk.hang.restore) return new Promise(() => {});
    if (sdk.failRestore) throw new Error('store unavailable');
    if (sdk.restoreWait) return sdk.restoreWait;
    return sdk.info;
  },
};
export const PAYWALL_RESULT = { PURCHASED: 'purchased', RESTORED: 'restored', NOT_PRESENTED: 'not_presented', CANCELLED: 'cancelled', ERROR: 'error' };
export const RevenueCatUI = { presentPaywallIfNeeded: async () => { sdk.calls.push(['paywall', sdk.id]); return PAYWALL_RESULT.CANCELLED; } };
