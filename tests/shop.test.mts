// The licence shop, without Netlify and without any payment provider: the catalogue, checkout for a server's own request
// (Stripe, PayOS and a bank transfer), the signed webhooks issuing, renewing and withdrawing a licence, the trial, add-ons,
// the automatic error key and the CDN caching of public answers. Fake providers answer over a stubbed fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { checkLicence } from '../netlify/lib/license.mts';
import { licenceKeys, useStoreForTests } from '../netlify/lib/hub.mts';
import { usePurgerForTests } from '../netlify/lib/cdn.mts';
import { sign as signSession } from '../netlify/lib/auth.mts';
import {
  DEFAULT_CATALOGUE, authenticPayos, forSale, listOrders, markTransferPaid, parseCatalogue, payosSignature, readCatalogue,
  payosFor, paymentStatus, providers, savePayos, saveCatalogue, TRANSFER_DAYS, type Package, type ShopOrder,
} from '../netlify/lib/shop.mts';
import { memoryStore } from './memory-store.mts';
import shopFn from '../netlify/functions/licence-packages.mts';
import webhookFn from '../netlify/functions/licence-stripe.mts';
import requestFn from '../netlify/functions/report.mts';
import setupFn from '../netlify/functions/setup.mts';
import weeklyFn from '../netlify/functions/weekly.mts';
import latestFn from '../netlify/functions/latest.mts';
import consoleFn from '../netlify/functions/console.mts';

process.env.SESSION_SECRET ??= 's'.repeat(40);
process.env.LICENCE_KEY_SECRET ??= 'k'.repeat(40);
process.env.CONSOLE_SLUG ??= 'a1b2c3d4e5f6a7b8';

const MACHINE = '8e5abdd396d53501';
const OTHER = '1f2e3d4c5b6a7980';
const ctx = { ip: '203.0.113.9' };
const STRIPE_KEY = 'sk_test_' + 'fixture';
const STRIPE_HOOK = 'whsec_' + 'fixture';
const PAYOS = { PAYOS_CLIENT_ID: 'fixture-client', PAYOS_API_KEY: 'fixture-api-key', PAYOS_CHECKSUM_KEY: 'fixture-checksum-key-0123456789' };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://hub.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const plus = (days: number) => new Date(Date.parse(today() + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

function priced(): Package[] {
  return DEFAULT_CATALOGUE.map(p => p.kind === 'trial' ? p : { ...p, prices: { vnd: 500_000, aud: 3_000 } });
}

/** A fresh store, the env for the providers, a stubbed fetch, and the purges recorded. */
function setup(t: { after(fn: () => void): void }, env: Record<string, string> = {}) {
  const store = memoryStore();
  useStoreForTests(store);
  const saved = { ...process.env };
  Object.assign(process.env, { LICENCE_STRIPE_TEST_KEY: STRIPE_KEY, LICENCE_STRIPE_WEBHOOK_SECRET: STRIPE_HOOK, ...PAYOS, ...env });
  const purged: string[][] = [];
  usePurgerForTests(async tags => { purged.push(tags); });
  const calls: { url: string; body: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? '');
    calls.push({ url, body });
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      const order = new URLSearchParams(body).get('metadata[hnmo_order]');
      return Response.json({ id: 'cs_test_' + order!.replaceAll('-', ''), url: 'https://checkout.stripe.com/c/pay/cs_test_fixture', livemode: false });
    }
    if (url === 'https://api-merchant.payos.vn/v2/payment-requests') {
      const sent = JSON.parse(body) as { orderCode: number; amount: number };
      return Response.json({ code: '00', desc: 'success', data: { checkoutUrl: 'https://pay.payos.vn/web/fixture', orderCode: sent.orderCode, amount: sent.amount } });
    }
    return new Response('no network in tests', { status: 599 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    usePurgerForTests(null);
    useStoreForTests(null);
  });
  return { store, purged, calls };
}

async function ask(machine = MACHINE, token = 'tok'.padEnd(32, 'x')): Promise<{ request: string; token: string }> {
  const response = await requestFn(post('/api/request', { machine, name: 'Fixture host', contact: '', players: 50, message: '', token }), ctx);
  assert.equal(response.status, 200);
  return { request: ((await response.json()) as { request: string }).request, token };
}

const poll = async (machine: string, auth: { request: string; token: string }, extra: object = {}) =>
  (await requestFn(post('/api/licence', { machine, ...auth, ...extra }), ctx)).json() as Promise<{ status: string; licence: string | null; retryAfterSeconds?: number; autoErrorKey?: string }>;

