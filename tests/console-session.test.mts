// A trusted browser stays signed in: a session lasts 30 days and is renewed while the console is in use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStoreForTests } from '../netlify/lib/hub.mts';
import { sign, unsign, SESSION_DAYS } from '../netlify/lib/auth.mts';
import { memoryStore } from './memory-store.mts';
import consoleFn from '../netlify/functions/console.mts';

process.env.SESSION_SECRET ??= 's'.repeat(40);
process.env.LICENCE_KEY_SECRET ??= 'k'.repeat(40);
process.env.CONSOLE_SLUG ??= 'a1b2c3d4e5f6a7b8';

const ctx = { ip: '203.0.113.9' };
const state = (cookie: string) => consoleFn(new Request(`https://hub.example/c/${process.env.CONSOLE_SLUG}/api/state`, { headers: { Cookie: cookie } }), ctx);
const DAY = 86400_000;

test('a session lasts 30 days and is renewed once it is a day old; a fresh one is left alone; a removed device ends it', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  assert.equal(SESSION_DAYS, 30);
  await store.setJSON('devices/mine', { id: 'mine', name: 'browser', added: '', lastSeen: '' });

  const fresh = await state('hnmo_session=' + sign({ exp: Date.now() + SESSION_DAYS * DAY - 60_000, d: 'mine' }));
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.getSetCookie().length, 0, 'under a day old: no new cookie');

  const old = await state('hnmo_session=' + sign({ exp: Date.now() + 5 * DAY, d: 'mine' }));
  assert.equal(old.status, 200);
  const [renewed] = old.headers.getSetCookie();
  assert.match(renewed, /^hnmo_session=/);
  assert.match(renewed, /Max-Age=2592000/);
  assert.match(renewed, /HttpOnly; Secure; SameSite=Strict/);
  const session = unsign<{ exp: number; d: string }>(decodeURIComponent(renewed.split(';')[0].slice('hnmo_session='.length)));
  assert.equal(session?.d, 'mine');
  assert.ok(session && session.exp > Date.now() + 29 * DAY);

  assert.equal((await state('hnmo_session=' + sign({ exp: Date.now() - 1000, d: 'mine' }))).status, 401, 'expired');
  await store.delete('devices/mine');
  assert.equal((await state('hnmo_session=' + sign({ exp: Date.now() + 5 * DAY, d: 'mine' }))).status, 401, 'removing the device ends its sessions');
});

test('forget: a computer or a request goes, an unpaid order goes, a paid order and bad input stay', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  await store.setJSON('devices/mine', { id: 'mine', name: 'browser', added: '', lastSeen: '' });
  const cookie = 'hnmo_session=' + sign({ exp: Date.now() + 5 * DAY, d: 'mine' });
  const forget = (body: unknown) => consoleFn(new Request(`https://hub.example/c/${process.env.CONSOLE_SLUG}/api/forget`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Console': '1' }, body: JSON.stringify(body),
  }), ctx);
  const machine = '00000000000000aa';
  for (const key of [`hosts/${machine}`, `setups/${machine}`, `marks/${machine}`, `limit-folders/${machine}`, 'requests/req-1', 'shop-orders/o-open', 'shop-orders/o-paid']) {
    await store.setJSON(key, key.startsWith('shop-orders/o-paid') ? { status: 'issued' } : key.startsWith('shop-orders') ? { status: 'expired' } : { id: key });
  }
  assert.equal((await forget({ kind: 'machine', id: machine })).status, 200);
  for (const key of [`hosts/${machine}`, `setups/${machine}`, `marks/${machine}`, `limit-folders/${machine}`]) assert.equal(await store.get(key), null, key);
  assert.equal((await forget({ kind: 'request', id: 'req-1' })).status, 200);
  assert.equal(await store.get('requests/req-1'), null);
  assert.equal((await forget({ kind: 'request', id: 'req-1' })).status, 404, 'already gone');
  assert.equal((await forget({ kind: 'order', id: 'o-open' })).status, 200);
  assert.equal((await forget({ kind: 'order', id: 'o-paid' })).status, 409, 'a paid order stays');
  assert.notEqual(await store.get('shop-orders/o-paid'), null);
  assert.equal((await forget({ kind: 'machine', id: '../licences' })).status, 400);
  assert.equal((await forget({ kind: 'licence', id: 'L-1' })).status, 400, 'licences are withdrawn, not deleted');
  assert.equal((await forget({ kind: 'order', id: '../x' })).status, 404);
});
