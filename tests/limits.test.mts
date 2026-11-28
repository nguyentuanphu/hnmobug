// One folder per computer: what the hub notes, flags and answers; the switch is off until the owner turns it on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from '@netlify/blobs';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { checkLicence } from '../netlify/lib/license.mts';
import { ipHash, useStoreForTests } from '../netlify/lib/hub.mts';
import { cleanFolder, listLimitFlags, noteFolder, readLimits, saveLimits, setFlagAside, type AddressRecord, type FolderRecord } from '../netlify/lib/limits.mts';
import { issueOrder, readCatalogue, type ShopOrder } from '../netlify/lib/shop.mts';
import { memoryStore } from './memory-store.mts';
import { sign } from '../netlify/lib/auth.mts';
import consoleFn from '../netlify/functions/console.mts';
import updateCheckFn from '../netlify/functions/update-check.mts';
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
  assert.equal(await setFlagAside(store, flags[0].key, new Date(), flags[0].fingerprint), true);
  assert.deepEqual(await listLimitFlags(store), []);
  await setupFn(post('/api/setup', setup(machine, 'cccccccccccccccc')), { ip: '203.0.113.5' });
  assert.equal((await listLimitFlags(store))[0]?.count, 3);
  assert.equal(await setFlagAside(store, 'folders-nothing00', new Date(), flags[0].fingerprint), false);

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

const DAY = 86_400_000;
const start = Date.parse('2026-11-28T00:00:00Z');
const at = (ms = 0) => new Date(start + ms);
const machine = '1122334455667788';
const ip = '203.0.113.10';
const folderId = (n: number) => n.toString(16).padStart(16, '0');
const folderKey = `limit-folders/${machine}`;
const addressKey = `limit-addresses/${ipHash(`limits|${ip}`)}`;
const weekly = (folder: string, licence?: string) => ({
  machine, folder, ...(licence ? { licence } : {}), os: 'Windows 11', version: '1.0.0', players: { peak: 3, limit: 10 },
});
const folderReport = (n: number, allowed: number, licenceId: string | null = 'L-fixture') =>
  ({ machine, folder: folderId(n), ip, licenceId, allowed });

test('signed licence folder entitlement defaults to one and accepts integer thresholds through 50', () => {
  const key = makeLicenceKey();
  for (const [folders, expected] of [[undefined, 1], [0, 1], [1, 1], [19, 19], [20, 20], [21, 21], [49, 49], [50, 50], [51, 1], [20.5, 1]] as const) {
    const file = signLicence({ licensee: 'Fixture', maxPlayers: 10, expires: null, machine, issued: at().toISOString(), id: 'L-fixture', folders }, privatePem(key));
    const parsed = checkLicence(file, '2026-11-28', key.publicPem);
    assert.equal(parsed.valid && parsed.folders, expected);
  }
});

for (const [count, guards] of [
  [19, [18, 19, 20]], [20, [19, 20, 21]], [21, [20, 21, 22]],
  [49, [48, 49, 50]], [50, [49, 50]], [51, [50]],
] as const) {
  test(`retains ${count} distinct folders and flags only when count exceeds allowance`, async () => {
    const store = memoryStore();
    for (const allowed of guards) {
      store.data.clear();
      for (let n = 1; n <= count; n++) await noteFolder(store, folderReport(n, allowed), at(n));
      const record = await store.get(folderKey, { type: 'json' }) as FolderRecord;
      assert.equal(Object.keys(record.folders).length, count);
      const flags = await listLimitFlags(store, at(count));
      assert.deepEqual(flags.map(flag => [flag.count, flag.allowed]), count > allowed ? [[count, allowed]] : []);
    }
  });
}

test('bounds a full folder record while reporting a lower bound in the console', async () => {
  const store = memoryStore();
  for (let n = 1; n <= 80; n++) await noteFolder(store, folderReport(n, 50), at(n));
  const record = await store.get(folderKey, { type: 'json' }) as FolderRecord;
  assert.equal(Object.keys(record.folders).length, 64);
  assert.equal(record.folders[folderId(16)], undefined);
  assert.equal(record.folders[folderId(17)], at(17).toISOString());
  const [flag] = await listLimitFlags(store, at(80));
  assert.deepEqual([flag.count, flag.allowed, flag.capped], [64, 50, true]);
  assert.ok(Buffer.byteLength(store.data.get(folderKey)!) < 4096);
});

