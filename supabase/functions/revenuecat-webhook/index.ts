import { handleWebhook } from '../_shared/premium/webhookHandler.ts';
import { readWebhookBody } from '../_shared/premium/events.ts';
import { createApi, createStore, log, readDeployment, readWebhookAuthConfig, unavailableApi } from '../_shared/premium/runtime.ts';

// RevenueCat -> Her Keys. NOT a user endpoint: it carries no Supabase JWT (verify_jwt = false in config.toml) and authenticates
// the SENDER with the configured Authorization header and, where configured, the HMAC signature over the raw body.
// No CORS: this is server-to-server, a browser gets nothing.
Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const body = req.method === 'POST' ? await readWebhookBody(req) : { ok: true as const, rawBody: new Uint8Array() };
  if (!body.ok) {
    const oversized = body.reason === 'body_too_large';
    return new Response(JSON.stringify({ error: oversized ? 'payload_too_large' : 'invalid_payload' }), {
      status: oversized ? 413 : 400, headers,
    });
  }
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
    { method: req.method, rawBody: body.rawBody, header: (name) => req.headers.get(name) },
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
});
