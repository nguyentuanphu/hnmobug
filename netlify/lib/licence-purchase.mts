// Test-only licence orders. Payment evidence is separate from licence issuance.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Store } from './hub.mts';

export interface Package {
  id: string;
  name: string;
  description: string;
  currency: 'aud' | 'usd' | 'vnd';
  unitAmount: number;
}

export interface Order {
  id: string;
  package: Package;
  at: string;
  sessionId?: string;
}

const catalogueKey = 'config/licence-packages';
const ordersPrefix = 'licence-orders/';
const orderKey = (id: string) => ordersPrefix + id;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const allowedCurrencies = new Set(['aud', 'usd', 'vnd']);

function isPackage(value: unknown): value is Package {
  if (!value || typeof value !== 'object') return false;
  const item = value as Package;
  return typeof item.id === 'string' && /^[a-z0-9-]{1,40}$/.test(item.id)
    && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 80
    && typeof item.description === 'string' && item.description.trim().length > 0 && item.description.length <= 600
    && allowedCurrencies.has(item.currency)
    && Number.isInteger(item.unitAmount) && item.unitAmount >= 1 && item.unitAmount <= 99_999_999;
}

export function parsePackages(value: unknown): Package[] | null {
  if (!Array.isArray(value) || value.length > 30 || !value.every(isPackage)) return null;
  if (new Set(value.map(item => item.id)).size !== value.length) return null;
  return value.map(({ id, name, description, currency, unitAmount }) => ({ id, name: name.trim(), description: description.trim(), currency, unitAmount }));
}

export async function readPackages(store: Store): Promise<Package[]> {
  return parsePackages(await store.get(catalogueKey, { type: 'json' })) ?? [];
}

export async function savePackages(store: Store, value: unknown): Promise<boolean> {
  const packages = parsePackages(value);
  if (!packages) return false;
  await store.setJSON(catalogueKey, packages);
  return true;
}

export function stripeTestSettings(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.LICENCE_STRIPE_TEST_KEY ?? '';
  const webhookKey = env.LICENCE_STRIPE_WEBHOOK_SECRET ?? '';
  const configuredOrigin = env.LICENCE_CHECKOUT_ORIGIN ?? '';
  let origin: string;
  try {
    const url = new URL(configuredOrigin);
    if (url.protocol !== 'https:' || url.origin !== configuredOrigin) return null;
    origin = url.origin;
  } catch {
    return null;
  }

  return /^(sk|rk)_test_[A-Za-z0-9]+$/.test(apiKey) && /^whsec_[A-Za-z0-9]+$/.test(webhookKey)
    ? { apiKey, webhookKey, origin }
    : null;
}

export async function checkout(
  store: Store,
  item: Package,
  settings: NonNullable<ReturnType<typeof stripeTestSettings>>,
  send: typeof fetch = fetch,
): Promise<string> {
  const order: Order = { id: randomUUID(), package: item, at: new Date().toISOString() };
  await store.setJSON(orderKey(order.id), order);
  const fields = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': item.currency,
    'line_items[0][price_data][unit_amount]': String(item.unitAmount),
    'line_items[0][price_data][product_data][name]': item.name,
    'metadata[hnmo_order]': order.id,
    'payment_intent_data[metadata][hnmo_order]': order.id,
    success_url: settings.origin + '/packages.html?checkout=returned&order=' + order.id,
    cancel_url: settings.origin + '/packages.html?checkout=cancelled',
  });
  const result = await send('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + settings.apiKey,
      'Idempotency-Key': order.id,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: fields,
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new Error('checkout unavailable');
  const data = await result.json() as { id?: string; url?: string; livemode?: boolean };
  if (data.livemode !== false || !/^cs_test_[A-Za-z0-9]+$/.test(data.id ?? '') || !data.url) {
    throw new Error('invalid test session');
  }

  const url = new URL(data.url);
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password) throw new Error('invalid checkout URL');
  await store.setJSON(orderKey(order.id), { ...order, sessionId: data.id });
  return url.href;
}

export function authenticStripeEvent(raw: string, header: string, key: string, now = Date.now()): boolean {
  const parts = header.split(',').map(part => part.trim().split('=', 2));
  const stamps = parts.filter(([name]) => name === 't').map(([, value]) => value);
  if (stamps.length !== 1 || !/^\d{1,12}$/.test(stamps[0])) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(stamps[0])) > 300) return false;
  const hmac = createHmac('sha256', key).update(stamps[0] + '.' + raw).digest();
  return parts.some(([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/i.test(value)
    && timingSafeEqual(hmac, Buffer.from(value, 'hex')));
}

export async function recordStripeEvent(store: Store, event: unknown): Promise<'applied' | 'ignored' | 'retry'> {
  if (!event || typeof event !== 'object') return 'ignored';
  const supplied = event as {
    type?: string; livemode?: boolean; id?: string; created?: number;
    data?: { object?: {
      id?: string; metadata?: { hnmo_order?: string }; currency?: string;
      amount_total?: number; payment_status?: string; payment_intent?: string;
    } };
  };
  if (supplied.livemode !== false || typeof supplied.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(supplied.id)
    || !Number.isInteger(supplied.created) || supplied.created! < 1 || supplied.created! > 4_000_000_000) return 'ignored';
  const object = supplied.data?.object;
  if (!object) return 'ignored';
  const id = object.metadata?.hnmo_order;
  const intent = object.payment_intent;
  const at = new Date(supplied.created! * 1000).toISOString();
  if (supplied.type === 'charge.refunded' || supplied.type === 'charge.dispute.created') {
    if (typeof intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(intent)) return 'ignored';
    const known = await store.get('licence-payment-intents/' + intent);
    const orderId = typeof known === 'string' && idPattern.test(known) ? known : id;
    if (typeof orderId !== "string" || !idPattern.test(orderId) || !await store.get(orderKey(orderId))) return 'ignored';
    await store.setJSON('licence-payment-flags/' + orderId + '/' + supplied.id, { at, kind: supplied.type });
    return 'applied';
  }

  if (supplied.type !== 'checkout.session.completed' && supplied.type !== 'checkout.session.async_payment_succeeded') return 'ignored';
  if (typeof id !== 'string' || !idPattern.test(id) || object.payment_status !== 'paid') return 'ignored';
  const order = await store.get(orderKey(id), { type: 'json' }) as Order | null;
  if (!order) return 'ignored';
  if (!order.sessionId) return 'retry';
  if (order.sessionId !== object.id || order.package.currency !== object.currency
    || order.package.unitAmount !== object.amount_total || typeof intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(intent)) {
    return 'ignored';
  }

  await store.set('licence-payment-intents/' + intent, id);
  await store.setJSON('licence-payments/' + id + '/' + supplied.id, { at, intent });
  return 'applied';
}

export async function recentLicenceOrders(store: Store) {
  const { blobs } = await store.list({ prefix: ordersPrefix });
  const rows = await Promise.all(blobs.map(async b => await store.get(b.key, { type: 'json' }) as Order | null));
  const recent = rows.filter((row): row is Order => row !== null)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 50);
  return Promise.all(recent.map(async order => {
    const [payments, flags] = await Promise.all([
      store.list({ prefix: 'licence-payments/' + order.id + '/' }),
      store.list({ prefix: 'licence-payment-flags/' + order.id + '/' }),
    ]);
    return { id: order.id, package: order.package, at: order.at, paid: payments.blobs.length > 0, flagged: flags.blobs.length > 0 };
  }));
}
