import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDeletionReceipt,canEraseDeletedNamespace} from '../../src/domain/account/deletion.ts';
import {isOpaqueProof,recoveryEmail} from '../../supabase/functions/_shared/deletionCore.ts';
import {randomUrlSafe,sha256Base64Url,encryptSecret,decryptSecret} from '../../supabase/functions/_shared/crypto.ts';
import {harness,launch} from '../support/fixtures.mjs';
import {renameCategory} from '../../src/domain/categories.ts';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const receipt={accountId:A,proof:'a'.repeat(43)};
test('local terminal cleanup requires matching namespace and verified timestamps',()=>{
 const status={status:'purged',purged_at:'2026-10-14T00:00:00Z',verified_at:'2026-10-14T00:00:01Z'};
 assert.equal(canEraseDeletedNamespace(status,receipt,A),true);
 for(const invalid of [null,{},'purged',{status:'pending'},{...status,purged_at:null},{...status,verified_at:'invalid'}])
  assert.equal(canEraseDeletedNamespace(invalid,receipt,A),false);
 assert.equal(canEraseDeletedNamespace(status,receipt,B),false);
 assert.equal(canEraseDeletedNamespace(status,receipt,null),false);
});
test('malformed local proof is a refusal, never evidence of erasure',()=>{
 assert.equal(parseDeletionReceipt(null),null);assert.deepEqual(parseDeletionReceipt(JSON.stringify(receipt)),receipt);
 for(const raw of ['broken','{}',JSON.stringify({...receipt,proof:'predictable'})])assert.throws(()=>parseDeletionReceipt(raw));
});
test('pending account blocks local mutation and sync without losing recoverable data',async()=>{
 const h=harness();const store=await launch(h);const before=store.getSnapshot().state;
 store.setAccountAccessBlocked(true);
 store.dispatch(state=>renameCategory(state,'cat-kids','Must not appear'));
 assert.equal(await store.commit(state=>renameCategory(state,'cat-kids','Must not appear')),false);
 let invoked=false;assert.equal(await store.applySync(()=>{invoked=true;return null;}),false);
 assert.equal(invoked,false);assert.equal(store.getSnapshot().state,before);
 store.setAccountAccessBlocked(false);
 assert.equal(await store.commit(state=>renameCategory(state,'cat-kids','Children')),true);
});
test('recovery proof has 256-bit entropy input, fixed length, no collisions in a sample',async()=>{
 const tokens=Array.from({length:1000},()=>randomUrlSafe());assert.equal(new Set(tokens).size,tokens.length);
 for(const token of tokens)assert.equal(isOpaqueProof(token),true);
 assert.equal(isOpaqueProof('short'),false);
 assert.equal((await sha256Base64Url(tokens[0])).length,43);
 assert.notEqual(await sha256Base64Url(tokens[0]),tokens[0]);
});
test('outbox encryption authenticates payload and refuses a tampered ciphertext',async()=>{
 globalThis.Deno={env:{get:name=>name==='EXTERNAL_TOKEN_ENCRYPTION_KEY_B64'?Buffer.alloc(32,7).toString('base64'):undefined}};
 const original=JSON.stringify({token:randomUrlSafe(),email:'fixture@local.test'});
 const encrypted=await encryptSecret(original);assert.ok(!encrypted.ciphertext.includes('fixture@local.test'));
 assert.equal(await decryptSecret(encrypted.ciphertext,encrypted.iv),original);
 const bytes=Buffer.from(encrypted.ciphertext,'base64');bytes[3]^=1;
 await assert.rejects(decryptSecret(bytes.toString('base64'),encrypted.iv));
 delete globalThis.Deno;
});
test('recovery email has an explicit confirmation link, deadline, plain text and subscription guidance',()=>{
 const email=recoveryEmail('recovery','2026-11-14T00:00:00Z','https://herkeys.app/account/restore#token='+'a'.repeat(43));
 assert.match(email.text,/2026-11-14T00:00:00.000Z/);assert.match(email.text,/does not cancel/);
 assert.match(email.html,/lang="en"/);assert.match(email.html,/Restore my account/);
 const escaped=recoveryEmail('recovery','2026-11-14T00:00:00Z','https://herkeys.app/?x="<script>');
 assert.ok(!escaped.html.includes('<script>'));
});