function stripeHook(event: object) {
  const body = JSON.stringify(event);
  const stamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', STRIPE_HOOK).update(`${stamp}.${body}`).digest('hex');
  return webhookFn(new Request('https://hub.example/api/licence-stripe', { method: 'POST', headers: { 'stripe-signature': `t=${stamp},v1=${signature}` }, body }));
}

async function onlyOrder(store: ReturnType<typeof memoryStore>): Promise<ShopOrder> {
  const orders = await listOrders(store);
  assert.equal(orders.length >= 1, true);
  return orders[0];
}

test('the catalogue starts with every package and no price; only priced ones (and the trial) are for sale', async () => {
  const store = memoryStore();
  const catalogue = await readCatalogue(store);
  assert.equal(catalogue, DEFAULT_CATALOGUE);
  assert.ok(catalogue.every(p => Object.keys(p.prices).length === 0));
  assert.deepEqual(forSale(catalogue).map(p => p.id), ['trial-14']);
  assert.equal(parseCatalogue(DEFAULT_CATALOGUE)?.length, DEFAULT_CATALOGUE.length);
  // The first catalogue (name, description, currency, unitAmount) is still read, as a lifetime plan.
  const old = parseCatalogue([{ id: 'old', name: 'Old', description: 'Old one', currency: 'vnd', unitAmount: 150000 }]);
  assert.deepEqual(old?.[0].prices, { vnd: 150000 });
  assert.equal(old?.[0].billing, 'lifetime');
  // Wrong packages are refused: a monthly plan without days, an upgrade to no plan, a strange currency, two trials.
  const monthly = DEFAULT_CATALOGUE.find(p => p.id === 'starter-month')!;
  assert.equal(parseCatalogue([{ ...monthly, durationDays: null }]), null);
  assert.equal(parseCatalogue([DEFAULT_CATALOGUE.find(p => p.addon === 'upgrade')!]), null);
  assert.equal(parseCatalogue([{ ...monthly, prices: { eur: 5 } }]), null);
  assert.equal(parseCatalogue([DEFAULT_CATALOGUE[0], { ...DEFAULT_CATALOGUE[0], id: 'trial-2' }]), null);
  assert.equal(await saveCatalogue(store, priced()), true);
  assert.equal(forSale(await readCatalogue(store)).length, DEFAULT_CATALOGUE.length);
});

