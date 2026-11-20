// POST /api/weekly: an HNMO server's weekly report (once in 6 days per computer): its licence, version, players, health,
// features and up to 50 bug reports its owner forwarded. The answer tells the server whether its licence was withdrawn.
// The bug reports wait for the daily GitHub Action (tools/reports-to-issues.mts).
import { randomUUID } from 'node:crypto';
import { checkLicence } from '../lib/license.mts';
import { cleanMachine, cleanWeekly, WEEKLY_MIN_DAYS, type Stored } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';
import { clientIp, countOnce, hub, ipHash, json, licenceKeys, type HostRecord, type LicenceRecord } from '../lib/hub.mts';

const DAY = 24 * 3600 * 1000;

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
  const machine = cleanMachine(body.machine);
  const weekly = cleanWeekly(body);
  if (!machine || !weekly) return json({ error: 'not a weekly report' }, 400);

  const store = hub();
  const now = new Date();
  const today = sydneyDay(now);
  const key = `hosts/${machine}`;
  const previous = (await store.get(key, { type: 'json' })) as HostRecord | null;
  if (previous && now.getTime() - Date.parse(previous.lastSeen) < WEEKLY_MIN_DAYS * DAY) {
    const next = new Date(Date.parse(previous.lastSeen) + WEEKLY_MIN_DAYS * DAY).toISOString();
    return json({ error: 'too soon', next }, 429);
  }
  // Many servers behind one connection are fine; a flood from one is not.
  if (!(await countOnce(store, `limits/${today}/weekly/ip-${ipHash(clientIp(req, context))}`, 50))) return json({ error: 'limit' }, 429);

  const licence = checkLicence(body.licence ?? null, today, await licenceKeys(store));
  const issued = licence.valid && licence.id ? (await store.get(`licences/${licence.id}`, { type: 'json' })) as LicenceRecord | null : null;
  const revoked = issued?.revoked ? true : false;
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
  await store.setJSON(key, record);

  for (const bug of bugs) {
    const stored: Stored = { kind: 'bug', receivedAt: now.toISOString(), machine, version: latest.version, licensee: record.licensee, licenceProblem: record.licenceProblem, bug };
    await store.setJSON(`pending/${now.toISOString()}-${randomUUID().slice(0, 8)}`, stored);
  }
  return json({ ok: true, bugs: bugs.length, revoked, next: new Date(now.getTime() + WEEKLY_MIN_DAYS * DAY).toISOString() });
};

export const config = { path: '/api/weekly' };
