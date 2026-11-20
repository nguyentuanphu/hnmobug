// GET /api/reports: the reports waiting to be filed (the hourly GitHub Action and the HNMO Developer page read them).
// POST /api/reports {"done": [keys]}: they were filed; they move from pending/ to done/. Both need the hub key
// (header X-Hub-Key = the site's HUB_KEY setting = the repository's HUB_KEY Actions secret).
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function allowed(req: Request): boolean {
  const expected = process.env.HUB_KEY || '';
  const given = req.headers.get('x-hub-key') || '';
  if (expected.length < 20 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async (req: Request) => {
  if (!allowed(req)) return json({ error: 'key' }, 401);
  const store = getStore({ name: 'hub', consistency: 'strong' });
  if (req.method === 'GET') {
    const { blobs } = await store.list({ prefix: 'pending/' });
    const keys = blobs.map((b) => b.key).sort();
    const reports = [];
    for (const key of keys.slice(0, 500)) {
      const value = await store.get(key, { type: 'json' });
      if (value) reports.push({ key, ...value });
    }
    return json({ reports, more: keys.length > 500 });
  }
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { done?: unknown };
    const done = Array.isArray(body.done) ? body.done.filter((k): k is string => typeof k === 'string' && k.startsWith('pending/')).slice(0, 500) : [];
    for (const key of done) {
      const value = await store.get(key, { type: 'json' });
      if (value) await store.setJSON(key.replace(/^pending\//, 'done/'), value);
      await store.delete(key);
    }
    return json({ ok: true, moved: done.length });
  }
  return json({ error: 'GET or POST' }, 405);
};

export const config = { path: '/api/reports' };