test('GET /api/licence-packages is the same for everyone and stays on the CDN; saving the packages purges it', async t => {
  const { store, purged } = setup(t, { UPDATES_URL: 'https://files.example.test' });
  await saveCatalogue(store, priced());
  const response = await shopFn(new Request('https://hub.example/api/licence-packages'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Netlify-CDN-Cache-Control') ?? '', /public, durable, max-age=86400, stale-while-revalidate=604800/);
  assert.equal(response.headers.get('Netlify-Cache-Tag'), 'licence-packages');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  const body = await response.json() as { packages: Package[]; providers: Record<string, boolean> };
  assert.deepEqual(body.providers, { stripe: true, payos: true, bank: false });
  assert.equal(body.packages[0].id, 'trial-14');
  assert.doesNotMatch(JSON.stringify(body), new RegExp(MACHINE));
  assert.equal((await shopFn(post('/api/licence-packages', { packageId: 'starter-year' }))).status, 410);

  await store.setJSON('devices/fixture', { id: 'fixture' });
  const cookie = 'hnmo_session=' + signSession({ d: 'fixture', exp: Date.now() + 60_000 });
  const consolePost = (action: string, body: unknown) => consoleFn(post(`/c/${process.env.CONSOLE_SLUG}/api/${action}`, body, { Cookie: cookie, 'X-Console': '1' }), ctx);
  assert.equal((await consolePost('licence-commerce', { packages: priced() })).status, 200);
  assert.equal((await consolePost('shop-bank', { bank: { bin: '970436', account: '0123456789', accountName: 'Nguyen Van Fixture' } })).status, 200);
  assert.equal((await consolePost('shop-bank', { bank: { bin: '97043', account: '1', accountName: '' } })).status, 400);
  assert.equal((await consolePost('latest', { tag: '1.0.1', url: '', notes: '' })).status, 200);
  assert.deepEqual(purged, [['licence-packages'], ['licence-packages'], ['latest']]);

  const latest = await latestFn(new Request('https://hub.example/api/latest'));
  assert.equal(latest.headers.get('Netlify-Cache-Tag'), 'latest');
  const download = await latestFn(new Request('https://hub.example/download?os=macos'));
  assert.equal(download.headers.get('Netlify-Vary'), 'query=os');
  assert.match(download.headers.get('Netlify-CDN-Cache-Control') ?? '', /durable/);
});

test('checkout is only for the server that made the request; a paid Stripe checkout signs the licence by itself', async t => {
  const { store, calls } = setup(t);
  await saveCatalogue(store, priced());
  const auth = await ask();
  const checkout = (body: object) => shopFn(post('/api/licence-checkout', { machine: MACHINE, ...auth, packageId: 'standard-year', currency: 'aud', provider: 'stripe', ...body }));
  assert.equal((await checkout({ token: 'wrong'.padEnd(32, 'x') })).status, 404);
  assert.equal((await checkout({ machine: OTHER })).status, 404);
  assert.equal((await checkout({ packageId: 'nothing' })).status, 404);
  assert.equal((await checkout({ currency: 'usd' })).status, 400, 'no USD price');
  assert.equal((await checkout({ provider: 'payos' })).status, 400, 'PayOS is VND only');
  assert.equal((await checkout({ packageId: 'players-100' })).status, 409, 'an add-on needs a licence first');

  const answer = await checkout({});
  assert.equal(answer.status, 200);
  const { url, order } = await answer.json() as { url: string; order: string };
  assert.equal(url, 'https://checkout.stripe.com/c/pay/cs_test_fixture');
  const sent = new URLSearchParams(calls.at(-1)!.body);
  assert.equal(sent.get('mode'), 'subscription');
  assert.equal(sent.get('line_items[0][price_data][recurring][interval]'), 'year');
  assert.equal(sent.get('line_items[0][price_data][unit_amount]'), '3000');
  assert.equal((await poll(MACHINE, auth)).retryAfterSeconds, 30, 'while paying: ask again soon');

  const session = { id: 'cs_test_' + order.replaceAll('-', ''), object: 'checkout.session', metadata: { hnmo_order: order }, currency: 'aud', amount_total: 3000, payment_status: 'paid', payment_intent: null, subscription: 'sub_fixture' };
  const paid = { id: 'evt_paid', type: 'checkout.session.completed', livemode: false, data: { object: session } };
  assert.equal((await stripeHook({ ...paid, data: { object: { ...session, amount_total: 1 } } })).status, 200);
  assert.equal((await poll(MACHINE, auth)).status, 'open', 'a wrong amount issues nothing');
  assert.equal((await stripeHook({ ...paid, livemode: true })).status, 200);
  assert.equal((await poll(MACHINE, auth)).status, 'open', 'a live event on test keys issues nothing');
  const bad = await webhookFn(new Request('https://hub.example/api/licence-stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=' + '0'.repeat(64) }, body: JSON.stringify(paid) }));
  assert.equal(bad.status, 400);

  assert.equal((await stripeHook(paid)).status, 200);
  assert.equal((await stripeHook(paid)).status, 200, 'the same event twice is fine');
  const issued = await poll(MACHINE, auth);
  assert.equal(issued.status, 'issued');
  assert.equal(issued.retryAfterSeconds, undefined);
  const licence = checkLicence(issued.licence, today(), await licenceKeys(store));
  assert.equal(licence.valid, true);
  assert.ok(licence.valid && licence.maxPlayers === 200 && licence.machine === MACHINE && licence.expires === plus(366));
  assert.equal((await listOrders(store)).filter(o => o.status === 'issued').length, 1);

  // A renewal invoice extends from the current end; the first invoice of the subscription doesn't count twice.
  const invoice = (id: string, reason: string) => ({ id, type: 'invoice.paid', livemode: false, data: { object: { id: 'in_' + id, object: 'invoice', subscription: 'sub_fixture', billing_reason: reason, payment_intent: 'pi_' + id } } });
  await stripeHook(invoice('evt_first', 'subscription_create'));
  await stripeHook(invoice('evt_renew', 'subscription_cycle'));
  await stripeHook(invoice('evt_renew', 'subscription_cycle'));
  const renewed = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(renewed.valid && renewed.expires === plus(366 * 2) && renewed.id === (licence.valid ? licence.id : ''));

  // A refund of a renewal withdraws the licence (the weekly report then answers revoked).
  await stripeHook({ id: 'evt_refund', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_x', payment_intent: 'pi_evt_renew' } } });
  const record = await store.get(`licences/${renewed.valid ? renewed.id : ''}`, { type: 'json' }) as { revoked: string | null };
  assert.ok(record.revoked);
  assert.equal((await onlyOrder(store)).status, 'refunded');
});

test('PayOS: the payment link for a VND order; only a webhook with the right signature and amount issues', async t => {
  const { store, calls } = setup(t);
  // The documentation's own sample is verified as the documentation says.
  const sample = { orderCode: 123, amount: 3000, description: 'VQRIO123', accountNumber: '12345678', reference: 'TF230204212323', transactionDateTime: '2023-02-04 18:25:00', currency: 'VND', paymentLinkId: '124c33293c43417ab7879e14c8d9eb18', code: '00', desc: 'Thành công', counterAccountBankId: '', counterAccountBankName: '', counterAccountName: '', counterAccountNumber: '', virtualAccountName: '', virtualAccountNumber: '' };
  assert.equal(authenticPayos(sample, '412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03', '1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675'), true);

  await saveCatalogue(store, priced());
  const auth = await ask();
  const answer = await shopFn(post('/api/licence-checkout', { machine: MACHINE, ...auth, packageId: 'pro-lifetime', currency: 'vnd', provider: 'payos' }));
  assert.equal(answer.status, 200);
  assert.equal(((await answer.json()) as { url: string }).url, 'https://pay.payos.vn/web/fixture');
  const sent = JSON.parse(calls.at(-1)!.body) as { orderCode: number; amount: number; description: string; signature: string; cancelUrl: string; returnUrl: string };
  assert.equal(sent.amount, 500_000);
  assert.ok(sent.description.length <= 9);
  const { signature, ...rest } = sent;
  assert.equal(signature, payosSignature({ amount: rest.amount, cancelUrl: rest.cancelUrl, description: rest.description, orderCode: rest.orderCode, returnUrl: rest.returnUrl }, PAYOS.PAYOS_CHECKSUM_KEY));

  const data = { ...sample, orderCode: sent.orderCode, amount: sent.amount, reference: 'FT-FIXTURE' };
  const hook = (body: object) => webhookFn(post('/api/licence-payos', body));
  assert.equal((await hook({ code: '00', success: true, data, signature: 'f'.repeat(64) })).status, 400);
  assert.equal((await poll(MACHINE, auth)).status, 'open');
  const short = { ...data, amount: 1 };
  assert.equal((await hook({ code: '00', success: true, data: short, signature: payosSignature(short, PAYOS.PAYOS_CHECKSUM_KEY) })).status, 200);
  assert.equal((await poll(MACHINE, auth)).status, 'open', 'a wrong amount issues nothing');
  const good = { code: '00', success: true, data, signature: payosSignature(data, PAYOS.PAYOS_CHECKSUM_KEY) };
  assert.equal((await hook(good)).status, 200);
  assert.equal((await hook(good)).status, 200);
  const licence = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 1000 && licence.expires === null);
  assert.equal((await listOrders(store)).length, 1);
});

test('a bank transfer: the server gets the account, amount and note; the owner marks it paid; unpaid ones end', async t => {
  const { store } = setup(t);
  await saveCatalogue(store, priced());
  const auth = await ask();
  const checkout = () => shopFn(post('/api/licence-checkout', { machine: MACHINE, ...auth, packageId: 'starter-month', currency: 'vnd', provider: 'bank' }));
  assert.equal((await checkout()).status, 503, 'no bank set yet');
  await store.setJSON('config/bank', { bin: '970436', account: '0123456789', accountName: 'NGUYEN VAN FIXTURE', notePrefix: 'HNMO' });
  const answer = await checkout();
  assert.equal(answer.status, 200);
  const body = await answer.json() as { order: string; bank: { bin: string; account: string; accountName: string }; amount: number; note: string; url?: string };
  assert.deepEqual(body.bank, { bin: '970436', account: '0123456789', accountName: 'NGUYEN VAN FIXTURE' });
  assert.equal(body.amount, 500_000);
  assert.match(body.note, /^HNMO[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  assert.equal(body.url, undefined, 'no QR image or page from the hub');
  assert.equal((await poll(MACHINE, auth)).retryAfterSeconds, 3600);

  await store.setJSON('devices/fixture', { id: 'fixture' });
  const cookie = 'hnmo_session=' + signSession({ d: 'fixture', exp: Date.now() + 60_000 });
  const paid = await consoleFn(post(`/c/${process.env.CONSOLE_SLUG}/api/shop-order-paid`, { order: body.order }, { Cookie: cookie, 'X-Console': '1' }), ctx);
  assert.equal(paid.status, 200);
  const licence = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 50 && licence.expires === plus(31));
  assert.equal((await consoleFn(post(`/c/${process.env.CONSOLE_SLUG}/api/shop-order-paid`, { order: body.order }, { Cookie: cookie, 'X-Console': '1' }), ctx)).status, 409, 'not twice');

  // An order left unpaid for 7 days ends and can't be marked paid any more.
  const second = await (await checkout()).json() as { order: string };
  const order = await store.get(`shop-orders/${second.order}`, { type: 'json' }) as ShopOrder;
  await store.setJSON(`shop-orders/${second.order}`, { ...order, at: new Date(Date.now() - (TRANSFER_DAYS + 1) * 86_400_000).toISOString() });
  await assert.rejects(markTransferPaid(store, second.order), /expired/);
  assert.equal((await store.get(`shop-orders/${second.order}`, { type: 'json' }) as ShopOrder).status, 'expired');
});

test('the trial comes at once, once per computer, and never after a paid licence', async t => {
  const { store } = setup(t);
  const auth = await ask();
  const trial = (machine: string, a: object) => shopFn(post('/api/licence-trial', { machine, ...a }));
  assert.equal((await trial(MACHINE, { ...auth, token: 'x'.repeat(32) })).status, 404);
  const first = await trial(MACHINE, auth);
  assert.equal(first.status, 200);
  const licence = checkLicence(((await first.json()) as { licence: string }).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 100 && licence.expires === plus(14) && licence.machine === MACHINE);
  assert.equal((await trial(MACHINE, auth)).status, 409);
  const again = await ask(MACHINE, 'two'.padEnd(32, 'y'));
  assert.equal((await trial(MACHINE, again)).status, 409, 'a new request of the same computer gets no second trial');
  const other = await ask(OTHER, 'oth'.padEnd(32, 'z'));
  await store.set(`machine-licences/${OTHER}`, 'L-paid');
  assert.equal((await trial(OTHER, other)).status, 409, 'a computer with a paid licence gets no trial');
});

test('add-ons: more players on the same licence; a move to another computer comes with that computer\'s request', async t => {
  const { store } = setup(t);
  await saveCatalogue(store, priced());
  await store.setJSON('config/bank', { bin: '970436', account: '0123456789', accountName: 'NGUYEN VAN FIXTURE', notePrefix: 'HNMO' });
  const auth = await ask();
  const buy = async (packageId: string, extra: object = {}) => {
    const { order } = await (await shopFn(post('/api/licence-checkout', { machine: MACHINE, ...auth, packageId, currency: 'vnd', provider: 'bank', ...extra }))).json() as { order: string };
    await markTransferPaid(store, order);
  };
  await buy('starter-year');
  await buy('players-100');
  let licence = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 150);
  await buy('upgrade-to-pro');
  licence = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 1100 && licence.expires === plus(366), 'the upgrade keeps the bought players and the end date');
  const firstId = licence.valid ? licence.id : '';

  await buy('move', { toMachine: OTHER });
  assert.ok((await store.get(`licences/${firstId}`, { type: 'json' }) as { revoked: string | null }).revoked, 'the old computer\'s licence is withdrawn');
  const newComputer = await ask(OTHER, 'new'.padEnd(32, 'n'));
  const moved = checkLicence((await poll(OTHER, newComputer)).licence, today(), await licenceKeys(store));
  assert.ok(moved.valid && moved.machine === OTHER && moved.maxPlayers === 1100 && moved.expires === plus(366));
});

