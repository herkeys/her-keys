import { handleWebhook } from '../_shared/premium/webhookHandler.ts';
import { createApi, createStore, log, readDeployment, readWebhookAuthConfig, unavailableApi } from '../_shared/premium/runtime.ts';

// RevenueCat -> Her Keys. NOT a user endpoint: it carries no Supabase JWT (verify_jwt = false in config.toml) and authenticates
// the SENDER with the configured Authorization header and, where configured, the HMAC signature over the raw body.
// No CORS: this is server-to-server, a browser gets nothing.
Deno.serve(async (req) => {
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const deployment = readDeployment();
  const result = await handleWebhook(
    {
      store: createStore(),
      api: createApi() ?? unavailableApi,
      auth: readWebhookAuthConfig(deployment),
      deployment,
      nowMs: () => Date.now(),
      log,
    },
    { method: req.method, rawBody, header: (name) => req.headers.get(name) },
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
