// The licence key: an Ed25519 key only for licences (the HNMO build key stays on the developer's computer). The hub makes
// it once, when the console asks; its private half is kept in the store encrypted (AES-256-GCM) with LICENCE_KEY_SECRET,
// a setting of the site, so the store alone can't sign. Its public half goes into HNMO (licence-pub.pem).
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes, sign as edSign } from 'node:crypto';

const wrapKey = (): Buffer => {
  const s = process.env.LICENCE_KEY_SECRET || '';
  if (s.length < 32) throw new Error('LICENCE_KEY_SECRET is missing or shorter than 32 characters');
  return createHash('sha256').update(s).digest();
};

export interface StoredKey { publicPem: string; iv: string; tag: string; data: string; made: string }

export function makeLicenceKey(now = new Date()): StoredKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', wrapKey(), iv);
  const data = Buffer.concat([cipher.update(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()), cipher.final()]);
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    made: now.toISOString(),
  };
}

export function privatePem(key: StoredKey): string {
  const decipher = createDecipheriv('aes-256-gcm', wrapKey(), Buffer.from(key.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(key.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(key.data, 'base64')), decipher.final()]).toString();
}

export interface LicenceBody { licensee: string; maxPlayers: number; expires: string | null; machine: string | null; issued: string; id: string; /** Folders allowed at once on the computer (left out for one). */ folders?: number }

/** A licence file as HNMO reads it (server/src/Integrity/PlayerLicense.cs). */
export function signLicence(body: LicenceBody, privateKeyPem: string): string {
  const payload = Buffer.from(JSON.stringify(body));
  const signature = edSign(null, payload, privateKeyPem);
  return JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }, null, 2) + '\n';
}

/** Any short secret text kept in the store, encrypted the same way (AES-256-GCM with LICENCE_KEY_SECRET). */
export interface SealedText { iv: string; tag: string; data: string }

export function sealText(text: string): SealedText {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', wrapKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function openText(sealed: SealedText): string {
  const decipher = createDecipheriv('aes-256-gcm', wrapKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
}