test('concurrent workers merge new and existing keys, including multiple seasons of the same folder', async () => {
  const store = memoryStore();
  let folderReads = 0;
  let conflicts = 0;
  const read = store.getWithMetadata.bind(store);
  const write = store.setJSON.bind(store);
  store.getWithMetadata = (async (key: string) => {
    if (key === folderKey) folderReads++;
    return read(key, { type: 'json' });
  }) as typeof store.getWithMetadata;
  store.setJSON = async (...args) => {
    const result = await write(...args);
    if (!result.modified) conflicts++;
    return result;
  };

  await Promise.all([1, 2, 2, 3].map(n => noteFolder(store, folderReport(n, 1, null), at(n))));
  await Promise.all([
    noteFolder(store, folderReport(4, 1, null), at(4)),
    noteFolder(store, folderReport(5, 1, null), at(5)),
    ...[6, 7, 8].map(n => noteFolder(store, { ...folderReport(1, 1, null), machine: folderId(n) }, at(n))),
  ]);
  assert.ok(conflicts > 0);
  assert.ok(folderReads > 6);
  const folders = (await store.get(folderKey, { type: 'json' }) as FolderRecord).folders;
  assert.deepEqual(Object.keys(folders).sort(), [1, 2, 3, 4, 5].map(folderId));
  const address = await store.get(addressKey, { type: 'json' }) as AddressRecord;
  assert.deepEqual(Object.keys(address.machines).sort(), [machine, ...[6, 7, 8].map(folderId)].sort());
  assert.ok(!JSON.stringify(address).includes(ip));
});

test('the pinned Blobs SDK uses one GET and conditional PUT per key when there is no conflict', async () => {
  const values = new Map<string, { body: string; etag: string }>();
  const calls: string[] = [];
  let version = 0;
  const fetch: typeof globalThis.fetch = async (input, options) => {
    const url = String(input);
    const headers = new Headers(options?.headers);
    const method = options?.method?.toUpperCase();
    const previous = values.get(url);
    calls.push(method ?? 'missing');
    if (method === 'GET') {
      return previous ? new Response(previous.body, { headers: { ETag: previous.etag } }) : new Response(null, { status: 404 });
    }
    assert.equal(method, 'PUT');
    if (previous) assert.equal(headers.get('If-Match'), previous.etag);
    else assert.equal(headers.get('If-None-Match'), '*');
    const etag = `"${++version}"`;
    values.set(url, { body: String(options?.body), etag });
    return new Response(null, { status: 200, headers: { ETag: etag } });
  };
  const store = getStore({ name: 'hub', siteID: 'synthetic-site', token: 'synthetic-token',
    edgeURL: 'https://blobs.example', uncachedEdgeURL: 'https://blobs-strong.example', consistency: 'strong', fetch });
  await noteFolder(store, folderReport(1, 50), at());
  await noteFolder(store, folderReport(2, 50), at(1));
  assert.deepEqual(calls, Array.from({ length: 4 }, () => ['GET', 'PUT']).flat());
  assert.equal(values.size, 2);
});

test('exhausted conflicts surface an error without an unconditional overwrite', async (t) => {
  t.mock.method(globalThis.Math, 'random', () => 0);
  const store = memoryStore();
  await noteFolder(store, folderReport(1, 1), at());
  const before = store.data.get(folderKey);
  let attempts = 0;
  store.setJSON = async (key, _value, options) => {
    assert.equal(key, folderKey);
    assert.ok(options?.onlyIfMatch);
    attempts++;
    return { modified: false };
  };
  await assert.rejects(noteFolder(store, folderReport(2, 1), at(1)), /did not settle/);
  assert.equal(attempts, 8);
  assert.equal(store.data.get(folderKey), before);
});

