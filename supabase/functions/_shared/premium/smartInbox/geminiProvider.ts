import type { ExtractionProvider, ProviderResult } from './handler.ts';

// The Gemini adapter, shaped exactly like the one herkeys-ai already runs (same endpoint, `x-goog-api-key` header, structured
// response schema, `store: false`). Injectable `fetch`/env keep it testable without a network or a key.
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1/interactions';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export interface GeminiConfig {
  apiKey: string | null;
  model: string | null;
}

export function createGeminiProvider(config: GeminiConfig, fetchImpl: typeof fetch = fetch): ExtractionProvider {
  return {
    configured: () => Boolean(config.apiKey),

    async extract({ system, user, schema, deadlineMs }): Promise<ProviderResult> {
      if (!config.apiKey) return { ok: false, kind: 'not_configured' };
      const started = Date.now();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remaining = deadlineMs - (Date.now() - started);
        if (remaining <= 0) return { ok: false, kind: 'timeout' };
        let response: Response;
        try {
          response = await fetchImpl(PROVIDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
            body: JSON.stringify({
              model: config.model?.trim() || DEFAULT_MODEL,
              input: user,
              system_instruction: system,
              response_format: { type: 'text', mime_type: 'application/json', schema },
              store: false,
              generation_config: { max_output_tokens: 2200, thinking_level: 'low', thinking_summaries: 'none' },
            }),
            signal: AbortSignal.timeout(Math.max(1, Math.min(remaining, 9_000))),
          });
        } catch (error) {
          const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
          if (attempt === 0 && Date.now() - started < deadlineMs - 250) continue;
          return { ok: false, kind: timedOut ? 'timeout' : 'unavailable' };
        }

        if (response.ok) {
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            return { ok: false, kind: 'unavailable' };
          }
          const text = outputText(payload);
          if (text === null) return { ok: false, kind: 'unavailable' };
          return { ok: true, text, tokens: tokensOf(payload) };
        }
        if (response.status === 429 && attempt === 1) return { ok: false, kind: 'rate_limited' };
        if (!RETRYABLE.has(response.status) || attempt === 1) return { ok: false, kind: response.status === 429 ? 'rate_limited' : 'unavailable' };
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      return { ok: false, kind: 'unavailable' };
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The single text step of a COMPLETED interaction. A tool/function call anywhere rejects the whole interaction: there are no tools. */
export function outputText(payload: unknown): string | null {
  if (!isRecord(payload) || payload.status !== 'completed' || !Array.isArray(payload.steps)) return null;
  if (payload.steps.some((step) => isRecord(step) && step.type === 'function_call')) return null;
  const pieces: string[] = [];
  for (const step of payload.steps) {
    if (!isRecord(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') pieces.push(item.text);
  }
  return pieces.length === 1 ? pieces[0] : null;
}

function tokensOf(payload: unknown): { input: number | null; output: number | null } {
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : {};
  const n = (key: string) => (typeof usage[key] === 'number' ? (usage[key] as number) : null);
  return { input: n('total_input_tokens'), output: n('total_output_tokens') };
}
