import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAccountAccessStatus} from '../../src/domain/account/accountAccessStatus.ts';
const read=fetcher=>fetchAccountAccessStatus(fetcher,'https://staging.example','public-key','actor-token');
test('native plain Error transport rejection has an explicit offline classification',async()=>{
 await assert.rejects(read(async()=>{throw new Error('Network request failed');}),error=>error.name==='AccountAccessNetworkError'&&!error.message.includes('token'));
});
test('HTTP authentication and server failures never become offline transport errors',async()=>{
 for(const status of [401,403,500,503])await assert.rejects(read(async()=>new Response('{}',{status})),error=>error.name==='Error'&&error.message==='status_unavailable');
});
test('malformed JSON and non-string account answers fail closed',async()=>{
 for(const body of ['not-json','{}','null'])await assert.rejects(read(async()=>new Response(body)),error=>error.name!=='AccountAccessNetworkError');
});
test('only the authenticated active answer is positive',async()=>{
 assert.equal(await read(async()=>new Response('"active"')),true);
 assert.equal(await read(async()=>new Response('"pending"')),false);
});
