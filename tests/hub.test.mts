// The hub, without Netlify: the licence check, sign-in, the console's licences, licence requests and their answer, the
// weekly report and its limit, and how bug reports group into issues. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { checkLicence } from '../netlify/lib/license.mts';
import { checkPassword, checkTotp, hashPassword, sign, totpCode, unsign } from '../netlify/lib/auth.mts';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { cleanRequest, cleanWeekly } from '../netlify/lib/report.mts';
import { listJson, READ_AT_ONCE, useStoreForTests } from '../netlify/lib/hub.mts';
import { addSeen, bugIssue, bugKey, noMention, readSeen, summaryBody, withSeen } from '../tools/reports-to-issues.mts';
import { memoryStore } from './memory-store.mts';
import consoleFn from '../netlify/functions/console.mts';
import requestFn from '../netlify/functions/report.mts';
import weeklyFn from '../netlify/functions/weekly.mts';
import setupFn from '../netlify/functions/setup.mts';
import latestFn from '../netlify/functions/latest.mts';

process.env.SESSION_SECRET = 's'.repeat(40);
process.env.LICENCE_KEY_SECRET = 'k'.repeat(40);
process.env.CONSOLE_SLUG = 'a1b2c3d4e5f6a7b8';
process.env.CONSOLE_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
process.env.CONSOLE_PASSWORD_HASH = hashPassword('correct horse battery');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const licenceFile = (body: object, key = privateKey) => {
  const payload = Buffer.from(JSON.stringify(body));
  return JSON.stringify({ payload: payload.toString('base64'), signature: edSign(null, payload, key).toString('base64') });
};
const MACHINE = '8e5abdd396d53501';
const ctx = { ip: '203.0.113.9' };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://hub.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('a licence signed with one of the keys is known; a forged, broken or expired one is not', () => {
  const good = checkLicence(licenceFile({ licensee: 'Friends server', maxPlayers: 50, expires: '2027-01-01', machine: 'abc123', id: 'L-1' }), '2026-11-20', pem);
  assert.deepEqual(good, { valid: true, licensee: 'Friends server', maxPlayers: 50, expires: '2027-01-01', machine: 'abc123', id: 'L-1' });
  const other = generateKeyPairSync('ed25519');
  const otherPem = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.equal(checkLicence(licenceFile({ licensee: 'B', maxPlayers: 9 }, other.privateKey), '2026-11-20', [otherPem, pem]).valid, true, 'either key');
  assert.deepEqual(checkLicence(licenceFile({ licensee: 'Forged', maxPlayers: 999 }, other.privateKey), '2026-11-20', pem), { valid: false, reason: 'signature' });
  assert.deepEqual(checkLicence('{"payload": 1}', '2026-11-20', pem), { valid: false, reason: 'broken' });
  assert.deepEqual(checkLicence(licenceFile({ licensee: 'Old', maxPlayers: 20, expires: '2026-11-19' }), '2026-11-20', pem), { valid: false, reason: 'expired' });
  assert.deepEqual(checkLicence(null, '2026-11-20', pem), { valid: false, reason: 'none' });
  assert.equal(checkLicence(licenceFile({ licensee: 'x', maxPlayers: 1 }), '2026-11-20').valid, false, 'the HNMO build key in the repository reads, and a throwaway key is not it');
});

