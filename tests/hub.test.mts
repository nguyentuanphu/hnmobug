// The hub, without Netlify: the licence check, sign-in, the console's licences, licence requests and their answer, the
// weekly report and its limit, and how bug reports group into issues. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { checkLicence } from '../netlify/lib/license.mts';
import { checkPassword, checkTotp, hashPassword, sign, totpCode, unsign } from '../netlify/lib/auth.mts';
import { makeLicenceKey, privatePem, signLicence } from '../netlify/lib/keys.mts';
import { cleanRequest, cleanWeekly } from '../netlify/lib/report.mts';
import { useStoreForTests } from '../netlify/lib/hub.mts';
import { addSeen, bugIssue, bugKey, noMention, readSeen, summaryBody, withSeen } from '../tools/reports-to-issues.mts';
import { memoryStore } from './memory-store.mts';
import consoleFn from '../netlify/functions/console.mts';
import requestFn from '../netlify/functions/report.mts';
import weeklyFn from '../netlify/functions/weekly.mts';

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
  assert.equal((await consoleFn(new Request('https://hub.example/c/other/'), ctx)).status, 404, 'another path is the cover site');
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
