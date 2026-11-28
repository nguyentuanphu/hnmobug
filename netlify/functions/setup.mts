// POST /api/setup: an HNMO server's first-setup report (owner's choice, 2026-11-21), sent once about ten minutes after its
// first start: its system (OS, CPU and cores, RAM, free disk, HNMO and .NET versions, machine id), its game (name,
// servers and seasons on, public address, language) and the host's optional name and contact. The hub keeps it with the
// IP it came from and that IP's country; the server's setup page tells the host so. Never player accounts. The first
// answer brings the computer's automatic error key (autoErrorKey).
import { checkLicence } from '../lib/license.mts';
import { cleanMachine, cleanSetup, SETUPS_PER_DAY } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';
import { clientIp, countOnce, hub, ipHash, json, licenceKeys, noteCloneSighting, type SetupRecord } from '../lib/hub.mts';
import { firstAutoErrorKey } from '../lib/shop.mts';

interface Geo { country?: { code?: string; name?: string } }

export default async (req: Request, context: { ip?: string; geo?: Geo }) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  if (raw.length > 20_000) return json({ error: 'too big' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  const machine = cleanMachine(body.machine);
  const setup = cleanSetup(body);
  if (!machine || !setup) return json({ error: 'not a setup report' }, 400);

  const store = hub();
  const today = sydneyDay();
  const ip = clientIp(req, context);
  for (const who of [`m-${machine}`, `ip-${ipHash(ip)}`]) {
    if (!(await countOnce(store, `limits/${today}/setup/${who}`, who.startsWith('m-') ? SETUPS_PER_DAY : 20))) return json({ error: 'limit' }, 429);
  }
  const legacy = cleanMachine(body.legacyMachine);
  const licence = checkLicence(body.licence ?? null, today, await licenceKeys(store));
  const previous = (await store.get(`setups/${machine}`, { type: 'json' })) as SetupRecord | null;
  const now = new Date().toISOString();
  const country = context.geo?.country?.code ? `${context.geo.country.code}${context.geo.country.name ? ' · ' + context.geo.country.name : ''}` : (req.headers.get('x-country') ?? '').slice(0, 40);
  const record: SetupRecord = {
    machine,
    legacyMachine: legacy && legacy !== machine ? legacy : null,
    at: now,
    firstAt: previous?.firstAt ?? now,
    times: (previous?.times ?? 0) + 1,
    version: typeof body.version === 'string' ? body.version.slice(0, 40) : '',
    licensee: licence.valid ? licence.licensee : null,
    ip: ip.slice(0, 60),
    country,
    ...setup,
  };
  await store.setJSON(`setups/${machine}`, record);
  if (licence.valid && licence.id) {
    await noteCloneSighting(store, licence.id, {
      machine,
      legacyMachine: legacy,
      fingerprint: body.fingerprint,
      os: setup.system.os,
      arch: setup.system.arch,
      cpu: setup.system.cpu,
      cores: setup.system.cores,
      ramGb: setup.system.ramGb,
      ip,
    }, new Date());
  }
  // The computer's automatic error key, the first time only (the server keeps it; it asks /api/licence for a new one).
  const autoErrorKey = await firstAutoErrorKey(store, machine);
  return json({ ok: true, ...(autoErrorKey ? { autoErrorKey } : {}) });
};

export const config = { path: '/api/setup' };
