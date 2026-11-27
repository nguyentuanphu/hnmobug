import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { signUpdateToken, useStoreForTests, verifyUpdateToken } from '../netlify/lib/hub.mts';
import { memoryStore } from './memory-store.mts';
import updateCheckFn from '../netlify/functions/update-check.mts';
import { handleUpdateFile } from '../netlify/functions/update-file.mts';
import latestFn from '../netlify/functions/latest.mts';

process.env.SESSION_SECRET ??= 's'.repeat(40);
process.env.LICENCE_KEY_SECRET ??= 'k'.repeat(40);
process.env.HUB_KEY ??= 'h'.repeat(40);
process.env.UPDATE_TOKEN_SECRET ??= 'u'.repeat(40);

const MACHINE = '8e5abdd396d53501';
const LEGACY = '1122334455667788';
const ctx = { ip: '203.0.113.10' };

const post = (body: unknown, method = 'POST') =>
  new Request('https://hub.example/api/update-check', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

test('POST /api/update-check issues manifest + short-lived token for a valid hub-signed licence and stores minimal fields', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  const prevUpdates = process.env.UPDATES_URL;
  process.env.UPDATES_URL = 'https://cdn.example/hnmo';
  t.after(() => {
    useStoreForTests(null);
    if (prevUpdates === undefined) delete process.env.UPDATES_URL;
    else process.env.UPDATES_URL = prevUpdates;
  });

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const licenceId = 'L-2026-11-27-aaaaaa';
  const file = signLicence({ licensee: 'Minh', maxPlayers: 40, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'Minh', maxPlayers: 40, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: null, file });
  await store.setJSON('config/latest', { tag: '1.2.3', url: '', notes: 'Security update', published: '2026-11-27T01:00:00Z' });
  await store.setJSON('releases/1.2.3/manifest', {
    version: '1.2.3',
    files: [{ path: 'server/HNMO.Startup.dll', sha256: 'a'.repeat(64), size: 1234, exec: false }],
  });

  const res = await updateCheckFn(post({
    licenceId,
    machineId: MACHINE,
    buildStamp: 'HNMO-1abdb72e-f72e-457c-93d5-3141ad991109-20261114',
    licence: Buffer.from(file).toString('base64'),
  }), ctx);

  assert.equal(res.status, 200);
  const body = await res.json() as { manifestVersion: string; files: { path: string; sha256: string }[]; downloadBase: string; token: string };
  assert.equal(body.manifestVersion, '1.2.3');
  assert.equal(body.downloadBase, 'https://hub.example/api/update-file');
  assert.equal(body.files.length, 1);
  assert.equal(body.files[0].path, 'server/HNMO.Startup.dll');

  const claims = verifyUpdateToken<{ licenceId: string; machineId: string; version: string; exp: number }>(body.token);
  assert.ok(claims);
  assert.equal(claims.licenceId, licenceId);
  assert.equal(claims.machineId, MACHINE);
  assert.equal(claims.version, '1.2.3');
  assert.equal(verifyUpdateToken(body.token, claims.exp + 1), null, 'expired token rejected');

  const stored = JSON.parse(store.data.get(`update-checks/${licenceId}/${MACHINE}`)!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored).sort(), ['buildStamp', 'lastSeen', 'licenceId', 'machineId']);
  assert.equal(stored.licenceId, licenceId);
  assert.equal(stored.machineId, MACHINE);

  // Public /api/latest must not hand out unauthenticated files_url or manifest_url.
  const latestRes = await latestFn(new Request('https://hub.example/api/latest'));
  assert.equal(latestRes.status, 200);
  const latestBody = await latestRes.json() as { files_url: string; manifest_url: string };
  assert.equal(latestBody.files_url, '');
  assert.equal(latestBody.manifest_url, '');
});

