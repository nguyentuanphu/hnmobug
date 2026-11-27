// Shared manifest resolution and withdrawal checks for /api/update-check and /api/update-file.
import type { LicenceRecord, hub } from './hub.mts';

export interface ManifestFile {
  path: string;
  sha256: string;
  size?: number;
  exec?: boolean;
}

interface StoredManifest {
  version?: string;
  files?: ManifestFile[];
}

export const updatesUrl = (): string => (process.env.UPDATES_URL || '').trim().replace(/\/+$/, '');

export async function resolveManifestFiles(store: ReturnType<typeof hub>, tag: string): Promise<ManifestFile[] | null> {
  const cached = (await store.get(`releases/${tag}/manifest`, { type: 'json' })) as StoredManifest | null;
  if (cached && Array.isArray(cached.files)) {
    return cached.files.filter((f) => typeof f?.path === 'string' && typeof f?.sha256 === 'string');
  }

  const base = updatesUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/releases/${encodeURIComponent(tag)}/manifest.json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const remote = (await res.json()) as StoredManifest;
    if (!Array.isArray(remote?.files)) return null;
    const files = remote.files.filter((f) => typeof f?.path === 'string' && typeof f?.sha256 === 'string');
    await store.setJSON(`releases/${tag}/manifest`, { version: tag, files });
    return files;
  } catch {
    return null;
  }
}

export async function isLicenceWithdrawn(store: ReturnType<typeof hub>, licenceId: string): Promise<boolean> {
  const issued = (await store.get(`licences/${licenceId}`, { type: 'json' })) as LicenceRecord | null;
  return issued?.revoked ? true : Boolean(await store.get(`withdrawn/${licenceId}`));
}
