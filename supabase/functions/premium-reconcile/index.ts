import { AuthError, requireUser } from '../_shared/supabaseAdmin.ts';
import { json, options } from '../_shared/http.ts';
import { reconcileAccount } from '../_shared/premium/reconcileService.ts';
import { createApi, createStore, log, readDeployment } from '../_shared/premium/runtime.ts';

// "Verify my subscription": reconciles the CALLER's own account against RevenueCat's authenticated subscriber record. Used after a
// purchase whose webhook is late, after Restore Purchases, and on account switch. Rate-limited per account with backoff on failure.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req);
    const api = createApi();
    const store = createStore();
    if (api === null) return json({ status: 'provider_unavailable', state: await store.getState(user.id) }, 503);
    const status = await reconcileAccount(
      { store, api, deployment: readDeployment(), nowMs: () => Date.now(), log },
      user.id,
      { force: false },
    );
    return json({ status, state: await store.getState(user.id) }, status === 'provider_unavailable' ? 503 : 200);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    log({ op: 'reconcile', outcome: 'error' });
    return json({ status: 'provider_unavailable' }, 503);
  }
});