test('GET /api/update-file requires dedicated UPDATE_TOKEN_SECRET and enforces token, machine, manifest path, and withdrawal', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  const prevUpdates = process.env.UPDATES_URL;
  process.env.UPDATES_URL = 'https://cdn.example/hnmo';
  t.after(() => {
    useStoreForTests(null);
    if (prevUpdates === undefined) delete process.env.UPDATES_URL;
    else process.env.UPDATES_URL = prevUpdates;
  });

  // Dedicated secret only: missing UPDATE_TOKEN_SECRET throws even when HUB_KEY/SESSION_SECRET exist.
  const prevSecret = process.env.UPDATE_TOKEN_SECRET;
  delete process.env.UPDATE_TOKEN_SECRET;
  assert.throws(() => signUpdateToken({ licenceId: 'L-1', machineId: MACHINE, buildStamp: 'B', version: '1.0', exp: Date.now() + 60_000 }));
  process.env.UPDATE_TOKEN_SECRET = prevSecret;

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const licenceId = 'L-2026-11-27-gated';
  const file = signLicence({ licensee: 'Minh', maxPlayers: 40, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'Minh', maxPlayers: 40, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: null, file });
  await store.setJSON('config/latest', { tag: '1.2.3', url: '', notes: '', published: '2026-11-27T01:00:00Z' });
  await store.setJSON('releases/1.2.3/manifest', {
    version: '1.2.3',
    files: [{ path: 'server/HNMO.Startup.dll', sha256: 'c'.repeat(64) }],
  });

  const checkRes = await updateCheckFn(post({
    licenceId, machineId: MACHINE, legacyMachineId: LEGACY, buildStamp: 'HNMO-b1', licence: Buffer.from(file).toString('base64'),
  }), ctx);
  const { token } = await checkRes.json() as { token: string };
  // Authorized: redirected to the file on the update storage (Cloudflare), not streamed through the hub
  const okFile = await handleUpdateFile(
    new Request(`https://hub.example/api/update-file?path=server/HNMO.Startup.dll&token=${encodeURIComponent(token)}`, {
      headers: { 'x-hnmo-machine': MACHINE },
    }),
    ctx,
  );
  assert.equal(okFile.status, 302);
  assert.equal(okFile.headers.get('location'), `https://cdn.example/hnmo/files/${'c'.repeat(64)}`);
  assert.equal(okFile.headers.get('x-hnmo-sha256'), 'c'.repeat(64));

  // Expired token refused
  const expiredToken = signUpdateToken({ licenceId, machineId: MACHINE, buildStamp: 'HNMO-b1', version: '1.2.3', exp: Date.now() - 1000 });
  const expiredRes = await handleUpdateFile(
    new Request(`https://hub.example/api/update-file?path=server/HNMO.Startup.dll&token=${encodeURIComponent(expiredToken)}`),
    ctx,
  );
  assert.equal(expiredRes.status, 403);

  // Another machine refused
  const otherMachineRes = await handleUpdateFile(
    new Request(`https://hub.example/api/update-file?path=server/HNMO.Startup.dll&token=${encodeURIComponent(token)}&machine=deadbeefdeadbeef`),
    ctx,
  );
  assert.equal(otherMachineRes.status, 403);

  // Path outside manifest refused
  const offManifestRes = await handleUpdateFile(
    new Request(`https://hub.example/api/update-file?path=../secret.txt&token=${encodeURIComponent(token)}`, {
      headers: { 'x-hnmo-machine': MACHINE },
    }),
    ctx,
  );
  assert.equal(offManifestRes.status, 403);

  // Withdrawn licence refused even with an earlier valid token
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'Minh', maxPlayers: 40, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: '2026-11-27T08:00:00Z', file });
  const withdrawnRes = await handleUpdateFile(
    new Request(`https://hub.example/api/update-file?path=server/HNMO.Startup.dll&token=${encodeURIComponent(token)}`, {
      headers: { 'x-hnmo-machine': MACHINE },
    }),
    ctx,
  );
  assert.equal(withdrawnRes.status, 403);
});