test('the automatic error key: given with the first setup answer, checked by the weekly report, renewed on request', async t => {
  const { store } = setup(t);
  delete process.env.AUTO_ERROR_FORWARD_KEYS;
  const report = { machine: MACHINE, system: { os: 'Linux', arch: 'x64', cpu: 'Fixture', cores: 4, ramGb: 8, diskFreeGb: 50, hnmo: '1.0.1', dotnet: '10' }, game: { name: 'Fixture', servers: 1, seasons: ['s6'], address: '', language: 'vi' }, host: { name: '', contact: '' } };
  const first = await (await setupFn(post('/api/setup', report), ctx)).json() as { autoErrorKey?: string };
  assert.ok(first.autoErrorKey && first.autoErrorKey.length >= 32);
  const second = await (await setupFn(post('/api/setup', report), ctx)).json() as { autoErrorKey?: string };
  assert.equal(second.autoErrorKey, undefined, 'only the first time');
  assert.doesNotMatch([...store.data.values()].join(' '), new RegExp(first.autoErrorKey!), 'only its hash is kept');

  const auto = { kind: 'auto-error', approval: 'a'.repeat(32), season: 's6', errorKind: 'error', fingerprint: 'error|main.js|12', count: 2 };
  const weekly = (key: string) => weeklyFn(post('/api/weekly', { machine: MACHINE, version: '1.0.1', os: 'Linux', players: {}, health: {}, features: {}, bugs: [], autoErrors: [auto] }, { 'X-Hnmo-Auto-Error-Key': key }), ctx);
  assert.equal((await weekly('b'.repeat(43))).status, 403);
  const accepted = await weekly(first.autoErrorKey!);
  assert.equal(accepted.status, 200);
  assert.deepEqual(((await accepted.json()) as { autoAccepted: string[] }).autoAccepted, [auto.approval]);

  const auth = await ask();
  const renewed = await poll(MACHINE, auth, { needAutoErrorKey: true });
  assert.ok(renewed.autoErrorKey && renewed.autoErrorKey !== first.autoErrorKey);
  await store.delete(`hosts/${MACHINE}`);
  assert.equal((await weekly(first.autoErrorKey!)).status, 403, 'the old key stops working');
});