test('password, authenticator code (RFC 6238) and signed cookies', () => {
  assert.equal(checkPassword('correct horse battery'), true);
  assert.equal(checkPassword('wrong'), false);
  assert.equal(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082', 'the RFC test vector at 59 s');
  assert.equal(checkTotp('287082', 59_000), true);
  assert.equal(checkTotp('287082', 59_000 + 120_000), false, 'an old code is refused');
  const token = sign({ d: 'x', exp: 5 });
  assert.deepEqual(unsign(token), { d: 'x', exp: 5 });
  assert.equal(unsign(token.slice(0, -2) + 'AA'), null, 'a changed cookie is refused');
});

test('the licence key signs licences HNMO can read; its private half is stored encrypted', () => {
  const key = makeLicenceKey();
  assert.equal(key.data.includes('PRIVATE'), false);
  const file = signLicence({ licensee: 'Minh', maxPlayers: 40, expires: null, machine: MACHINE, issued: '2026-11-20T00:00:00Z', id: 'L-x' }, privatePem(key));
  const parsed = checkLicence(file, '2026-11-20', key.publicPem);
  assert.equal(parsed.valid && parsed.maxPlayers, 40);
});

test('what a weekly report and a request keep', () => {
  const weekly = cleanWeekly({ version: '1.0', players: { peak: 12.4, limit: 10, accounts: 30, graceStarted: '2026-11-20T07:00:00.0000000Z' }, health: { integrity: 'evil' }, features: { season9: true, plugins: ['A', 5] }, bugs: [{ text: 'short' }, { text: 'Twisting Slash shows no effect', category: 'skill' }], email: 'x@y' })!;
  assert.equal(weekly.players.peak, 12);
  assert.equal(weekly.players.graceStarted, '2026-11-20T07:00:00.0000000Z');
  assert.equal(cleanWeekly({ players: { graceStarted: '<script>' } })!.players.graceStarted, null);
  assert.equal(weekly.health.integrity, 'unknown');
  assert.deepEqual(weekly.features.plugins, ['A']);
  assert.equal(weekly.bugs.length, 1);
  assert.equal(JSON.stringify(weekly).includes('x@y'), false);
  assert.equal(cleanRequest({ name: 'Minh', token: 'short' }), null, 'a request needs a long secret');
});

test('the console: password, then the code on a new browser; issuing a licence answers the request', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  assert.equal((await consoleFn(new Request('https://hub.example/c/other/'), ctx)).status, 404, 'another path shows the public 404 page');
  assert.equal((await consoleFn(new Request(`https://hub.example${base}/`), ctx)).status, 200);
  assert.equal((await consoleFn(new Request(`https://hub.example${base}/api/state`), ctx)).status, 401);
  const h = { 'X-Console': '1' };
  assert.equal((await consoleFn(post(`${base}/api/login`, { password: 'nope' }, h), ctx)).status, 401);
  assert.equal((await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery' }), ctx)).status, 403, 'no header: refused');
  assert.deepEqual(await (await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery' }, h), ctx)).json(), { needCode: true });
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(Date.now() / 30_000));
  const signedIn = await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery', code }, h), ctx);
  assert.equal(signedIn.status, 200);
  const jar = signedIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.match(jar, /hnmo_device=.*hnmo_session=/);
  const as = { ...h, cookie: jar };

  // A server asks for a licence; the owner issues it; the server fetches it with its secret.
  const token = 'tok_' + 'x'.repeat(30);
  const asked = await (await requestFn(post('/api/request', { machine: MACHINE, name: 'Minh', players: 40, token, version: '1.0' }), ctx)).json() as { request: string };
  assert.ok(asked.request);
  assert.equal((await consoleFn(post(`${base}/api/issue`, { request: asked.request, licensee: 'Minh', maxPlayers: 40, machine: MACHINE }, as), ctx)).status, 400, 'no licence key yet');
  const made = await (await consoleFn(post(`${base}/api/make-key`, {}, as), ctx)).json() as { publicPem: string };
  assert.match(made.publicPem, /BEGIN PUBLIC KEY/);
  const issued = await (await consoleFn(post(`${base}/api/issue`, { request: asked.request, licensee: 'Minh', maxPlayers: 40, machine: MACHINE }, as), ctx)).json() as { licence: { id: string; file: string } };
  assert.equal((await requestFn(post('/api/licence', { machine: MACHINE, request: asked.request, token: 'tok_wrong' + 'x'.repeat(30) }), ctx)).status, 404, 'another secret gets nothing');
  const answer = await (await requestFn(post('/api/licence', { machine: MACHINE, request: asked.request, token }), ctx)).json() as { status: string; licence: string };
  assert.equal(answer.status, 'issued');
  assert.equal(answer.licence, issued.licence.file);
  assert.equal(checkLicence(answer.licence, '2026-11-20', made.publicPem).valid, true);

  // The state lists it all, never the request's secret.
  const state = await (await consoleFn(new Request(`https://hub.example${base}/api/state`, { headers: { cookie: jar } }), ctx)).json() as Record<string, unknown[]>;
  assert.equal(state.requests.length, 1);
  assert.equal(JSON.stringify(state).includes('tokenHash'), false);

  // The weekly report: once in six days; a withdrawn licence is told.
  const weekly = { machine: MACHINE, version: '1.0', licence: answer.licence, players: { peak: 30, limit: 40 }, bugs: [{ text: 'Twisting Slash shows no effect', category: 'skill' }] };
  const first = await (await weeklyFn(post('/api/weekly', weekly), ctx)).json() as { ok: boolean; bugs: number; revoked: boolean };
  assert.deepEqual([first.ok, first.bugs, first.revoked], [true, 1, false]);
  assert.equal((await weeklyFn(post('/api/weekly', weekly), ctx)).status, 429, 'not twice in a week');
  const host = JSON.parse(store.data.get(`hosts/${MACHINE}`)!);
  assert.equal(host.licensee, 'Minh');
  assert.equal([...store.data.keys()].filter((k) => k.startsWith('pending/')).length, 1);
  await consoleFn(post(`${base}/api/revoke`, { licence: issued.licence.id }, as), ctx);
  host.lastSeen = new Date(Date.now() - 7 * 86400_000).toISOString();
  store.data.set(`hosts/${MACHINE}`, JSON.stringify(host));
  const second = await (await weeklyFn(post('/api/weekly', weekly), ctx)).json() as { revoked: boolean };
  assert.equal(second.revoked, true);

  // Removing the browser ends its session.
  const devices = (state.devices as { id: string }[]);
  await consoleFn(post(`${base}/api/forget-device`, { device: devices[0].id }, as), ctx);
  assert.equal((await consoleFn(new Request(`https://hub.example${base}/api/state`, { headers: { cookie: jar } }), ctx)).status, 401);
  useStoreForTests(null);
});

test('browser trust lasts 365 days from each successful sign-in', async (context) => {
  const store = memoryStore();
  useStoreForTests(store);
  context.after(() => useStoreForTests(null));
  const day = 86400_000;
  const start = Date.now();
  let now = start;
  context.mock.method(Date, 'now', () => now);
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  const login = (password: string, device?: string, code?: string) =>
    consoleFn(post(`${base}/api/login`, { password, code }, { 'X-Console': '1', cookie: device ?? '' }), ctx);
  const password = 'correct horse battery';
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(start / 30_000));
  const first = await login(password, undefined, code);
  assert.deepEqual(await first.json(), { ok: true });
  const [deviceCookie, sessionCookie] = first.headers.getSetCookie();
  assert.match(deviceCookie, /Max-Age=31536000; HttpOnly; Secure; SameSite=Strict/);
  assert.match(sessionCookie, /Max-Age=43200; HttpOnly; Secure; SameSite=Strict/);
  const device = unsign<{ exp: number; d: string }>(deviceCookie.split(';')[0].split('=')[1])!;
  assert.equal(device.exp, start + 365 * day);

  const returning = start + 20 * day;
  now = returning;
  const oldCookie = `hnmo_device=${sign({ d: device.d, exp: start + 30 * day })}`;
  const wrong = await login('wrong', oldCookie);
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.headers.getSetCookie(), []);
  const renewed = await login(password, oldCookie);
  assert.deepEqual(await renewed.json(), { ok: true });
  const [renewedCookie] = renewed.headers.getSetCookie();
  assert.match(renewedCookie, /Max-Age=31536000;/);
  assert.deepEqual(unsign(renewedCookie.split(';')[0].split('=')[1]), { exp: returning + 365 * day, d: device.d });
  assert.equal([...store.data.keys()].filter((key) => key.startsWith('devices/')).length, 1);

  now = returning + 365 * day + 1;
  const expired = await login(password, renewedCookie.split(';')[0]);
  assert.deepEqual(await expired.json(), { needCode: true });
  assert.deepEqual(expired.headers.getSetCookie(), []);
});

test('first use: the hub key proves it is the developer; the password and authenticator key are set once', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const saved = { hash: process.env.CONSOLE_PASSWORD_HASH, totp: process.env.CONSOLE_TOTP_SECRET };
  delete process.env.CONSOLE_PASSWORD_HASH;
  delete process.env.CONSOLE_TOTP_SECRET;
  process.env.HUB_KEY = 'h'.repeat(64);
  try {
    const base = `/c/${process.env.CONSOLE_SLUG}`;
    const h = { 'X-Console': '1' };
    assert.deepEqual(await (await consoleFn(new Request(`https://hub.example${base}/api/status`), ctx)).json(), { configured: false });
    assert.equal((await consoleFn(post(`${base}/api/login`, { password: 'whatever long one' }, h), ctx)).status, 409, 'nothing to sign in with yet');
    assert.equal((await consoleFn(post(`${base}/api/setup`, { hubKey: 'wrong', password: 'a fine long password' }, h), ctx)).status, 401);
    assert.equal((await consoleFn(post(`${base}/api/setup`, { hubKey: 'h'.repeat(64), password: 'short' }, h), ctx)).status, 400);
    const made = await (await consoleFn(post(`${base}/api/setup`, { hubKey: 'h'.repeat(64), password: 'a fine long password' }, h), ctx)).json() as { totpSecret: string; otpauth: string };
    assert.match(made.otpauth, /^otpauth:\/\/totp\//);
    assert.equal((await consoleFn(post(`${base}/api/setup`, { hubKey: 'h'.repeat(64), password: 'another long password' }, h), ctx)).status, 409, 'set once');
    assert.equal(JSON.stringify([...store.data.values()]).includes('a fine long password'), false, 'only the hash is kept');
    const code = totpCode(made.totpSecret, Math.floor(Date.now() / 30_000));
    const signedIn = await consoleFn(post(`${base}/api/login`, { password: 'a fine long password', code }, h), ctx);
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await (await consoleFn(new Request(`https://hub.example${base}/api/status`), ctx)).json(), { configured: true });
  } finally {
    process.env.CONSOLE_PASSWORD_HASH = saved.hash;
    process.env.CONSOLE_TOTP_SECRET = saved.totp;
    useStoreForTests(null);
  }
});