test('POST /api/update-check matches legacyMachineId and accepts 403 rejections cleanly', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const licenceId = 'L-2026-11-27-legacy';
  const file = signLicence({ licensee: 'OldHost', maxPlayers: 20, expires: null, machine: LEGACY, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'OldHost', maxPlayers: 20, expires: null, machine: LEGACY, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: null, file });
  await store.setJSON('config/latest', { tag: '1.2.3', url: '', notes: '', published: '2026-11-27T01:00:00Z' });
  await store.setJSON('releases/1.2.3/manifest', { version: '1.2.3', files: [{ path: 'web/HNMO.dll', sha256: 'b'.repeat(64) }] });

  // Matching via legacyMachineId succeeds
  const okRes = await updateCheckFn(post({ licenceId, machineId: MACHINE, legacyMachineId: LEGACY, buildStamp: 'HNMO-test', licence: Buffer.from(file).toString('base64') }), ctx);
  assert.equal(okRes.status, 200);

  // Wrong machine without matching legacyMachineId -> 403
  const wrongMachine = await updateCheckFn(post({ licenceId, machineId: 'ffffffffffffffff', buildStamp: 'HNMO-test', licence: Buffer.from(file).toString('base64') }), ctx);
  assert.equal(wrongMachine.status, 403);

  // Forged key -> 403
  const { privateKey: rogue } = generateKeyPairSync('ed25519');
  const payload = Buffer.from(JSON.stringify({ licensee: 'Fake', maxPlayers: 99, machine: MACHINE, id: 'L-fake' }));
  const forged = JSON.stringify({ payload: payload.toString('base64'), signature: edSign(null, payload, rogue).toString('base64') });
  const forgedRes = await updateCheckFn(post({ licenceId: 'L-fake', machineId: MACHINE, buildStamp: 'HNMO-test', licence: Buffer.from(forged).toString('base64') }), ctx);
  assert.equal(forgedRes.status, 403);

  // Withdrawn licence -> 403
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'OldHost', maxPlayers: 20, expires: null, machine: LEGACY, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: '2026-11-27T05:00:00Z', file });
  const revokedRes = await updateCheckFn(post({ licenceId, machineId: MACHINE, legacyMachineId: LEGACY, buildStamp: 'HNMO-test', licence: Buffer.from(file).toString('base64') }), ctx);
  assert.equal(revokedRes.status, 403);
  assert.equal((await updateCheckFn(post(null, 'GET'), ctx)).status, 405);
});

test('POST /api/update-check: a server without a licence updates as a free host; a broken or withdrawn licence does not', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  await store.setJSON('config/latest', { tag: '1.0.1', url: '', notes: '', published: '2026-11-27T09:00:00Z' });
  await store.setJSON('releases/1.0.1/manifest', { version: '1.0.1', files: [{ path: 'server/HNMO.Startup.dll', sha256: 'b'.repeat(64) }] });

  // No licence file: the free build still gets the update, recorded under "free".
  const free = await updateCheckFn(post({ machineId: MACHINE, buildStamp: 'HNMO-free' }), ctx);
  assert.equal(free.status, 200);
  const body = await free.json() as { manifestVersion: string; token: string; files: unknown[] };
  assert.equal(body.manifestVersion, '1.0.1');
  assert.equal(body.files.length, 1);
  const claims = verifyUpdateToken<{ licenceId: string; machineId: string; exp: number }>(body.token);
  assert.equal(claims?.licenceId, 'free');
  assert.equal(claims?.machineId, MACHINE);
  assert.ok(store.data.has(`update-checks/free/${MACHINE}`));

  // The free host's token downloads files of the manifest only.
  process.env.UPDATES_URL = 'https://cdn.example/hnmo';
  t.after(() => { delete process.env.UPDATES_URL; });
  const ok = await handleUpdateFile(new Request(`https://hub.example/api/update-file?path=server/HNMO.Startup.dll&token=${body.token}`), {});
  assert.equal(ok.status, 302);
  const off = await handleUpdateFile(new Request(`https://hub.example/api/update-file?path=server/other.dll&token=${body.token}`), {});
  assert.equal(off.status, 403);

  // Still needs a machine id.
  assert.equal((await updateCheckFn(post({ buildStamp: 'HNMO-free' }), ctx)).status, 403);

  // A licence that is sent must be valid: garbage is refused, not treated as "free".
  const broken = await updateCheckFn(post({ machineId: MACHINE, licence: Buffer.from('not a licence').toString('base64') }), ctx);
  assert.equal(broken.status, 403);

  // A withdrawn licence is refused, and a licence can't claim the "free" id.
  const licenceId = 'L-2026-11-27-bbbbbb';
  const file = signLicence({ licensee: 'Lan', maxPlayers: 30, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'Lan', maxPlayers: 30, expires: '2028-01-01', machine: MACHINE, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: '2026-11-27T08:00:00Z', file });
  const withdrawn = await updateCheckFn(post({ machineId: MACHINE, licence: Buffer.from(file).toString('base64') }), ctx);
  assert.equal(withdrawn.status, 403);
  assert.equal(((await withdrawn.json()) as { reason: string }).reason, 'withdrawn');
});