test('a paid order whose licence failed to issue gets it on the next try, once', async t => {
  const { store } = setup(t);
  await saveCatalogue(store, priced());
  await store.setJSON('config/bank', { bin: '970436', account: '0123456789', accountName: 'NGUYEN VAN FIXTURE', notePrefix: 'HNMO' });
  const auth = await ask();
  const answer = await (await shopFn(post('/api/licence-checkout', { machine: MACHINE, ...auth, packageId: 'starter-month', currency: 'vnd', provider: 'bank' }))).json() as { order: string };
  // The order was saved as paid, then the issue broke off (the store or the function stopped).
  const order = await store.get(`shop-orders/${answer.order}`, { type: 'json' }) as ShopOrder;
  await store.setJSON(`shop-orders/${answer.order}`, { ...order, status: 'paid', paidAt: new Date().toISOString() });
  assert.equal((await poll(MACHINE, auth)).licence ?? null, null);

  const again = await markTransferPaid(store, answer.order);
  assert.ok(again.issuedAt && again.licenceId, 'issued on the second click');
  const licence = checkLicence((await poll(MACHINE, auth)).licence, today(), await licenceKeys(store));
  assert.ok(licence.valid && licence.maxPlayers === 50);
  await assert.rejects(markTransferPaid(store, answer.order), /not waiting/, 'and not a second time');
});