test('the same bug from two servers is one issue that counts both', () => {
  const now = '2026-11-20T05:00:00Z';
  const bug = (text: string) => ({ id: 'B1', category: 'skill', text, server: '', place: '', status: '', info: '', reply: '', character: '', created: '' });
  const a = { kind: 'bug' as const, receivedAt: now, machine: 'aaaaaaaa', version: '1.0', licensee: 'Friends server', licenceProblem: null, bug: bug('Twisting Slash shows no effect!') };
  const b = { ...a, machine: 'bbbbbbbb', version: '1.1', licensee: null, bug: bug('twisting slash   shows no effect') };
  assert.equal(bugKey('skill', a.bug.text), bugKey('skill', b.bug.text));
  const issue = bugIssue(a, bugKey('skill', a.bug.text), addSeen(null, a));
  assert.deepEqual(issue.labels, ['hnmo-report', 'bug', 'area:skill', 'licensed']);
  const body = withSeen(issue.body, addSeen(readSeen(issue.body), b));
  assert.match(body, /Seen 2 times on 2 servers/);
  assert.equal(noMention('ask @admin'), 'ask @​admin');
  const summary = summaryBody([{ number: 1, title: '[skill] a', body: '', state: 'open', labels: [{ name: 'bug' }, { name: 'area:skill' }], updated_at: new Date().toISOString() }], '2026-11-21', new Date());
  assert.match(summary, /Open bugs: 1 \(skill 1\)/);
});

