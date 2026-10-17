import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const source = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const sql = source('supabase/migrations/20261017180000_ai_response_reporting.sql');
const client = source('src/platform/aiResponseReporting.ts');
const panel = source('src/features/talk-it-out/AiReportPanel.tsx');
const view = source('src/features/talk-it-out/TalkItOutView.tsx');

describe('AI response reporting — private consumer safety', () => {
  test('server derives the account from the verified session', () => {
    assert.match(sql, /v_actor uuid := auth\.uid\(\)/);
    assert.doesNotMatch(sql, /p_account_id|p_user_id/);
  });
  test('private queue has RLS and no consumer table grants', () => {
    assert.match(sql, /private\.ai_response_reports/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON private\.ai_response_reports FROM PUBLIC, anon, authenticated/);
  });
  test('only authenticated role may call submission RPC', () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.submit_ai_response_report\(text,text,text,uuid\) FROM PUBLIC, anon/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_ai_response_report\(text,text,text,uuid\) TO authenticated/);
  });
  test('server enforces reason allowlist, idempotency and actor-specific rate limits', () => {
    assert.match(sql, /reason IN \('unsafe','offensive','inaccurate','privacy','other'\)/);
    assert.match(sql, /UNIQUE\(account_id, client_dedupe_key\)/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /report_rate_limited/);
  });
  test('no prompt, message text, email or AI output are stored', () => {
    assert.doesNotMatch(sql, /\b(prompt|conversation_text|response_text|email_address|message_text)\s+(text|jsonb)/i);
    assert.match(sql, /message_id text NOT NULL/);
  });
  test('report metadata expires automatically within 30 days', () => {
    assert.match(sql, /interval '30 days'/);
    assert.match(sql, /cron\.schedule/);
    assert.match(sql, /expires_at < now\(\)/);
    assert.match(sql, /ON DELETE CASCADE/);
  });
  test('client pins originating JWT and never submits response content', () => {
    assert.match(client, /session\.user\.id !== owner\.accountId/);
    assert.match(client, /Bearer \$\{token\}/);
    assert.match(client, /signal: owner\.signal/);
    assert.match(client, /p_message_id: input\.messageId/);
    assert.doesNotMatch(client, /p_response_text|p_prompt|p_conversation/);
  });
  test('Talk It Out presents a real reporting component', () => {
    assert.match(view, /<AiReportPanel/);
    assert.match(view, /Report response/);
    assert.match(panel, /aiReportClient\.submit/);
    assert.match(panel, /accountStore\.subscribe/);
    assert.match(panel, /request\.abort\(\)/);
  });
  test('report form has failure, duplicate and confirmation-safe behavior', () => {
    assert.match(panel, /state === 'received'/);
    assert.match(panel, /Report submitted/);
    assert.match(panel, /Could not submit your report/);
    assert.match(panel, /key = useRef\(Crypto\.randomUUID\(\)\)/);
  });
});
