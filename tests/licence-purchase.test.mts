import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  authenticStripeEvent, checkout, readPackages, recentLicenceOrders,
  recordStripeEvent, savePackages, stripeTestSettings, type Package,
} from '../netlify/lib/licence-purchase.mts';
import { memoryStore } from './memory-store.mts';

const item: Package = { id: 'standard', name: 'Fictional test package', description: 'Test only', unitAmount: 100, currency: 'aud' };
const origin = 'https://example.test';
const testKey = 'sk_test_' + 'fictional';
const signingKey = 'whsec_' + 'fictional';
const testSettings = { apiKey: testKey, webhookKey: signingKey, origin };
const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_example';

test('catalogue writes are validated and only expose package fields', async () => {
  const store = memoryStore();
  assert.equal(await savePackages(store, [{ ...item, internal: 'ignored' }]), true);
  assert.equal(await savePackages(store, [item, item]), false);
  assert.equal(await savePackages(store, [{ ...item, unitAmount: 10.1 }]), false);
  assert.deepEqual(await readPackages(store), [item]);
});

test('test settings reject live credentials and require an exact HTTPS origin', () => {
  const env = { LICENCE_STRIPE_TEST_KEY: testKey, LICENCE_STRIPE_WEBHOOK_SECRET: signingKey, LICENCE_CHECKOUT_ORIGIN: origin };
  assert.ok(stripeTestSettings(env));
  assert.equal(stripeTestSettings({ ...env, LICENCE_STRIPE_TEST_KEY: 'sk_live_' + 'fictional' }), null);
  assert.equal(stripeTestSettings({ ...env, LICENCE_CHECKOUT_ORIGIN: origin + '/path' }), null);
});

test('webhook verifies the exact body and rejects expired or malformed signatures', () => {
  const timestamp = 1_700_000_000;
  const body = '{"livemode":false}';
  const signature = createHmac('sha256', signingKey).update(timestamp + '.' + body).digest('hex');
  const header = 't=' + timestamp + ',v1=' + signature;
  assert.ok(authenticStripeEvent(body, header, signingKey, timestamp * 1000));
  assert.equal(authenticStripeEvent(body + ' ', header, signingKey, timestamp * 1000), false);
  assert.equal(authenticStripeEvent(body, header, signingKey, (timestamp + 301) * 1000), false);
  assert.equal(authenticStripeEvent(body, 't=' + timestamp + ',v1', signingKey, timestamp * 1000), false);
});

test('checkout snapshots prices and only a matching paid test event marks the order paid', async () => {
  const store = memoryStore();
  let orderId = '';
  const send: typeof fetch = async (url, request) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    const fields = request?.body as URLSearchParams;
    orderId = fields.get('metadata[hnmo_order]')!;
    assert.equal(fields.get('line_items[0][price_data][unit_amount]'), '100');
    assert.equal(new Headers(request?.headers).get('Idempotency-Key'), orderId);
    return Response.json({ id: 'cs_test_example', url: checkoutUrl, livemode: false });
  };
  assert.equal(await checkout(store, item, testSettings, send), checkoutUrl);
  const metadata = { hnmo_order: orderId };
  const event = {
    id: 'evt_testexample', created: 1_700_000_000, type: 'checkout.session.completed', livemode: false,
    data: { object: { id: 'cs_test_example', payment_status: 'paid', amount_total: 100, currency: 'aud', payment_intent: 'pi_example', metadata } },
  };
  const withObject = (changes: object) => ({ ...event, data: { object: { ...event.data.object, ...changes } } });
  assert.equal(await recordStripeEvent(store, withObject({ payment_status: 'unpaid' })), 'ignored');
  assert.equal(await recordStripeEvent(store, withObject({ amount_total: 99 })), 'ignored');
  assert.equal(await recordStripeEvent(store, { ...event, livemode: true }), 'ignored');
  assert.equal((await recentLicenceOrders(store))[0].paid, false);
  const delivery = await Promise.all([recordStripeEvent(store, event), recordStripeEvent(store, event)]);
  assert.deepEqual(delivery, ['applied', 'applied']);
  assert.equal((await store.list({ prefix: 'licence-payments/' })).blobs.length, 1);
  assert.equal((await recentLicenceOrders(store))[0].paid, true);
  for (const type of ['charge.refunded', 'charge.dispute.created']) {
    assert.equal(await recordStripeEvent(store, { ...event, type, data: { object: { payment_intent: 'pi_example' } } }), 'applied');
  }
  assert.equal((await recentLicenceOrders(store))[0].flagged, true);
  assert.equal((await store.list({ prefix: 'licences/' })).blobs.length, 0);
});

test('checkout rejects live sessions and off-provider redirects', async () => {
  for (const [url, livemode] of [[checkoutUrl, true], [origin, false]]) {
    await assert.rejects(checkout(memoryStore(), item, testSettings,
      async () => Response.json({ id: 'cs_test_example', url, livemode })));
  }
});
