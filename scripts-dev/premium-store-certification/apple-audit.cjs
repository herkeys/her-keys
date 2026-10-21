// Read-only Her Keys Apple audit. Credential JSON arrives on stdin from the user's secure store; never echo it.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const APP = '6816197153';
(async () => {
  const credential = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (credential.verifiedBundle !== 'com.herkeys.app') throw Error('wrong_credential_scope');
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ alg: 'ES256', kid: credential.keyIdentifier, typ: 'JWT' }) + '.' + b64({ iss: credential.issuerIdentifier, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const token = payload + '.' + crypto.sign('sha256', Buffer.from(payload), { key: credential.keyP8, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  async function get(endpoint) {
    const response = await fetch('https://api.appstoreconnect.apple.com/v1/' + endpoint, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (!response.ok) return { status: response.status, errors: body.errors?.map(e => ({ code: e.code, title: e.title })) };
    return body;
  }
  const app = await get('apps/' + APP);
  if (app.data?.attributes?.bundleId !== 'com.herkeys.app') throw Error('app_identity_failed');
  const groups = await get('apps/' + APP + '/subscriptionGroups?limit=200');
  const subscriptions = [];
  for (const group of groups.data ?? []) {
    const products = await get('subscriptionGroups/' + group.id + '/subscriptions?limit=200');
    for (const product of products.data ?? []) {
      const id = product.id;
      const availability = await get('subscriptions/' + id + '/subscriptionAvailability');
      const related = availability.data?.relationships?.availableTerritories?.links?.related;
      let territories = null;
      if (related) {
        const url = new URL(related);
        if (url.origin !== 'https://api.appstoreconnect.apple.com' || !url.pathname.startsWith('/v1/subscriptionAvailabilities/')) throw Error('invalid_territory_link');
        territories = await get(url.pathname.slice(4) + '?limit=200');
      }
      subscriptions.push({ id, group: group.id, attributes: product.attributes,
        prices: await get('subscriptions/' + id + '/prices?filter[territory]=USA&include=subscriptionPricePoint,territory&limit=200'),
        introductoryOffers: await get('subscriptions/' + id + '/introductoryOffers?filter[territory]=USA&include=territory&limit=200'),
        availability, territories,
      });
    }
  }
  const report = { observedAt: new Date().toISOString(), source: 'Apple App Store Connect API (read-only)', app: { id: APP, bundle: app.data.attributes.bundleId }, credential: { keyId: credential.keyIdentifier, verified: true }, groups: groups.data, subscriptions };
  const output = path.resolve('docs/audits/premium-store-integration-20261021/evidence/apple-store.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verified: true, products: subscriptions.map(p => ({ id: p.id, ...p.attributes, pricesStatus: p.prices.status ?? 200, offersStatus: p.introductoryOffers.status ?? 200, availabilityStatus: p.availability.status ?? 200 })), output }));
})().catch(() => { console.error('Her Keys Apple audit failed; no credentials were logged.'); process.exitCode = 1; });