test('PayOS keys typed in the console are kept encrypted, read back for checkout, and never shown', async () => {
  const store = memoryStore();
  const none = {} as NodeJS.ProcessEnv;
  assert.equal(await payosFor(store, none), null);
  assert.equal((await providers(store, none)).payos, false);

  assert.equal(await savePayos(store, { clientId: 'short', apiKey: 'apikey-12345678', checksumKey: 'checksum-1234567890abcdef' }), false, 'too short');
  assert.equal(await savePayos(store, { clientId: 'client-12345678', apiKey: 'api key 12345678', checksumKey: 'checksum-1234567890abcdef' }), false, 'spaces');
  const keys = { clientId: 'client-12345678', apiKey: 'apikey-12345678', checksumKey: 'checksum-1234567890abcdef' };
  assert.equal(await savePayos(store, keys), true);

  const stored = JSON.stringify(await store.get('config/payos', { type: 'json' }));
  for (const secret of Object.values(keys)) assert.ok(!stored.includes(secret), 'the store holds no plain key');
  assert.deepEqual(await payosFor(store, none), keys);
  assert.equal((await providers(store, none)).payos, true);
  const status = await paymentStatus(store, none);
  assert.deepEqual([status.payos, status.payosClientTail], ['console', '5678']);
  assert.ok(!JSON.stringify(status).includes('apikey'), 'the console never gets the keys back');

  const site = { PAYOS_CLIENT_ID: 'site-client-0001', PAYOS_API_KEY: 'site-apikey-0001', PAYOS_CHECKSUM_KEY: 'site-checksum-0123456789' } as NodeJS.ProcessEnv;
  assert.equal((await payosFor(store, site))?.clientId, 'site-client-0001', 'the site settings win');
  assert.equal((await paymentStatus(store, site)).payos, 'site');

  assert.equal(await savePayos(store, null), true);
  assert.equal(await payosFor(store, none), null, 'removed');
});
