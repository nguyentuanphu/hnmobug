// POST /api/update-check: checks a server's licence before issuing update metadata and a short-lived download token.
// Stores only { licenceId, machineId, buildStamp, lastSeen } — zero player data.
import { checkLicence } from '../lib/license.mts';
import { cleanMachine } from '../lib/report.mts';
import { sydneyDay } from '../lib/day.mts';
import { clientIp, countOnce, hub, ipHash, json, licenceKeys, signUpdateToken, type UpdateCheckRecord } from '../lib/hub.mts';
import { isLicenceWithdrawn, resolveManifestFiles } from '../lib/updates.mts';
import type { LatestRelease } from './latest.mts';

const cleanStamp = (value: unknown): string => (typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, 80) : '');

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  if (raw.length > 32_768) return json({ error: 'too big' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'not JSON' }, 400);
  }

  const store = hub();
  const now = new Date();
  const today = sydneyDay(now);
  if (!(await countOnce(store, `limits/${today}/update-check/ip-${ipHash(clientIp(req, context))}`, 120))) {
    return json({ error: 'limit' }, 429);
  }

  const machineId = cleanMachine(body.machineId);
  const legacyMachineId = cleanMachine(body.legacyMachineId);
  const buildStamp = cleanStamp(body.buildStamp);
  const requestedLicenceId = typeof body.licenceId === 'string' ? body.licenceId.trim().slice(0, 64) : '';
  const licenceB64 = typeof body.licence === 'string' ? body.licence.trim() : '';

  if (!machineId || !licenceB64 || licenceB64.length > 16_384) {
    return json({ error: 'forbidden', reason: 'invalid_request' }, 403);
  }

  let decodedLicence: string;
  try {
    decodedLicence = Buffer.from(licenceB64, 'base64').toString('utf8');
  } catch {
    return json({ error: 'forbidden', reason: 'broken' }, 403);
  }

  const parsed = checkLicence(decodedLicence, today, await licenceKeys(store));
  if (!parsed.valid) {
    return json({ error: 'forbidden', reason: parsed.reason }, 403);
  }

  const licenceId = parsed.id ?? requestedLicenceId;
  if (!licenceId || (requestedLicenceId && parsed.id && requestedLicenceId !== parsed.id)) {
    return json({ error: 'forbidden', reason: 'licence_id' }, 403);
  }

  if (parsed.machine) {
    const bound = parsed.machine.toLowerCase();
    if (bound !== machineId && bound !== (legacyMachineId ?? '')) {
      return json({ error: 'forbidden', reason: 'machine' }, 403);
    }
  }

  if (await isLicenceWithdrawn(store, licenceId)) {
    return json({ error: 'forbidden', reason: 'withdrawn' }, 403);
  }

  const record: UpdateCheckRecord = {
    licenceId,
    machineId,
    buildStamp,
    lastSeen: now.toISOString(),
  };
  await store.setJSON(`update-checks/${licenceId}/${machineId}`, record);

  const latest = (await store.get('config/latest', { type: 'json' })) as LatestRelease | null;
  if (!latest?.tag) {
    return json({ error: 'none' }, 404);
  }

  const manifestFiles = await resolveManifestFiles(store, latest.tag);
  if (!manifestFiles) {
    return json({ error: 'manifest_unavailable' }, 404);
  }

  const origin = URL.canParse(req.url) ? new URL(req.url).origin : '';
  const token = signUpdateToken({
    licenceId,
    machineId,
    legacyMachineId: legacyMachineId ?? null,
    buildStamp,
    version: latest.tag,
    exp: now.getTime() + 15 * 60_000,
  });

  return json({
    manifestVersion: latest.tag,
    notes: latest.notes,
    files: manifestFiles.map((f) => ({
      path: f.path,
      sha256: f.sha256,
      ...(typeof f.size === 'number' ? { size: f.size } : {}),
      ...(f.exec === true ? { exec: true } : {}),
    })),
    downloadBase: `${origin}/api/update-file`,
    token,
  });
};

export const config = { path: '/api/update-check' };
