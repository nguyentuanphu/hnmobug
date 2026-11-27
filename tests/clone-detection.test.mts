import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { useStoreForTests, type CloneRecord } from '../netlify/lib/hub.mts';
import { memoryStore } from './memory-store.mts';
import setupFn from '../netlify/functions/setup.mts';
import weeklyFn from '../netlify/functions/weekly.mts';
import consoleFn from '../netlify/functions/console.mts';
import { hashPassword, totpCode } from '../netlify/lib/auth.mts';

process.env.SESSION_SECRET ??= 's'.repeat(40);
process.env.LICENCE_KEY_SECRET ??= 'k'.repeat(40);
process.env.CONSOLE_SLUG ??= 'a1b2c3d4e5f6a7b8';
process.env.CONSOLE_TOTP_SECRET ??= 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
process.env.CONSOLE_PASSWORD_HASH ??= hashPassword('correct horse battery');

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://hub.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('Layer 4 stores first-run fingerprint per licence and stays unflagged on matching host + IP', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const licenceId = 'L-2026-11-27-clean';
  const file = signLicence({ licensee: 'SingleHost', maxPlayers: 30, expires: null, machine: null, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'SingleHost', maxPlayers: 30, expires: null, machine: null, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: null, file });

  const machine = '1111222233334444';
  const r1 = await setupFn(post('/api/setup', {
    machine,
    licence: file,
    fingerprint: 'fp_host_one_abc123',
    system: { os: 'Windows 11', arch: 'X64', cpu: 'Ryzen 9', cores: 16, ramGb: 32, dotnet: '10.0' },
    game: { name: 'Server One', servers: [0], seasons: ['s6'], publicAddress: '', language: 'vi-VN' },
  }), { ip: '203.0.113.10' });
  assert.equal(r1.status, 200);

  const r2 = await weeklyFn(post('/api/weekly', {
    machine,
    licence: file,
    fingerprint: 'fp_host_one_abc123',
    os: 'Windows 11',
    version: '1.0.0',
    players: { peak: 5, limit: 30 },
  }), { ip: '203.0.113.11' }); // same /24 subnet and same fingerprint
  assert.equal(r2.status, 200);
  const weeklyBody = await r2.json() as { ok: boolean; revoked: boolean };
  assert.equal(weeklyBody.ok, true);
  assert.equal(weeklyBody.revoked, false);

  const clone = JSON.parse(store.data.get(`clones/${licenceId}`)!) as CloneRecord;
  assert.equal(clone.flagged, false);
  assert.equal(clone.firstRun.fingerprint, 'fp_host_one_abc123');
  assert.equal(clone.sightings.length, 1);
});

test('Layer 4 passively flags two unrelated fingerprints/IPs in the hub with no action on host and no player data', async (t) => {
  const store = memoryStore();
  useStoreForTests(store);
  t.after(() => useStoreForTests(null));

  const key = makeLicenceKey();
  await store.setJSON('keys/licence', key);
  const licenceId = 'L-2026-11-27-clone';
  const file = signLicence({ licensee: 'ClonedHost', maxPlayers: 50, expires: null, machine: null, issued: '2026-11-27T00:00:00Z', id: licenceId }, privatePem(key));
  await store.setJSON(`licences/${licenceId}`, { id: licenceId, licensee: 'ClonedHost', maxPlayers: 50, expires: null, machine: null, issued: '2026-11-27T00:00:00Z', requestId: null, revoked: null, file });

  // First run from host A
  await setupFn(post('/api/setup', {
    machine: 'aaaa1111bbbb2222',
    licence: file,
    fingerprint: 'fp_original_server',
    system: { os: 'Linux', arch: 'X64', cpu: 'EPYC', cores: 8, ramGb: 16, dotnet: '10.0' },
    game: { name: 'Origin', servers: [0], seasons: ['s6'], publicAddress: '', language: 'en-US' },
  }), { ip: '203.0.113.20' });

  // Second sighting from unrelated fingerprint & IP
  const weeklyRes = await weeklyFn(post('/api/weekly', {
    machine: 'cccc3333dddd4444',
    licence: file,
    fingerprint: 'fp_unrelated_clone',
    os: 'Windows',
    version: '1.0.0',
    players: { peak: 12, limit: 50 },
    bugs: [{ text: 'Player Alice@test reported crash' }],
  }), { ip: '198.51.100.77' });
  assert.equal(weeklyRes.status, 200);
  const body = await weeklyRes.json() as { ok: boolean; revoked: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.revoked, false, 'passive: weekly never tells the host or withdraws here');

  const rawClone = store.data.get(`clones/${licenceId}`)!;
  assert.equal(rawClone.includes('198.51.100.77'), false, 'never stores raw IP in clone record');
  assert.equal(rawClone.includes('Alice'), false, 'never stores player data in clone record');
  const clone = JSON.parse(rawClone) as CloneRecord;
  assert.equal(clone.flagged, true);
  assert.equal(clone.sightings.length, 2);
  assert.match(clone.reason ?? '', /unrelated/);

  // Console state exposes clone flag passively; licence itself stays unrevoked
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(Date.now() / 30_000));
  const loginRes = await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery', code }, { 'X-Console': '1' }), { ip: '203.0.113.20' });
  const jar = loginRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const state = await (await consoleFn(new Request(`https://hub.example${base}/api/state`, { headers: { cookie: jar } }), { ip: '203.0.113.20' })).json() as {
    clones: CloneRecord[];
    licences: { id: string; revoked: string | null; clone: CloneRecord | null }[];
  };
  assert.equal(state.clones.length, 1);
  assert.equal(state.clones[0].licenceId, licenceId);
  assert.equal(state.licences[0].revoked, null);
  assert.equal(state.licences[0].clone?.flagged, true);
});
