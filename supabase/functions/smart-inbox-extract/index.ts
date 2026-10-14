import { AuthError, requireUser } from '../_shared/supabaseAdmin.ts';
import { json, options } from '../_shared/http.ts';
import { createStore, log } from '../_shared/premium/runtime.ts';
import { createGeminiProvider } from '../_shared/premium/smartInbox/geminiProvider.ts';
import { handleExtract } from '../_shared/premium/smartInbox/handler.ts';

// Smart Inbox (Premium): read ONE note into typed proposals for her review. The account is the verified JWT subject; the household id
// in the body is only a claim the database re-verifies. The server — not the app — checks entitlement, AI Data Processing consent,
// quota and the cost cap BEFORE anything is sent to the model, and nothing she wrote is stored or logged here.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const user = await requireUser(req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ status: 'invalid_request', reason: 'not_json' }, 400);
    }
    const result = await handleExtract(
      {
        store: createStore(),
        provider: createGeminiProvider({ apiKey: Deno.env.get('GEMINI_API_KEY') ?? null, model: Deno.env.get('GEMINI_MODEL') ?? null }),
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
    log({ op: 'smart_inbox', outcome: 'error' });
    return json({ status: 'unavailable', reason: 'error' }, 503);
  }
});