test('a licence seen on two computers is withdrawn by itself; the old and new id of one computer count once; giving it back allows more', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  const h = { 'X-Console': '1' };
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(Date.now() / 30_000));
  const signedIn = await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery', code }, h), ctx);
  const jar = signedIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const as = { ...h, cookie: jar };
  await consoleFn(post(`${base}/api/make-key`, {}, as), ctx);
  const issued = await (await consoleFn(post(`${base}/api/issue`, { licensee: 'Shared', maxPlayers: 30 }, as), ctx)).json() as { licence: { id: string; file: string } };
  const weekly = (machine: string, legacyMachine?: string) => ({ machine, legacyMachine, version: '1.1', licence: issued.licence.file, players: { peak: 3, limit: 30 } });
  const OLD = 'aaaaaaaaaaaaaaaa', NEW = 'bbbbbbbbbbbbbbbb', OTHER = 'cccccccccccccccc';

  // One computer: first under its old id, then (after the update) its real id with the old one beside it.
  assert.equal((await (await weeklyFn(post('/api/weekly', weekly(OLD)), ctx)).json() as { revoked: boolean }).revoked, false);
  const moved = await (await weeklyFn(post('/api/weekly', weekly(NEW, OLD)), ctx)).json() as { revoked: boolean; error?: string };
  assert.equal(moved.error, 'too soon', 'the same server under its new id: still once in six days');
  const host = JSON.parse(store.data.get(`hosts/${OLD}`)!);
  host.lastSeen = new Date(Date.now() - 7 * 86400_000).toISOString();
  store.data.set(`hosts/${OLD}`, JSON.stringify(host));
  assert.equal((await (await weeklyFn(post('/api/weekly', weekly(NEW, OLD)), ctx)).json() as { revoked: boolean }).revoked, false, 'old and new id: one computer');
  assert.equal(store.data.has(`hosts/${OLD}`), false, 'its record moved to the new id');
  assert.equal(JSON.parse(store.data.get(`hosts/${NEW}`)!).weeks.length, 2);

  // Another computer with the same licence: withdrawn, with the reason the console shows.
  const shared = await (await weeklyFn(post('/api/weekly', weekly(OTHER)), ctx)).json() as { revoked: boolean };
  assert.equal(shared.revoked, true);
  type Lic = { id: string; revoked: string | null; revokedReason?: string; manyComputers?: boolean; computers: { machine: string }[] };
  const state = async () => (await (await consoleFn(new Request(`https://hub.example${base}/api/state`, { headers: { cookie: jar } }), ctx)).json() as { licences: Lic[] }).licences[0];
  const withdrawn = await state();
  assert.ok(withdrawn.revoked);
  assert.match(withdrawn.revokedReason!, /seen on 2 computers: bbbbbbbbbbbbbbbb, cccccccccccccccc/);
  assert.deepEqual(withdrawn.computers.map((c) => c.machine), [NEW, OTHER]);

  // The developer gives it back: more computers are fine for it from then on.
  await consoleFn(post(`${base}/api/revoke`, { licence: issued.licence.id, undo: true }, as), ctx);
  const back = await state();
  assert.equal(back.revoked, null);
  assert.equal(back.manyComputers, true);
  const otherHost = JSON.parse(store.data.get(`hosts/${OTHER}`)!);
  otherHost.lastSeen = new Date(Date.now() - 7 * 86400_000).toISOString();
  store.data.set(`hosts/${OTHER}`, JSON.stringify(otherHost));
  assert.equal((await (await weeklyFn(post('/api/weekly', weekly(OTHER)), ctx)).json() as { revoked: boolean }).revoked, false);
  useStoreForTests(null);
});

