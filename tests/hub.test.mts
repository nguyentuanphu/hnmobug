// The hub's pure parts: the licence check (with a throwaway key), what is kept of a report, and how reports group into
// issues. node --test tests/*.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { checkLicence } from '../netlify/lib/license.mts';
import { clean, dailyLimit } from '../netlify/lib/report.mts';
import { addSeen, bugIssue, bugKey, noMention, readSeen, requestIssue, summaryBody, withSeen } from '../tools/reports-to-issues.mts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const licenceFile = (body: object, key = privateKey) => {
  const payload = Buffer.from(JSON.stringify(body));
  return JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64') });
};

test('a licence signed with the key is known; a forged, broken or expired one is not', () => {
  const good = checkLicence(licenceFile({ licensee: 'Friends server', maxPlayers: 50, expires: '2027-01-01', machine: 'abc123' }), '2026-11-20', pem);
  assert.deepEqual(good, { valid: true, licensee: 'Friends server', maxPlayers: 50, expires: '2027-01-01', machine: 'abc123' });
  const other = generateKeyPairSync('ed25519').privateKey;
  assert.deepEqual(checkLicence(licenceFile({ licensee: 'Forged', maxPlayers: 999 }, other), '2026-11-20', pem), { valid: false, reason: 'signature' });
  assert.deepEqual(checkLicence('{"payload": 1}', '2026-11-20', pem), { valid: false, reason: 'broken' });
  assert.deepEqual(checkLicence(licenceFile({ licensee: 'Old', maxPlayers: 20, expires: '2026-11-19' }), '2026-11-20', pem), { valid: false, reason: 'expired' });
  assert.deepEqual(checkLicence(null, '2026-11-20', pem), { valid: false, reason: 'none' });
});

test('the HNMO public key in the repository reads', () => {
  assert.equal(checkLicence(licenceFile({ licensee: 'x', maxPlayers: 1 }), '2026-11-20').valid, false, 'a throwaway key is not the HNMO key');
});

test('a report keeps only what it should, cut to size; anything else is refused', () => {
  const now = new Date('2026-11-20T05:00:00Z');
  const bug = clean({ kind: 'bug', machine: '8E5ABDD396D53501', category: 'weird', text: 'Twisting Slash shows no effect', password: 'x', info: 'a'.repeat(5000) }, null, null, now)!;
  assert.equal(bug.machine, '8e5abdd396d53501');
  assert.equal(bug.bug!.category, 'other');
  assert.equal(bug.bug!.info.length, 3000);
  assert.equal(JSON.stringify(bug).includes('password'), false);
  assert.equal(clean({ kind: 'bug', machine: 'abcdef12', text: 'short' }, null, null, now), null);
  assert.equal(clean({ kind: 'bug', machine: 'not hex!', text: 'long enough text here' }, null, null, now), null);
  assert.equal(clean({ kind: 'other', machine: 'abcdef12' }, null, null, now), null);
  const request = clean({ kind: 'licence-request', machine: 'abcdef12', name: 'Minh', players: 30.4 }, null, null, now)!;
  assert.equal(request.request!.players, 30);
  assert.equal(dailyLimit('bug', false), 10);
  assert.equal(dailyLimit('bug', true), 200);
});

test('the same bug from two servers is one issue that counts both', () => {
  const now = new Date('2026-11-20T05:00:00Z');
  const a = clean({ kind: 'bug', machine: 'aaaaaaaa', category: 'skill', text: 'Twisting Slash shows no effect!', version: '1.0' }, 'Friends server', null, now)!;
  const b = clean({ kind: 'bug', machine: 'bbbbbbbb', category: 'skill', text: 'twisting slash   shows no effect', version: '1.1' }, null, null, now)!;
  assert.equal(bugKey('skill', a.bug!.text), bugKey('skill', b.bug!.text));
  assert.notEqual(bugKey('skill', a.bug!.text), bugKey('item', a.bug!.text));
  const first = addSeen(null, a);
  const issue = bugIssue(a, bugKey('skill', a.bug!.text), first);
  assert.deepEqual(issue.labels, ['hnmo-report', 'bug', 'area:skill', 'licensed']);
  const second = addSeen(readSeen(issue.body), b);
  assert.deepEqual(second.servers, ['Friends server', 'unlicensed bbbbbb']);
  const body = withSeen(issue.body, second);
  assert.match(body, /Seen 2 times on 2 servers/);
  assert.deepEqual(readSeen(body)!.versions, ['1.0', '1.1']);
});

test('no GitHub account is ever mentioned; a licence request carries the signing command', () => {
  assert.equal(noMention('ask @admin'), 'ask @​admin');
  const r = clean({ kind: 'licence-request', machine: 'abcdef12', name: 'Minh "M"', players: 40, contact: '@minh' }, null, null, new Date())!;
  const issue = requestIssue(r);
  assert.match(issue.body, /sign-license\.sh "Minh 'M'" 40 - abcdef12/);
  assert.equal(issue.body.includes('@minh'), false);
});

test('the daily summary counts open bugs by area', () => {
  const now = new Date('2026-11-20T23:00:00Z');
  const body = summaryBody([
    { number: 1, title: '[skill] a', body: '', state: 'open', labels: [{ name: 'bug' }, { name: 'area:skill' }], updated_at: now.toISOString() },
    { number: 2, title: '[skill] b', body: '', state: 'closed', labels: [{ name: 'bug' }, { name: 'area:skill' }], updated_at: '2026-01-01T00:00:00Z' },
  ], '2026-11-21', now);
  assert.match(body, /Open bugs: 1 \(skill 1\)/);
  assert.match(body, /#1 \[skill\] a/);
});
