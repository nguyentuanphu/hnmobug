// HNMO licences: the same check as the game server's (HNMO server/src/Integrity/PlayerLicense.cs). A licence file is
// JSON { payload: base64 of the licence JSON, signature: base64 Ed25519 signature over the payload bytes }. It is signed
// with the HNMO build key (older licences, hnmo-pub.pem) or the hub's licence key (lib/keys.mts). The hub knows a
// licensed server by it: no sign-up.
import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Licence =
  | { valid: true; licensee: string; maxPlayers: number; expires: string | null; machine: string | null; id: string | null }
  | { valid: false; reason: string };

let buildKeyPem: string | null = null;

/** The HNMO build key's public half. */
export function buildKey(): string {
  // Tests read the file next to this module. On Netlify the function is bundled into netlify/functions/, while
  // netlify.toml's included_files keeps the key at netlify/lib/hnmo-pub.pem under the function's root (the working
  // directory), so the path next to the bundle doesn't exist there.
  if (buildKeyPem === null) {
    const candidates = [
      new URL('./hnmo-pub.pem', import.meta.url),
      new URL('../lib/hnmo-pub.pem', import.meta.url),
      join(process.cwd(), 'netlify', 'lib', 'hnmo-pub.pem'),
    ];
    const found = candidates.find((path) => existsSync(path));
    const envPem = (process.env.HNMO_PUBLIC_KEY || process.env.HNMO_UPDATE_PUBLIC_KEY || '').trim();
    if (!envPem && !found) throw new Error('hnmo-pub.pem not found');
    buildKeyPem = envPem || readFileSync(found!, 'utf8');
  }
  return buildKeyPem;
}

const verifies = (pem: string, payload: Buffer, signature: Buffer): boolean => {
  try {
    return verify(null, payload, createPublicKey(pem), signature);
  } catch {
    return false;
  }
};

/** Checks a licence file's content against the given public keys (PEM); `today` is a YYYY-MM-DD date (Sydney). */
export function checkLicence(file: unknown, today: string, keys: string | string[] = buildKey()): Licence {
  const pems = Array.isArray(keys) ? keys : [keys];
  if (typeof file !== 'string' || file.length === 0 || file.length > 8192) return { valid: false, reason: 'none' };
  try {
    const parsed = JSON.parse(file) as { payload?: unknown; signature?: unknown };
    if (typeof parsed.payload !== 'string' || typeof parsed.signature !== 'string') return { valid: false, reason: 'broken' };
    const payload = Buffer.from(parsed.payload, 'base64');
    const signature = Buffer.from(parsed.signature, 'base64');
    if (!pems.some((pem) => verifies(pem, payload, signature))) return { valid: false, reason: 'signature' };
    const body = JSON.parse(payload.toString('utf8')) as { licensee?: unknown; maxPlayers?: unknown; expires?: unknown; machine?: unknown; id?: unknown };
    const expires = typeof body.expires === 'string' ? body.expires : null;
    if (expires && today > expires) return { valid: false, reason: 'expired' };
    return {
      valid: true,
      licensee: typeof body.licensee === 'string' ? body.licensee.slice(0, 100) : 'unnamed',
      maxPlayers: typeof body.maxPlayers === 'number' ? body.maxPlayers : 0,
      expires,
      machine: typeof body.machine === 'string' ? body.machine : null,
      id: typeof body.id === 'string' ? body.id : null,
    };
  } catch {
    return { valid: false, reason: 'broken' };
  }
}
