// One folder per computer: what the hub notes, flags and answers; the switch is off until the owner turns it on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { checkLicence } from '../netlify/lib/license.mts';
import { useStoreForTests } from '../netlify/lib/hub.mts';
import { cleanFolder, listLimitFlags, readLimits, saveLimits, setFlagAside } from '../netlify/lib/limits.mts';
import { issueOrder, readCatalogue, type ShopOrder } from '../netlify/lib/shop.mts';
import { memoryStore } from './memory-store.mts';
import setupFn from '../netlify/functions/setup.mts';
import weeklyFn from '../netlify/functions/weekly.mts';

process.env.SESSION_SECRET ??= 's'.repeat(40);
process.env.LICENCE_KEY_SECRET ??= 'k'.repeat(40);

const post = (path: string, body: unknown) =>
  new Request(`https://hub.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const setup = (machine: string, folder: string | undefined, licence?: string) => ({
  machine, folder, ...(licence ? { licence } : {}), fingerprint: `fp-${machine}`,
  system: { os: 'Windows 11', arch: 'X64', cpu: 'Ryzen', cores: 8, ramGb: 16, dotnet: '10.0' },
  game: { name: 'S', servers: [0], seasons: ['s6'], publicAddress: '', language: 'vi-VN' },
});

test('the switch is off until the owner turns it on, and a folder id must be 16 hex digits', async () => {
  const store = memoryStore();
  assert.deepEqual(await readLimits(store), { enforce: false });
  assert.deepEqual(await saveLimits(store, true), { enforce: true });
  assert.deepEqual(await readLimits(store), { enforce: true });
  assert.equal(cleanFolder('0123456789ABCDEF'), '0123456789abcdef');
  for (const bad of ['', 'xyz', '0123456789abcde', 123, null, '0123456789abcdef0']) assert.equal(cleanFolder(bad), '');
});

test('two folders of one computer are flagged, one is not; a licence with more folders allows them', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  const machine = '1111222233334444';

  await setupFn(post('/api/setup', setup(machine, 'aaaaaaaaaaaaaaaa')), { ip: '203.0.113.5' });
  assert.deepEqual(await listLimitFlags(store), [], 'one folder');
  await setupFn(post('/api/setup', setup(machine, 'bbbbbbbbbbbbbbbb')), { ip: '203.0.113.5' });
  const flags = await listLimitFlags(store);
  assert.equal(flags.length, 1);
  assert.deepEqual([flags[0].kind, flags[0].subject, flags[0].count, flags[0].allowed], ['folders', machine, 2, 1]);

  // Setting it aside hides it until a third folder shows up.
  assert.equal(await setFlagAside(store, flags[0].key), true);
  assert.deepEqual(await listLimitFlags(store), []);
  await setupFn(post('/api/setup', setup(machine, 'cccccccccccccccc')), { ip: '203.0.113.5' });
  assert.equal((await listLimitFlags(store))[0]?.count, 3);
  assert.equal(await setFlagAside(store, 'folders-nothing00'), false);

  // A licence for two folders allows two: the hub reads `folders` from the signed file.
  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const file = signLicence({ licensee: 'Two', maxPlayers: 50, expires: null, machine: '5555666677778888', issued: '2026-11-28T00:00:00Z', id: 'L-two', folders: 2 }, privatePem(key));
  const licence = checkLicence(file, '2026-11-28', key.publicPem);
  assert.equal(licence.valid && licence.folders, 2);
  assert.equal(checkLicence(signLicence({ licensee: 'One', maxPlayers: 5, expires: null, machine: null, issued: '', id: 'L-one' }, privatePem(key)), '2026-11-28', key.publicPem).valid && true, true);
  await store.setJSON('licences/L-two', { id: 'L-two', licensee: 'Two', maxPlayers: 50, expires: null, machine: '5555666677778888', issued: '', requestId: null, revoked: null, file });
  for (const folder of ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']) await setupFn(post('/api/setup', setup('5555666677778888', folder, file)), { ip: '203.0.113.6' });
  assert.ok(!(await listLimitFlags(store)).some(f => f.subject === '5555666677778888'), 'two folders of a two-folder licence');
});

test('free computers sharing one public address are flagged; licensed ones are not', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  const cafe = { ip: '198.51.100.7' };
  for (const machine of ['a000000000000001', 'a000000000000002', 'a000000000000003']) {
    await setupFn(post('/api/setup', setup(machine, undefined)), cafe);
  }
  const flags = await listLimitFlags(store);
  assert.equal(flags.length, 1);
  assert.deepEqual([flags[0].kind, flags[0].count], ['address', 3]);
  assert.equal(flags[0].machines.length, 3);
  assert.ok(!JSON.stringify(flags).includes('198.51.100.7'), 'the address itself is never kept or shown');
});

test('the weekly and setup answers carry the switch, off by default', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  const machine = '9999aaaabbbbcccc';
  const first = await (await setupFn(post('/api/setup', setup(machine, 'dddddddddddddddd')), { ip: '203.0.113.9' })).json() as { limits: { enforce: boolean } };
  assert.deepEqual(first.limits, { enforce: false });
  await saveLimits(store, true);
  const weekly = await (await weeklyFn(post('/api/weekly', { machine, folder: 'dddddddddddddddd', os: 'Windows 11', version: '1.0.0', players: { peak: 3, limit: 10 } }), { ip: '203.0.113.9' })).json() as { limits: { enforce: boolean } };
  assert.deepEqual(weekly.limits, { enforce: true });
});

test('a folders add-on raises the licence\'s folders and survives other changes', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const catalogue = (await readCatalogue(store)).find(p => p.addon === 'folders')!;
  assert.equal(catalogue.addFolders, 1);
  const machine = '7777888899990000';
  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const file = signLicence({ licensee: 'Host', maxPlayers: 50, expires: null, machine, issued: '2026-11-28T00:00:00Z', id: 'L-host' }, privatePem(key));
  await store.setJSON('licences/L-host', { id: 'L-host', licensee: 'Host', maxPlayers: 50, expires: null, machine, issued: '2026-11-28T00:00:00Z', requestId: null, revoked: null, file, seasons: ['s6'], package: 'starter-lifetime' });
  await store.set(`machine-licences/${machine}`, 'L-host');
  const order = (id: string): ShopOrder => ({ id, at: '2026-11-28T00:00:00Z', package: catalogue, machine, legacyMachine: null, request: 'none', toMachine: null, currency: 'vnd', amount: 1, provider: 'bank', status: 'paid' });
  const bought = await issueOrder(store, order('o1'), new Date('2026-11-28T01:00:00Z'));
  assert.equal(bought?.bonusFolders, 1);
  assert.equal(checkLicence(bought!.file, '2026-11-28', key.publicPem).valid && (checkLicence(bought!.file, '2026-11-28', key.publicPem) as { folders: number }).folders, 2);
  const again = await issueOrder(store, order('o2'), new Date('2026-11-28T02:00:00Z'));
  assert.equal(again?.bonusFolders, 2);
});
