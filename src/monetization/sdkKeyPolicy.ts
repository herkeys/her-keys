/** Client public keys only. A Test Store key can never route a Production purchase. */
export function isRevenueCatKeyAllowed(platform: 'ios' | 'android', key: string | undefined, store: string | undefined, backend: string | undefined): boolean {
  if (!key || key !== key.trim() || /placeholder|your[_-]?key|example/i.test(key)) return false;
  if (store === 'test') return backend === 'staging' && /^test_[A-Za-z0-9]+$/.test(key);
  if (store !== undefined && store !== 'native') return false;
  return (platform === 'ios' ? /^appl_[A-Za-z0-9]+$/ : /^goog_[A-Za-z0-9]+$/).test(key);
}
