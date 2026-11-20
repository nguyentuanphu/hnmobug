// POST /api/report: an HNMO server's admin panel sends a bug report its owner forwards, or a licence request. A licensed
// server is known by its signed licence file; a server without one (the free 10 players) may send a few a day. The
// reports wait in the site's store until the hourly GitHub Action (tools/reports-to-issues.mts) files them as issues.
import { getStore } from '@netlify/blobs';
import { createHash, randomUUID } from 'node:crypto';
import { checkLicence } from '../lib/license.mts';
import { clean, dailyLimit, type Incoming } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  if (raw.length > 20_000) return json({ error: 'too big' }, 413);
  let body: Incoming;
  try { body = JSON.parse(raw) as Incoming; } catch { return json({ error: 'not JSON' }, 400); }

  const now = new Date();
  const today = sydneyDay(now);
  const licence = checkLicence(body.licence ?? null, today);
  const licensee = licence.valid ? licence.licensee : null;
  const problem = licence.valid ? null : (licence.reason === 'none' ? null : licence.reason);
  const report = clean(body, licensee, problem, now);
  if (!report) return json({ error: 'not a report' }, 400);

  // The limit counts by computer and by connection (an IP only as a salted hash), per Sydney day.
  const store = getStore({ name: 'hub', consistency: 'strong' });
  const salt = process.env.HUB_SALT || 'hnmo';
  const ipHash = createHash('sha256').update(salt + (context.ip || req.headers.get('x-nf-client-connection-ip') || '')).digest('hex').slice(0, 16);
  const limit = dailyLimit(report.kind, licensee !== null);
  for (const who of [`m-${report.machine}`, `ip-${ipHash}`]) {
    const counterKey = `limits/${today}/${report.kind}/${who}`;
    const count = Number((await store.get(counterKey)) ?? 0);
    if (count >= limit) return json({ error: 'limit', limit, message: `This computer sent ${limit} today; more tomorrow (Sydney time).` }, 429);
    await store.set(counterKey, String(count + 1));
  }

  const key = `pending/${now.toISOString()}-${randomUUID().slice(0, 8)}`;
  await store.setJSON(key, report);
  return json({ ok: true, licensed: licensee !== null, licensee });
};

export const config = { path: '/api/report' };