test('a stale in-flight report cannot rewind timestamps or replace newer licence telemetry', async () => {
  const store = memoryStore();
  await noteFolder(store, folderReport(1, 21, 'L-new'), at(100));
  await noteFolder(store, folderReport(1, 1, null), at(90));
  await noteFolder(store, folderReport(2, 1, null), at(95));
  const entry = await store.get(folderKey, { type: 'json' }) as FolderRecord;
  assert.deepEqual([entry.licenceId, entry.allowed, entry.folders[folderId(1)], entry.folders[folderId(2)]], ['L-new', 21, at(100).toISOString(), at(95).toISOString()]);
  const address = await store.get(addressKey, { type: 'json' }) as AddressRecord;
  assert.deepEqual(address.machines[machine], { last: at(100).toISOString(), licenceId: 'L-new' });
});

test('dismissal follows the licence ID, allowance and same-count changes in active membership', async () => {
  const store = memoryStore();
  await noteFolder(store, folderReport(1, 1), at());
  await noteFolder(store, folderReport(2, 1), at(DAY));
  const [initial] = await listLimitFlags(store, at(DAY));
  await store.setJSON(`limit-aside/${initial.key}`, { count: 2 });
  assert.equal((await listLimitFlags(store, at(DAY))).length, 1, 'legacy count-only dismissal needs review');
  assert.equal(await setFlagAside(store, initial.key, at(DAY), initial.fingerprint), true);
  await noteFolder(store, folderReport(2, 1), at(DAY + 1));
  assert.deepEqual(await listLimitFlags(store, at(DAY + 1)), [], 'refreshing a member keeps dismissal');
  await noteFolder(store, folderReport(3, 1), at(14 * DAY));
  const [replacement] = await listLimitFlags(store, at(14 * DAY));
  assert.equal(replacement.count, 2, 'folder 1 aged out at exactly 14 days');
  assert.notEqual(replacement.fingerprint, initial.fingerprint);
  assert.equal(await setFlagAside(store, initial.key, at(14 * DAY), initial.fingerprint), false, 'stale browser snapshot');
  assert.equal(await setFlagAside(store, replacement.key, at(14 * DAY), replacement.fingerprint), true);
  await noteFolder(store, folderReport(3, 1, 'L-other'), at(14 * DAY + 1));
  const [changed] = await listLimitFlags(store, at(14 * DAY + 1));
  assert.equal(changed.count, 2);
  assert.equal(changed.licenceId, 'L-other');
  await noteFolder(store, folderReport(3, 1), at(14 * DAY + 2));
  assert.equal((await listLimitFlags(store, at(14 * DAY + 2))).length, 1, 'returning to the old licence does not restore its dismissal');
  await noteFolder(store, folderReport(3, 2), at(14 * DAY + 3));
  assert.deepEqual(await listLimitFlags(store, at(14 * DAY + 3)), [], 'more allowance clears the warning');
  await noteFolder(store, folderReport(3, 1), at(14 * DAY + 4));
  assert.equal((await listLimitFlags(store, at(14 * DAY + 4)))[0]?.allowed, 1, 'reducing allowance shows it again');
});

test('folder and address sightings expire at 14 days, while a refresh extends an individual sighting', async () => {
  const store = memoryStore();
  await noteFolder(store, folderReport(1, 1, null), at());
  await noteFolder(store, folderReport(2, 1, null), at());
  await noteFolder(store, { ...folderReport(1, 1, null), machine: folderId(9) }, at());
  await noteFolder(store, folderReport(1, 1, null), at(7 * DAY));
  assert.deepEqual((await listLimitFlags(store, at(14 * DAY - 1))).map(flag => flag.kind).sort(), ['address', 'folders']);
  assert.deepEqual(await listLimitFlags(store, at(14 * DAY)), []);
  await noteFolder(store, folderReport(3, 1, null), at(14 * DAY + 1));
  assert.deepEqual(Object.keys((await store.get(folderKey, { type: 'json' }) as FolderRecord).folders).sort(), [folderId(1), folderId(3)]);
  assert.deepEqual(await listLimitFlags(store, at(21 * DAY)), []);
});

