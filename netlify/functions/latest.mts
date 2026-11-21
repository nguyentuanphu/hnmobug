// GET /api/latest: the newest HNMO release as the developer published it in the console (Security): its version,
// date, notes, the whole folder's download link, and where the updater finds its files (owner, 2026-11-21: updates by
// file on Cloudflare R2, UPDATES_URL = the bucket's public address). HNMO servers' "Update" and the "Download HNMO"
// link of their website read it, so no HNMO folder points at where HNMO is built. 404 while none is published.
import { hub, json } from '../lib/hub.mts';

export interface LatestRelease { tag: string; url: string; notes: string; published: string }

const updatesUrl = (): string => (process.env.UPDATES_URL || '').trim().replace(/\/+$/, '');

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  const latest = (await hub().get('config/latest', { type: 'json' })) as LatestRelease | null;
  if (!latest || !latest.tag) return json({ error: 'none' }, 404);
  const base = updatesUrl();
  const release = base ? `${base}/releases/${encodeURIComponent(latest.tag)}` : '';
  // The field names of the usual release feeds, so the servers read it with the same code.
  return json({
    tag_name: latest.tag,
    published_at: latest.published,
    body: latest.notes,
    html_url: latest.url || (release ? `${release}/HNMO.zip` : ''),
    manifest_url: release ? `${release}/manifest.json` : '',
    files_url: base ? `${base}/files/` : '',
  }, 200, { 'Cache-Control': 'public, max-age=300' });
};

export const config = { path: '/api/latest' };
