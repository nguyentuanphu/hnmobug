// GET /api/latest: the newest HNMO release as the developer set it in the console (Security): its version, date, notes
// and download link. HNMO servers' update check and the "Download HNMO" link of their website read it, so no HNMO
// folder ever points at where HNMO is built. 404 while none is set.
import { hub, json } from '../lib/hub.mts';

export interface LatestRelease { tag: string; url: string; notes: string; published: string }

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  const latest = (await hub().get('config/latest', { type: 'json' })) as LatestRelease | null;
  if (!latest || !latest.url) return json({ error: 'none' }, 404);
  // The field names of the usual release feeds, so the servers read it with the same code.
  return json({ tag_name: latest.tag, published_at: latest.published, body: latest.notes, html_url: latest.url }, 200, { 'Cache-Control': 'public, max-age=300' });
};

export const config = { path: '/api/latest' };
