// POST /api/weekly: an HNMO server's weekly report (once in 6 days per computer): its licence, version, players, health,
// features and up to 50 bug reports its owner forwarded. The answer tells the server whether its licence was withdrawn.
// The bug reports wait for the daily GitHub Action (tools/reports-to-issues.mts). A licence seen on 2 or more computers
// lately is withdrawn by itself (owner, 2026-11-21); a server that moved to the real machine id sends its old id too
// (legacyMachine), and its record moves to the new id.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { checkLicence } from '../lib/license.mts';
import { cleanAutoError, cleanMachine, cleanWeekly, WEEKLY_MIN_DAYS, type Stored } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';
import { checkAutoErrorKey } from '../lib/shop.mts';
import { clientIp, countOnce, hub, ipHash, json, licenceKeys, noteCloneSighting, noteLicenceUse, withdrawIfShared, type HostRecord, type LicenceRecord } from '../lib/hub.mts';

const DAY = 24 * 3600 * 1000;

function mayForwardWithSetting(machine: string, supplied: unknown): boolean {
  if (typeof supplied !== 'string' || supplied.length < 32 || supplied.length > 256) return false;
  try {
    const keys = JSON.parse(process.env.AUTO_ERROR_FORWARD_KEYS ?? '{}') as Record<string, unknown>;
    const expected = keys?.[machine];
    if (typeof expected !== 'string' || expected.length < 32) return false;
    const digest = (secret: string) => createHash('sha256').update(secret).digest();
    return timingSafeEqual(digest(expected), digest(supplied));
  } catch { return false; }
}

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  if (raw.length > 300_000) return json({ error: 'too big' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'not a weekly report' }, 400);
  const machine = cleanMachine(body.machine);
  const legacy = cleanMachine(body.legacyMachine);
  const weekly = cleanWeekly(body);
  if (!machine || !weekly) return json({ error: 'not a weekly report' }, 400);
  const automatic = Array.isArray(body.autoErrors) ? body.autoErrors.slice(0, 50) : [];
  const supplied = req.headers.get('x-hnmo-auto-error-key');
  // The key the hub gave the computer (setup answer), or one the developer set in AUTO_ERROR_FORWARD_KEYS.
  if (automatic.length && !(mayForwardWithSetting(machine, supplied) || await checkAutoErrorKey(hub(), machine, supplied))) {
    return json({ error: 'automatic report credential' }, 403);
  }

  const store = hub();
  const now = new Date();
  const today = sydneyDay(now);
  const key = `hosts/${machine}`;
  let previous = (await store.get(key, { type: 'json' })) as HostRecord | null;
  if (!previous && legacy && legacy !== machine) {
    // The same server under its old id: its record moves to the new one.
    previous = (await store.get(`hosts/${legacy}`, { type: 'json' })) as HostRecord | null;
  }
  if (previous && now.getTime() - Date.parse(previous.lastSeen) < WEEKLY_MIN_DAYS * DAY) {
    const next = new Date(Date.parse(previous.lastSeen) + WEEKLY_MIN_DAYS * DAY).toISOString();
    return json({ error: 'too soon', next }, 429);
  }
  // Many servers behind one connection are fine; a flood from one is not.
  const ip = clientIp(req, context);
  if (!(await countOnce(store, `limits/${today}/weekly/ip-${ipHash(ip)}`, 50))) return json({ error: 'limit' }, 429);

  const licence = checkLicence(body.licence ?? null, today, await licenceKeys(store));
  const issued = licence.valid && licence.id ? (await store.get(`licences/${licence.id}`, { type: 'json' })) as LicenceRecord | null : null;
  const computers = issued ? await noteLicenceUse(store, issued.id, machine, legacy && legacy !== machine ? legacy : null, now) : [];
  const revoked = issued ? await withdrawIfShared(store, issued, computers, now) : false;
  if (licence.valid && licence.id) {
    await noteCloneSighting(store, licence.id, {
      machine,
      legacyMachine: legacy,
      fingerprint: body.fingerprint,
      os: weekly.os,
      ip,
    }, now);
  }
  const { bugs, ...latest } = weekly;
  const record: HostRecord = {
    machine,
    firstSeen: previous?.firstSeen ?? now.toISOString(),
    lastSeen: now.toISOString(),
    licensee: licence.valid ? licence.licensee : null,
    licenceId: licence.valid ? licence.id : null,
    licenceExpires: licence.valid ? licence.expires : null,
    licenceProblem: licence.valid ? (revoked ? 'withdrawn' : null) : (licence.reason === 'none' ? null : licence.reason),
    latest,
    bugsSent: (previous?.bugsSent ?? 0) + bugs.length,
    weeks: [...(previous?.weeks ?? []), { at: now.toISOString(), peak: latest.players.peak, crashes: latest.health.crashes, errors: latest.health.errors, online: latest.players.online }].slice(-12),
  };
  const autoAccepted = new Set<string>();
  for (const entry of automatic) {
    const auto = cleanAutoError(entry);
    if (!auto || autoAccepted.has(auto.approval)) continue;

    // A sender retry can arrive after the daily issue job moved the entry to done.
    const name = `automatic-${machine}-${auto.bug.server}-${auto.approval}`;
    const pending = `pending/${name}`;
    if (!await store.get(`done/${name}`, { type: 'json' }) && !await store.get(pending, { type: 'json' })) {
      const stored: Stored = { kind: 'bug', receivedAt: now.toISOString(), machine, version: latest.version,
        licensee: record.licensee, licenceProblem: record.licenceProblem, bug: auto.bug };
      await store.setJSON(pending, stored);
    }
    autoAccepted.add(auto.approval);
  }

  await store.setJSON(key, record);
  if (legacy && legacy !== machine && previous?.machine === legacy) await store.delete(`hosts/${legacy}`);

  for (const bug of bugs) {
    const stored: Stored = { kind: 'bug', receivedAt: now.toISOString(), machine, version: latest.version, licensee: record.licensee, licenceProblem: record.licenceProblem, bug };
    await store.setJSON(`pending/${now.toISOString()}-${randomUUID().slice(0, 8)}`, stored);
  }
  return json({ ok: true, bugs: bugs.length, autoAccepted: [...autoAccepted], revoked, next: new Date(now.getTime() + WEEKLY_MIN_DAYS * DAY).toISOString() });
};

export const config = { path: '/api/weekly' };
