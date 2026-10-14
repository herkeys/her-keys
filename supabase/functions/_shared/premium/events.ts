import { ENTITLEMENT_KEY, type NormalizedEvent, type PremiumEnvironment } from './types.ts';

export const MAX_BODY_BYTES = 256 * 1024;

export type ParseResult = { ok: true; event: NormalizedEvent } | { ok: false; reason: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function ms(value: unknown): number | null {
  // RevenueCat sends integer milliseconds. Reject anything that is not a plausible instant (year 2000 .. 2100).
  return typeof value === 'number' && Number.isInteger(value) && value > 946_684_800_000 && value < 4_102_444_800_000 ? value : null;
}

function strList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && item.length <= maxLen && out.length < maxItems && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Defensive webhook parsing. Anything not on the allow-list is dropped on purpose: prices, currency, country, e-mail,
 * subscriber attributes, device and transaction identifiers are NEVER read, so they can never be stored or logged.
 * Unknown event types and unknown fields are tolerated (RevenueCat adds both without a version change).
 */
export function parseWebhookBody(rawBody: Uint8Array): ParseResult {
  if (rawBody.length === 0) return { ok: false, reason: 'empty_body' };
  if (rawBody.length > MAX_BODY_BYTES) return { ok: false, reason: 'body_too_large' };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!isObject(json) || !isObject(json.event)) return { ok: false, reason: 'missing_event' };
  const e = json.event;

  const eventId = str(e.id, 200);
  const eventType = str(e.type, 80);
  if (eventId === null) return { ok: false, reason: 'missing_event_id' };
  if (eventType === null) return { ok: false, reason: 'missing_event_type' };
  if (e.environment !== 'SANDBOX' && e.environment !== 'PRODUCTION') return { ok: false, reason: 'invalid_environment' };

  // `entitlement_ids` (current) or the deprecated singular `entitlement_id`.
  const ids = strList(e.entitlement_ids, 20, 120);
  const legacy = str(e.entitlement_id, 120);
  if (legacy !== null && !ids.includes(legacy)) ids.push(legacy);

  const event: NormalizedEvent = {
    event_id: eventId,
    event_type: eventType,
    environment: e.environment as PremiumEnvironment,
    event_timestamp_ms: ms(e.event_timestamp_ms),
    app_user_id: str(e.app_user_id, 200),
    original_app_user_id: str(e.original_app_user_id, 200),
    aliases: strList(e.aliases, 50, 200),
    transferred_from: strList(e.transferred_from, 50, 200),
    transferred_to: strList(e.transferred_to, 50, 200),
    entitlement_ids: ids.length > 0 ? ids : null,
    product_id: str(e.product_id, 200),
    new_product_id: str(e.new_product_id, 200),
    store: str(e.store, 40),
    expiration_at_ms: ms(e.expiration_at_ms),
    purchased_at_ms: ms(e.purchased_at_ms),
    grace_period_expiration_at_ms: ms(e.grace_period_expiration_at_ms),
    cancel_reason: str(e.cancel_reason, 40),
    expiration_reason: str(e.expiration_reason, 40),
    period_type: str(e.period_type, 20),
  };
  return { ok: true, event };
}

/** Whether this event speaks about the Premium entitlement. An event naming OTHER entitlements only is irrelevant to Premium. */
export function concernsPremium(event: NormalizedEvent): 'yes' | 'unspecified' | 'no' {
  if (event.entitlement_ids === null) return 'unspecified';
  return event.entitlement_ids.includes(ENTITLEMENT_KEY) ? 'yes' : 'no';
}

/** The allow-listed payload stored as evidence. Never includes anything the parser dropped. */
export function evidencePayload(event: NormalizedEvent): Record<string, unknown> {
  return {
    entitlement_ids: event.entitlement_ids,
    product_id: event.product_id,
    new_product_id: event.new_product_id,
    store: event.store,
    expiration_at_ms: event.expiration_at_ms,
    purchased_at_ms: event.purchased_at_ms,
    grace_period_expiration_at_ms: event.grace_period_expiration_at_ms,
    cancel_reason: event.cancel_reason,
    expiration_reason: event.expiration_reason,
    period_type: event.period_type,
  };
}