test('the first-setup report keeps the system, the game, the host and the IP with its country; a licence fetch takes the old id', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const report = {
    machine: 'dddddddddddddddd', legacyMachine: 'eeeeeeeeeeeeeeee', version: '1.2',
    system: { os: 'Microsoft Windows 10.0.22631', arch: 'X64', cpu: 'Intel(R) Core(TM) i7-9700', cores: 8, ramGb: 15.94, freeDiskGb: 120.4, dotnet: '.NET 10.0.0' },
    game: { name: 'HenryN Mu Online', servers: [0, 1], seasons: ['s6', 'arena', 'evil'], publicAddress: 'mu.example.net', language: 'vi-VN' },
    host: { name: 'Minh', contact: 'zalo 0900' },
    password: 'never kept',
  };
  const geo = { ...ctx, geo: { country: { code: 'VN', name: 'Vietnam' } } };
  assert.equal((await setupFn(post('/api/setup', { machine: 'x' }), geo)).status, 400);
  assert.equal((await setupFn(post('/api/setup', report), geo)).status, 200);
  const kept = JSON.parse(store.data.get('setups/dddddddddddddddd')!);
  assert.equal(kept.ip, '203.0.113.9');
  assert.equal(kept.country, 'VN · Vietnam');
  assert.equal(kept.legacyMachine, 'eeeeeeeeeeeeeeee');
  assert.equal(kept.system.ramGb, 15.9);
  assert.deepEqual(kept.game.seasons, ['s6', 'arena']);
  assert.deepEqual(kept.host, { name: 'Minh', contact: 'zalo 0900' });
  assert.equal(JSON.stringify(kept).includes('never kept'), false);
  assert.equal((await setupFn(post('/api/setup', report), geo)).status, 200);
  assert.equal(JSON.parse(store.data.get('setups/dddddddddddddddd')!).times, 2);
  await setupFn(post('/api/setup', report), geo);
  assert.equal((await setupFn(post('/api/setup', report), geo)).status, 429, 'three a day per computer');

  // A request made under the old id: its answer is fetched after the update with the new id and the old one beside it.
  const token = 'tok_' + 'y'.repeat(30);
  const asked = await (await requestFn(post('/api/request', { machine: 'eeeeeeeeeeeeeeee', name: 'Minh', players: 20, token }), ctx)).json() as { request: string };
  assert.equal((await requestFn(post('/api/licence', { machine: 'dddddddddddddddd', request: asked.request, token }), ctx)).status, 404, 'without the old id: another computer');
  const answer = await (await requestFn(post('/api/licence', { machine: 'dddddddddddddddd', legacyMachine: 'eeeeeeeeeeeeeeee', request: asked.request, token }), ctx)).json() as { status: string };
  assert.equal(answer.status, 'open');
  useStoreForTests(null);
});

