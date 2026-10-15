import { ACCOUNT_ROUTE } from '../features/account/accountModel';

/**
 * Restore Purchases has ONE home: the Premium section of Your Account. A Premium notice that tells her to restore takes her there; it
 * never starts a store operation of its own (and never opens the purchase interface under a "restore" label).
 *
 * `expo-router` is loaded when she presses, so a surface that only renders a notice never pulls the router into its own module graph.
 */
export async function openAccountToRestore(): Promise<void> {
  const { router } = await import('expo-router');
  router.push(ACCOUNT_ROUTE);
}
