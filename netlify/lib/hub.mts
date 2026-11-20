// The hub's store (Netlify Blobs, store "hub") and its records:
//   hosts/<machine>     the latest weekly report of a server and its last 12 weeks
//   requests/<id>       licence requests (the one-time secret only as a hash)
//   licences/<id>       licences issued here (withdrawn ones keep their date)
//   keys/licence        the licence key (lib/keys.mts)
//   pending/<…>         bug reports waiting for the daily GitHub Action; done/<…> once filed
//   devices/<id>        trusted browsers of the console
//   limits/<day>/…      counters for the limits
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { buildKey } from './license.mts';
import type { StoredKey } from './keys.mts';
import type { Weekly } from './report.mts';

export type Store = ReturnType<typeof getStore>;

let testStore: Store | null = null;

/** Tests put a store in memory here (tests/memory-store.mts). */
export const useStoreForTests = (store: Store | null): void => {
  testStore = store;
};

export const hub = (): Store => testStore ?? getStore({ name: 'hub', consistency: 'strong' });

export interface HostRecord {
  machine: string;
  firstSeen: string;
  lastSeen: string;
  licensee: string | null;
  licenceId: string | null;
  licenceExpires: string | null;
  licenceProblem: string | null;
  latest: Omit<Weekly, 'bugs'>;
  bugsSent: number;
  weeks: { at: string; peak: number; crashes: number; errors: number; online: number }[];
}

export interface RequestRecord {
  id: string;
  at: string;
  machine: string;
  version: string;
  licensee: string | null;
  name: string;
  contact: string;
  players: number;
  message: string;
  tokenHash: string;
  status: 'open' | 'issued' | 'declined';
  licenceId?: string;
  licence?: string;
  decidedAt?: string;
}

export interface LicenceRecord {
  id: string;
  licensee: string;
  maxPlayers: number;
  expires: string | null;
  machine: string | null;
  issued: string;
  requestId: string | null;
  revoked: string | null;
  file: string;
}

export interface Device { id: string; name: string; added: string; lastSeen: string }

/** The console's sign-in, set in the browser on first use: the password's hash and the authenticator key. */
export interface ConsoleCredentials { passwordHash: string; totpSecret: string; made: string }

/** The sign-in: the one set in the browser, or (older setups) the site settings CONSOLE_PASSWORD_HASH and CONSOLE_TOTP_SECRET. */
export async function consoleCredentials(store: Store): Promise<ConsoleCredentials | null> {
  const saved = (await store.get('config/console', { type: 'json' })) as ConsoleCredentials | null;
  if (saved) return saved;
  const passwordHash = process.env.CONSOLE_PASSWORD_HASH || '';
  const totpSecret = process.env.CONSOLE_TOTP_SECRET || '';
  return passwordHash && totpSecret ? { passwordHash, totpSecret, made: '' } : null;
}

export const tokenHash = (token: string): string => createHash('sha256').update(`hnmo-request|${token}`).digest('hex');
export const ipHash = (ip: string): string => createHash('sha256').update((process.env.HUB_SALT || 'hnmo') + ip).digest('hex').slice(0, 16);

export async function licenceKey(store: Store): Promise<StoredKey | null> {
  return (await store.get('keys/licence', { type: 'json' })) as StoredKey | null;
}

/** The keys a licence may be signed with: the HNMO build key and, once made, the licence key. */
export async function licenceKeys(store: Store): Promise<string[]> {
  const key = await licenceKey(store);
  return key ? [buildKey(), key.publicPem] : [buildKey()];
}

/** Counts one more for a limit; false when it was reached. */
export async function countOnce(store: Store, key: string, limit: number): Promise<boolean> {
  const count = Number((await store.get(key)) ?? 0);
  if (count >= limit) return false;
  await store.set(key, String(count + 1));
  return true;
}

export async function listJson<T>(store: Store, prefix: string, max = 1000): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const out: T[] = [];
  for (const blob of blobs.slice(0, max)) {
    const value = await store.get(blob.key, { type: 'json' });
    if (value) out.push(value as T);
  }
  return out;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export const clientIp = (req: Request, context: { ip?: string }): string => context.ip || req.headers.get('x-nf-client-connection-ip') || '';
