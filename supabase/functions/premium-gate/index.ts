import { AuthError, requireUser } from '../_shared/supabaseAdmin.ts';
import { json, options } from '../_shared/http.ts';
import { handleGate } from '../_shared/premium/gateHandler.ts';
import { createApi, createStore, log, readDeployment, unavailableApi } from '../_shared/premium/runtime.ts';

// The single Premium authorization entry point for signed-in callers. The account is the JWT subject, verified server-side; the body
// is a strict schema that cannot name an account or an entitlement.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ outcome: 'denied', reason: 'invalid_request', nextAction: 'none' }, 400);
    }
    const result = await handleGate(
      {
        store: createStore(),
        api: createApi() ?? unavailableApi,
        deployment: readDeployment(),
        nowMs: () => Date.now(),
        log,
        newRequestId: () => crypto.randomUUID(),
      },
      user.id,
      body,
    );
    return json(result.body, result.status);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    log({ op: 'gate', outcome: 'error' });
    return json({ outcome: 'denied', reason: 'service_unavailable', nextAction: 'retry_later' }, 503);
  }
});
