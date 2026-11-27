// GET /api/update-file?path=...&token=... (also accepts Authorization: Bearer <token> and X-HNMO-Machine / ?machine=).
// When the HMAC update token is valid & unexpired, matches the presenting machine (if given), belongs to a non-withdrawn
// licence, and the requested path appears in that token's version manifest, answers 302 to the file on the Cloudflare
// R2 update storage (files/<sha256>): the bytes come from Cloudflare, never through a Netlify function (which can't
// carry files of tens of MB; the packs are up to ~90 MB). The updater checks the SHA-256 of what it gets.
import { hub, json, verifyUpdateToken } from '../lib/hub.mts';
import { cleanMachine } from '../lib/report.mts';
import { isLicenceWithdrawn, resolveManifestFiles, updatesUrl } from '../lib/updates.mts';

interface UpdateTokenClaims {
  licenceId: string;
  machineId: string;
  legacyMachineId?: string | null;
  buildStamp: string;
  version: string;
  exp: number;
}

const bearerToken = (req: Request, url: URL): string => {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (url.searchParams.get('token') || '').trim();
};

export async function handleUpdateFile(req: Request, _context: { ip?: string } = {}): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  const url = new URL(req.url);
  const token = bearerToken(req, url);
  const claims = verifyUpdateToken<UpdateTokenClaims>(token);
  if (!claims) {
    return json({ error: 'forbidden', reason: 'invalid_or_expired_token' }, 403);
  }

  const presentedMachine = cleanMachine(url.searchParams.get('machine') ?? req.headers.get('x-hnmo-machine'));
  if (presentedMachine && presentedMachine !== claims.machineId && presentedMachine !== (claims.legacyMachineId ?? '')) {
    return json({ error: 'forbidden', reason: 'machine' }, 403);
  }

  const store = hub();
  if (await isLicenceWithdrawn(store, claims.licenceId)) {
    return json({ error: 'forbidden', reason: 'withdrawn' }, 403);
  }

  const requestedPath = (url.searchParams.get('path') || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!requestedPath) {
    return json({ error: 'forbidden', reason: 'missing_path' }, 403);
  }

  const manifestFiles = await resolveManifestFiles(store, claims.version);
  const entry = manifestFiles?.find((f) => f.path === requestedPath);
  if (!entry) {
    return json({ error: 'forbidden', reason: 'off_manifest' }, 403);
  }

  const base = updatesUrl();
  if (!base) {
    return json({ error: 'files_unavailable' }, 503);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}/files/${encodeURIComponent(entry.sha256)}`,
      'Cache-Control': 'no-store',
      'X-HNMO-Sha256': entry.sha256,
    },
  });
}

export default (req: Request, context: { ip?: string }) => handleUpdateFile(req, context);

export const config = { path: '/api/update-file' };