test('the weekly report names the MU and its host; test machines are told apart, by the server or the developer', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(Date.now() / 30_000));
  const signedIn = await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery', code }, { 'X-Console': '1' }), ctx);
  const jar = signedIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const as = { 'X-Console': '1', cookie: jar };
  const REAL = '1111222233334444', DEV = '5555666677778888';
  await weeklyFn(post('/api/weekly', { machine: REAL, version: '1.0', game: { name: 'Mu Rồng Vàng' }, host: { name: 'Minh', contact: 'zalo 0900' } }), ctx);
  await weeklyFn(post('/api/weekly', { machine: DEV, version: '1.0', test: true }), ctx);
  type Host = { machine: string; test: boolean; latest: { game: { name: string }; host: { name: string; contact: string } } };
  const hosts = async () => (await (await consoleFn(new Request(`https://hub.example${base}/api/state`, { headers: { cookie: jar } }), ctx)).json() as { hosts: Host[] }).hosts;
  let list = await hosts();
  const real = list.find((h) => h.machine === REAL)!;
  assert.deepEqual([real.test, real.latest.game.name, real.latest.host.name, real.latest.host.contact], [false, 'Mu Rồng Vàng', 'Minh', 'zalo 0900']);
  assert.equal(list.find((h) => h.machine === DEV)!.test, true, 'the server said it is a test machine');

  // The developer's mark wins, for one or several at once, and survives the next report.
  await consoleFn(post(`${base}/api/mark`, { machines: [REAL, DEV], test: true }, as), ctx);
  assert.deepEqual((await hosts()).map((h) => h.test), [true, true]);
  await consoleFn(post(`${base}/api/mark`, { machine: DEV, test: false }, as), ctx);
  list = await hosts();
  assert.equal(list.find((h) => h.machine === DEV)!.test, false, 'marked real although the server says test');
  assert.equal((await consoleFn(post(`${base}/api/mark`, { machine: 'nope', test: true }, as), ctx)).status, 400);
  useStoreForTests(null);
});

