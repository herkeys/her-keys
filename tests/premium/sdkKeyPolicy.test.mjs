import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRevenueCatKeyAllowed } from '../../src/monetization/sdkKeyPolicy.ts';
test('Production rejects Test Store, secret, placeholder and swapped native keys',()=>{
 for(const platform of ['ios','android'])for(const key of ['test_synthetic','sk_secret','your_key','',undefined,' appl_abc','placeholder'])
  assert.equal(isRevenueCatKeyAllowed(platform,key,'native','production'),false);
 assert.equal(isRevenueCatKeyAllowed('ios','goog_abc','native','production'),false);
 assert.equal(isRevenueCatKeyAllowed('android','appl_abc','native','production'),false);
 assert.equal(isRevenueCatKeyAllowed('ios','test_abc','test','production'),false);
});
test('Test Store requires an explicit Staging route; real stores require platform public keys',()=>{
 for(const p of ['ios','android']){
  assert.equal(isRevenueCatKeyAllowed(p,'test_abc','test','staging'),true);
  assert.equal(isRevenueCatKeyAllowed(p,'test_abc',undefined,'staging'),false);
 }
 assert.equal(isRevenueCatKeyAllowed('ios','appl_abc','native','production'),true);
 assert.equal(isRevenueCatKeyAllowed('android','goog_abc','native','production'),true);
 assert.equal(isRevenueCatKeyAllowed('android','goog_abc','native','staging'),true);
});
