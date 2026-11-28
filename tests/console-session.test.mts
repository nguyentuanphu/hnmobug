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
