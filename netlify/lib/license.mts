// HNMO licences: the same check as the game server's (HNMO server/src/Integrity/PlayerLicense.cs). A licence file is
// JSON { payload: base64 of the licence JSON, signature: base64 Ed25519 signature over the payload bytes }, signed with
// the HNMO developer's private key; the public key is hnmo-pub.pem. The hub knows a licensed server by it: no sign-up.
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type Licence = { valid: true; licensee: string; maxPlayers: number; expires: string | null; machine: string | null } | { valid: false; reason: string };

let publicKeyPem: string | null = null;
function key(): string {
  // Netlify bundles the function with the file next to it (netlify.toml included_files); tests read it the same way.
  publicKeyPem ??= process.env.HNMO_PUBLIC_KEY || readFileSync(new URL('./hnmo-pub.pem', import.meta.url), 'utf8');
  return publicKeyPem;
}

/** Checks a licence file's content; `today` is a YYYY-MM-DD date (Sydney). */
export function checkLicence(file: unknown, today: string, pem: string = key()): Licence {
  if (typeof file !== 'string' || file.length === 0 || file.length > 8192) return { valid: false, reason: 'none' };
  try {
    const parsed = JSON.parse(file) as { payload?: unknown; signature?: unknown };
    if (typeof parsed.payload !== 'string' || typeof parsed.signature !== 'string') return { valid: false, reason: 'broken' };
    const payload = Buffer.from(parsed.payload, 'base64');
    const signature = Buffer.from(parsed.signature, 'base64');
    if (!verify(null, payload, createPublicKey(pem), signature)) return { valid: false, reason: 'signature' };
    const body = JSON.parse(payload.toString('utf8')) as { licensee?: unknown; maxPlayers?: unknown; expires?: unknown; machine?: unknown };
    const expires = typeof body.expires === 'string' ? body.expires : null;
    if (expires && today > expires) return { valid: false, reason: 'expired' };
    return {
      valid: true,
      licensee: typeof body.licensee === 'string' ? body.licensee.slice(0, 100) : 'unnamed',
      maxPlayers: typeof body.maxPlayers === 'number' ? body.maxPlayers : 0,
      expires,
      machine: typeof body.machine === 'string' ? body.machine : null,
    };
  } catch {
    return { valid: false, reason: 'broken' };
  }
}
