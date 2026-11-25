// GET /api/latest: the newest HNMO release as the developer published it in the console (Security): its version,
// date, notes, the whole folder's download link, and where the updater finds its files (owner, 2026-11-21: updates by
// file on Cloudflare R2, UPDATES_URL = the bucket's public address). HNMO servers' "Update" and the "Download HNMO"
// link of their website read it, so no HNMO folder points at where HNMO is built. 404 while none is published.
import { hub, json } from '../lib/hub.mts';

export interface LatestRelease { tag: string; url: string; notes: string; published: string }

const updatesUrl = (): string => (process.env.UPDATES_URL || '').trim().replace(/\/+$/, '');

export default async (req: Request) => {
  const download = new URL(req.url).pathname === '/download';
  if (req.method !== 'GET' && !(download && req.method === 'HEAD')) return json({ error: 'GET only' }, 405);
  const latest = (await hub().get('config/latest', { type: 'json' })) as LatestRelease | null;
  const base = updatesUrl();
  if (download) {
    const storage = URL.canParse(base) ? new URL(base) : null;
    if (latest?.tag && storage?.protocol === 'https:' && !storage.username && !storage.password &&
        !storage.search && !storage.hash && !/(^|\.)(github\.com|githubusercontent\.com|github\.io)$/i.test(storage.hostname)) {
      const archive = `${base}/releases/${encodeURIComponent(latest.tag)}/HNMO.zip`;
      return new Response(null, { status: 302, headers: { Location: archive, 'Cache-Control': 'no-store' } });
    }
    return new Response(req.method === 'HEAD' ? null : 'Tệp tải xuống tạm thời chưa có. Vui lòng thử lại sau.\nThe download is temporarily unavailable. Please try again later.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (!latest || !latest.tag) return json({ error: 'none' }, 404);
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

export const config = { path: ['/api/latest', '/download'] };