test('weekly and setup observe current signed allowance, update-check returns switch without recording a folder', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  process.env.UPDATE_TOKEN_SECRET ??= 'u'.repeat(40);
  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const id = 'L-fixture';
  const make = (folders: number) => {
    const licence = { licensee: 'Fixture', maxPlayers: 10, expires: null, machine, issued: at().toISOString(), id, folders };
    return { ...licence, requestId: null, revoked: null, file: signLicence(licence, privatePem(key)) };
  };
  const old = make(1);
  const current = make(2);
  await store.setJSON(`licences/${id}`, current);
  await store.setJSON('config/latest', { tag: '1.2.3', notes: '' });
  await store.setJSON('releases/1.2.3/manifest', { version: '1.2.3', files: [{ path: 'server/HNMO.dll', sha256: 'b'.repeat(64) }] });
  const responses = await Promise.all([
    setupFn(post('/api/setup', { ...setup(machine, folderId(1), current.file), game: { ...setup(machine, folderId(1)).game, seasons: ['s9'] } }), { ip }),
    weeklyFn(post('/api/weekly', weekly(folderId(2), old.file)), { ip }),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { limits: unknown }).limits, { enforce: false });
  }
  let record = await store.get(folderKey, { type: 'json' }) as FolderRecord;
  assert.equal(record.allowed, 2, 'old signed copy with the same ID does not undo the add-on');
  assert.deepEqual(Object.keys(record.folders).sort(), [folderId(1), folderId(2)]);
  assert.deepEqual(await listLimitFlags(store), []);
  await saveLimits(store, true);
  await store.setJSON(`licences/${id}`, old);
  const setupResponse = await setupFn(post('/api/setup', setup(machine, folderId(2), current.file)), { ip });
  assert.equal(setupResponse.status, 200);
  assert.deepEqual((await setupResponse.json() as { limits: unknown }).limits, { enforce: true });
  const [flag] = await listLimitFlags(store);
  assert.deepEqual([flag.count, flag.allowed], [2, 1]);
  assert.equal((await store.get(`licences/${id}`, { type: 'json' }) as { revoked: string | null }).revoked, null);

  for (const enforce of [true, false]) {
    await saveLimits(store, enforce);
    const response = await updateCheckFn(post('/api/update-check', {
      machineId: machine, folder: folderId(3), licenceId: id, licence: Buffer.from(current.file).toString('base64'),
    }), { ip });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { limits: unknown }).limits, { enforce });
    record = await store.get(folderKey, { type: 'json' }) as FolderRecord;
    assert.equal(record.folders[folderId(3)], undefined);
  }
  await store.setJSON(`licences/${id}`, { ...old, revoked: at().toISOString() });
  const withdrawn = await setupFn(post('/api/setup', setup(machine, folderId(2), current.file)), { ip });
  assert.equal(withdrawn.status, 200, 'telemetry records but does not block the host');
  record = await store.get(folderKey, { type: 'json' }) as FolderRecord;
  assert.deepEqual([record.licenceId, record.allowed], [null, 1]);
});

test('owner console exposes the snapshot and rejects stale dismissal', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));
  const slug = 'a1b2c3d4e5f6a7b8';
  const savedSlug = process.env.CONSOLE_SLUG;
  process.env.CONSOLE_SLUG = slug;
  t.after(() => {
    if (savedSlug === undefined) delete process.env.CONSOLE_SLUG;
    else process.env.CONSOLE_SLUG = savedSlug;
  });
  const device = 'folder-test-browser';
  await store.setJSON(`devices/${device}`, { id: device, name: 'Fixture', added: '', lastSeen: '' });
  const cookie = 'hnmo_session=' + sign({ exp: Date.now() + DAY, d: device });
  const call = (action: string, body?: unknown, authenticated = true) => consoleFn(new Request(`https://hub.example/c/${slug}/api/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(authenticated ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', 'X-Console': '1' },
    body: JSON.stringify(body),
  }), { ip });

  const now = new Date();
  await noteFolder(store, folderReport(1, 1), now);
  await noteFolder(store, folderReport(2, 1), now);
  assert.equal((await call('limits', undefined, false)).status, 401);
  const first = await call('limits');
  assert.equal(first.status, 200);
  const snapshot = (await first.json() as { flags: { key: string; fingerprint: string; count: number; allowed: number }[] }).flags[0];
  assert.deepEqual([snapshot.count, snapshot.allowed], [2, 1]);
  await noteFolder(store, folderReport(3, 1), now);
  assert.equal((await call('limits-aside', snapshot)).status, 409);
  const next = (await (await call('limits')).json() as { flags: unknown[] }).flags[0];
  assert.equal((await call('limits-aside', next)).status, 200);
  assert.deepEqual(await (await call('limits')).json(), { enforce: false, flags: [] });
});