test('the newest release: set in the console, read by HNMO servers at /api/latest, none while the link is empty', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  const base = `/c/${process.env.CONSOLE_SLUG}`;
  const code = totpCode(process.env.CONSOLE_TOTP_SECRET!, Math.floor(Date.now() / 30_000));
  const signedIn = await consoleFn(post(`${base}/api/login`, { password: 'correct horse battery', code }, { 'X-Console': '1' }), ctx);
  const as = { 'X-Console': '1', cookie: signedIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
  assert.equal((await latestFn(new Request('https://hub.example/api/latest'))).status, 404, 'none yet');
  assert.equal((await consoleFn(post(`${base}/api/latest`, { tag: '1.0.0', url: 'http://plain.example/HNMO.zip' }, as), ctx)).status, 400, 'https only');
  assert.equal((await consoleFn(post(`${base}/api/latest`, { tag: 'v1' }, as), ctx)).status, 400, 'a version like 1.0.0');
  process.env.UPDATES_URL = 'https://updates.example/';
  await consoleFn(post(`${base}/api/latest`, { tag: '1.2.0', notes: 'Arena' }, as), ctx);
  const fromStorage = await (await latestFn(new Request('https://hub.example/api/latest'))).json() as Record<string, string>;
  assert.equal(fromStorage.html_url, 'https://updates.example/releases/1.2.0/HNMO.zip', 'no link: the release\'s own zip');
  assert.equal(fromStorage.manifest_url, 'https://updates.example/releases/1.2.0/manifest.json');
  assert.equal(fromStorage.files_url, 'https://updates.example/files/');
  await consoleFn(post(`${base}/api/latest`, { tag: '1.2.0', url: 'https://downloads.example/HNMO.zip', notes: 'Arena' }, as), ctx);
  const latest = await (await latestFn(new Request('https://hub.example/api/latest'))).json() as Record<string, string>;
  assert.equal(latest.tag_name, '1.2.0');
  assert.equal(latest.html_url, 'https://downloads.example/HNMO.zip');
  assert.equal(latest.body, 'Arena');
  assert.ok(latest.published_at);
  await consoleFn(post(`${base}/api/latest`, { tag: '' }, as), ctx);
  delete process.env.UPDATES_URL;
  assert.equal((await latestFn(new Request('https://hub.example/api/latest'))).status, 404, 'cleared');
  useStoreForTests(null);
});

test('the console reads its records in parallel, all of them, in order', async () => {
  const store = memoryStore();
  for (let i = 0; i < 40; i++) await store.setJSON(`hosts/${String(i).padStart(2, '0')}`, { n: i });
  await store.setJSON('requests/x', { n: -1 });
  const data = store.data;
  let inFlight = 0;
  let most = 0;
  store.get = (async (key: string) => {
    inFlight++;
    most = Math.max(most, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    const value = data.get(key);
    return value === undefined ? null : JSON.parse(value);
  }) as typeof store.get;
  const values = await listJson<{ n: number }>(store, 'hosts/');
  assert.deepEqual(values.map((v) => v.n), Array.from({ length: 40 }, (_, i) => i));
  assert.equal(most, READ_AT_ONCE, 'one at a time made the console slow');
});

test('licence packages can be changed and orders reviewed only through the authenticated console', async () => {
  const store = memoryStore();
  useStoreForTests(store);
  try {
    const path = '/c/' + process.env.CONSOLE_SLUG + '/api/licence-commerce';
    const headers = { 'X-Console': '1' };
    const body = { packages: [{ id: 'test', name: 'Fictional', description: 'Fictional', currency: 'vnd', unitAmount: 150000 }] };
    assert.equal((await consoleFn(post(path, body, headers), ctx)).status, 401);
    assert.equal((await consoleFn(new Request('https://hub.example' + path), ctx)).status, 401);
    await store.setJSON('devices/fictional', { id: 'fictional' });
    const token = sign({ d: 'fictional', exp: Date.now() + 60_000 });
    const Cookie = 'hnmo_session=' + token;
    assert.equal((await consoleFn(post(path, body, { Cookie }), ctx)).status, 403);
    assert.equal((await consoleFn(post(path, body, { ...headers, Cookie }), ctx)).status, 200);
    const response = await consoleFn(new Request('https://hub.example' + path, { headers: { Cookie } }), ctx);
    assert.deepEqual(await response.json(), { packages: body.packages, orders: [] });
  } finally {
    useStoreForTests(null);
  }
});
