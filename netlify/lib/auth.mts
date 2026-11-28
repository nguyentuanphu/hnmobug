// The console's sign-in: the password (CONSOLE_PASSWORD_HASH, made by tools/make-secrets.mts), and on a browser not yet
// trusted also a 6-digit code from an authenticator app (CONSOLE_TOTP_SECRET, base32). Each successful sign-in grants
// 365 days of trust (a signed cookie naming a device the store lists). Removing it there ends the trust and every session of it.
// A session lasts 30 days and is renewed while the console is in use, so a trusted browser asks for the password again
// only after 30 days unused (it used to be 12 hours).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 30;
export const TRUST_DAYS = 365;

const secret = (): Buffer => {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  return Buffer.from(s);
};

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password: string, stored: string | undefined = process.env.CONSOLE_PASSWORD_HASH): boolean {
  const [kind, salt, hash] = (stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash || typeof password !== 'string' || password.length > 200) return false;
  const given = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === given.length && timingSafeEqual(given, expected);
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** The 6-digit code of a 30-second step (RFC 6238, SHA-1). */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const number = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, '0');
}

/** A code is good for the step now and the ones next to it (clocks differ a little). */
export function checkTotp(code: string, now = Date.now(), secretBase32: string | undefined = process.env.CONSOLE_TOTP_SECRET): boolean {
  if (!secretBase32 || !/^\d{6}$/.test(code || '')) return false;
  const step = Math.floor(now / 30_000);
  return [step - 1, step, step + 1].some((s) => timingSafeEqual(Buffer.from(totpCode(secretBase32, s)), Buffer.from(code)));
}

/** A signed value: `<base64url json>.<hmac>`. */
export function sign(value: object): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}

export function unsign<T>(token: string | undefined): T | null {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const cookie = (name: string, value: string, path: string, maxAgeSeconds: number): string =>
  `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
