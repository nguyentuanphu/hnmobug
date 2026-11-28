// POST /api/request: an HNMO server asks for a licence (Host settings, "Ask the HNMO developer for a licence"). It sends
// a one-time secret only it knows; the licence the developer issues in the console comes back to it through
// /api/licence with that secret. A computer may ask 3 times a Sydney day.
// POST /api/licence {machine, request, token, needAutoErrorKey?}: the answer to a request: waiting, issued (with the licence
// file) or declined, and a new automatic error key when the server asks for one.
import { randomUUID } from 'node:crypto';
import { checkLicence } from '../lib/license.mts';
import { cleanMachine, cleanRequest, REQUESTS_PER_DAY } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';
import { authenticRequest, clientIp, countOnce, hub, ipHash, json, licenceKeys, tokenHash, type RequestRecord } from '../lib/hub.mts';
import { deliverPending, newAutoErrorKey, retryAfterSeconds } from '../lib/shop.mts';

export default async (req: Request, context: { ip?: string }) => {
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
  if (!machine) return json({ error: 'machine' }, 400);
  const store = hub();
  const path = new URL(req.url).pathname;

  if (path.endsWith('/licence')) {
    const record = await authenticRequest(store, body, machine, cleanMachine(body.legacyMachine));
    if (!record) return json({ error: 'unknown request' }, 404);
    // The server keeps its automatic error key; it asks for a new one when it has none (the old one stops working).
    const autoErrorKey = body.needAutoErrorKey === true ? await newAutoErrorKey(store, record.machine) : undefined;
    // An open request says when to ask again: every 30 seconds while its order is being paid, else every 6 hours.
    const retry = record.status === 'open' ? { retryAfterSeconds: await retryAfterSeconds(store, record) } : {};
    return json({ status: record.status, licence: record.status === 'issued' ? record.licence : null, ...retry, ...(autoErrorKey ? { autoErrorKey } : {}) });
  }

  const request = cleanRequest(body);
  if (!request) return json({ error: 'not a request' }, 400);
  const today = sydneyDay();
  for (const who of [`m-${machine}`, `ip-${ipHash(clientIp(req, context))}`]) {
    if (!(await countOnce(store, `limits/${today}/request/${who}`, REQUESTS_PER_DAY))) {
      return json({ error: 'limit', message: `This computer asked ${REQUESTS_PER_DAY} times today; more tomorrow (Sydney time).` }, 429);
    }
  }
  const licence = checkLicence(body.licence ?? null, today, await licenceKeys(store));
  const record: RequestRecord = {
    id: `${today}-${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    machine,
    version: typeof body.version === 'string' ? body.version.slice(0, 40) : '',
    licensee: licence.valid ? licence.licensee : null,
    name: request.name,
    contact: request.contact,
    players: request.players,
    message: request.message,
    tokenHash: tokenHash(request.token),
    status: 'open',
  };
  await store.setJSON(`requests/${record.id}`, record);
  // A licence bought for this computer from another one (a move or a second machine) comes with this request.
  await deliverPending(store, record);
  return json({ ok: true, request: record.id });
};

export const config = { path: ['/api/request', '/api/licence'] };
