// The older test orders (kept for the console's list) and the Stripe signature check the shop still uses.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import type { Package } from '../netlify/lib/licence-purchase.mts';
import { listLicenceOrders } from '../netlify/lib/licence-orders.mts';
import { authenticStripeEvent } from '../netlify/lib/shop.mts';
import { memoryStore } from './memory-store.mts';

const item: Package = { id: 'standard', name: 'Fictional test package', description: 'Test only', unitAmount: 100, currency: 'aud' };
const signingKey = 'whsec_' + 'fictional';

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

test('orders filter Sydney calendar days across summer and winter offsets', async () => {
  const store = memoryStore();
  const examples = [
    ['summer-before', '2026-11-23T12:59:59Z'],
    ['summer-start', '2026-11-23T13:00:00Z'],
    ['summer-end', '2026-11-24T12:59:59Z'],
    ['summer-after', '2026-11-24T13:00:00Z'],
    ['winter-before', '2026-06-23T13:59:59Z'],
    ['winter-start', '2026-06-23T14:00:00Z'],
  ];
  for (const [id, at] of examples) await store.setJSON('licence-orders/' + id, { id, at, package: item });
  const summer = await listLicenceOrders(store, { from: '2026-11-24', to: '2026-11-24' }, 1);
  assert.deepEqual(summer.orders.map(order => order.id), ['summer-end', 'summer-start']);
  const winter = await listLicenceOrders(store, { from: '2026-06-24', to: '2026-06-24' }, 1);
  assert.deepEqual(winter.orders.map(order => order.id), ['winter-start']);
});

test('order status filters match older pages and give review priority over payment evidence', async () => {
  const store = memoryStore();
  for (let i = 0; i < 55; i++) {
    const id = 'order-' + i;
    await store.setJSON('licence-orders/' + id, { id, at: new Date(Date.UTC(2026, 10, 24, 0, i)).toISOString(), package: item });
  }
  await store.setJSON('licence-payments/order-1/event', {});
  await store.setJSON('licence-payments/order-2/event', {});
  await store.setJSON('licence-payment-flags/order-2/event', {});
  const latest = await listLicenceOrders(store, {}, 1);
  assert.equal(latest.orders.length, 50);
  assert.equal(latest.hasMore, true);
  const second = await listLicenceOrders(store, {}, 2);
  assert.equal(second.orders.length, 5);
  assert.equal(second.hasMore, false);
  assert.equal(second.orders.at(-1)?.id, 'order-0');
  const pending = await listLicenceOrders(store, { status: 'pending' }, 2);
  assert.deepEqual(pending.orders.map(order => order.id), ['order-4', 'order-3', 'order-0']);
  assert.deepEqual((await listLicenceOrders(store, { status: 'verified' }, 1)).orders.map(order => order.id), ['order-1']);
  assert.deepEqual((await listLicenceOrders(store, { status: 'review' }, 1)).orders.map(order => order.id), ['order-2']);
});
