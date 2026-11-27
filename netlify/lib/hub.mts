// The hub's store (Netlify Blobs, store "hub") and its records:
//   hosts/<machine>     the latest weekly report of a server and its last 12 weeks
//   setups/<machine>    a server's first-setup report: system, game, the host's name and contact, IP and country
//   seen/<licence id>   the computers a licence was seen on (2 or more: withdrawn by itself)
//   marks/<machine>     the developer's mark: a test machine of the developer's or a real host
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
import type { Setup, Weekly } from './report.mts';

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
  /** Why it was withdrawn by itself (seen on 2 or more computers); null when the developer did it or it isn't withdrawn. */
  revokedReason?: string | null;
  /** The developer gave it back after it was withdrawn by itself: more computers are fine for it. */
  manyComputers?: boolean;
}

export interface SetupRecord {
  machine: string;
  legacyMachine: string | null;
  at: string;
  firstAt: string;
  times: number;
  version: string;
  licensee: string | null;
  ip: string;
  country: string;
  system: Setup['system'];
  game: Setup['game'];
  host: Setup['host'];
  test?: boolean;
}

/** A computer a licence was seen on: its id and the id earlier HNMO versions used for it. */
export interface SeenComputer { machine: string; legacy: string | null; first: string; last: string }
export interface SeenRecord { licenceId: string; computers: SeenComputer[] }

/** Computers seen in the last this many days count for the "2 or more computers" rule. */
export const SEEN_DAYS = 30;

/**
 * Notes that a licence was used on a computer (its id, and the old id it also had) and gives the computers it was seen on
 * lately. The same computer before and after the real machine id (its old id is the other's legacy id) counts once.
 */
export async function noteLicenceUse(store: Store, licenceId: string, machine: string, legacy: string | null, now: Date): Promise<SeenComputer[]> {
  const key = `seen/${licenceId}`;
  const record = ((await store.get(key, { type: 'json' })) as SeenRecord | null) ?? { licenceId, computers: [] };
  const ids = new Set([machine, legacy].filter((x): x is string => !!x));
  const at = now.toISOString();
  const same = record.computers.filter((c) => ids.has(c.machine) || (c.legacy !== null && ids.has(c.legacy)));
  const others = record.computers.filter((c) => !same.includes(c));
  const oldId = legacy ?? same.map((c) => (c.machine !== machine ? c.machine : c.legacy)).find((x): x is string => !!x) ?? null;
  const first = same.reduce((min, c) => (c.first < min ? c.first : min), at);
  record.computers = [...others, { machine, legacy: oldId, first, last: at }].slice(-20);
  await store.setJSON(key, record);
  const since = now.getTime() - SEEN_DAYS * 24 * 3600 * 1000;
  return record.computers.filter((c) => Date.parse(c.last) >= since);
}

/**
 * Withdraws a licence seen on 2 or more computers lately (owner's choice, 2026-11-21), unless the developer gave it
 * back after such a withdrawal. Gives whether it is withdrawn now.
 */
export async function withdrawIfShared(store: Store, licence: LicenceRecord, computers: SeenComputer[], now: Date): Promise<boolean> {
  if (licence.revoked) return true;
  if (computers.length < 2 || licence.manyComputers) return false;
  const reason = `seen on ${computers.length} computers: ${computers.map((c) => c.machine).join(', ')}`;
  await store.setJSON(`licences/${licence.id}`, { ...licence, revoked: now.toISOString(), revokedReason: reason });
  return true;
}

/** The developer's mark on a computer (console): one of the developer's test machines, or a real host. */
export interface MachineMark { machine: string; test: boolean; at: string }

/** Whether a computer is a test machine: the developer's mark first, else what the server said (HNMO_TEST_HOST). */
export const isTestMachine = (said: boolean | undefined, mark: MachineMark | undefined): boolean => mark ? mark.test : said === true;

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

/** How many records are read at once: one at a time made the console slow as hosts and requests grew (owner, 21 Nov). */
export const READ_AT_ONCE = 16;

export async function listJson<T>(store: Store, prefix: string, max = 1000): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const keys = blobs.slice(0, max).map((blob) => blob.key);
  const values: (T | null)[] = new Array(keys.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < keys.length) {
      const index = next++;
      values[index] = (await store.get(keys[index], { type: 'json' })) as T | null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_AT_ONCE, keys.length) }, worker));
  return values.filter((value): value is T => value !== null && value !== undefined);
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export const clientIp = (req: Request, context: { ip?: string }): string => context.ip || req.headers.get('x-nf-client-connection-ip') || '';

export interface CloneSighting {
  fingerprint: string;
  machine: string;
  legacyMachine: string | null;
  ipHash: string;
  netHash: string;
  firstSeen: string;
  lastSeen: string;
}

export interface CloneRecord {
  licenceId: string;
  firstRun: CloneSighting;
  sightings: CloneSighting[];
  flagged: boolean;
  flaggedAt: string | null;
  reason: string | null;
}

export const ipPrefix = (ip: string): string => {
  const clean = ip.trim();
  const v4 = /^(\d+\.\d+\.\d+)\.\d+$/.exec(clean);
  if (v4) return v4[1];
  if (clean.includes(':')) return clean.split(':').slice(0, 4).join(':');
  return clean;
};

export const buildFingerprint = (info: {
  machine: string;
  legacyMachine?: string | null;
  fingerprint?: unknown;
  os?: string;
  arch?: string;
  cpu?: string;
  cores?: number;
  ramGb?: number;
}): string => {
  if (typeof info.fingerprint === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(info.fingerprint.trim())) {
    return info.fingerprint.trim();
  }
  const canonical = JSON.stringify({
    machine: info.machine,
    os: (info.os ?? '').trim().toLowerCase(),
    arch: (info.arch ?? '').trim().toLowerCase(),
    cpu: (info.cpu ?? '').trim().toLowerCase(),
    cores: info.cores ?? 0,
    ramGb: info.ramGb ?? 0,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
};

/**
 * Passive clone detection (Layer 4): records the first-run fingerprint/network per licence and flags
 * unrelated fingerprints or unrelated IP networks in the hub without taking any action on the host
 * or storing player data.
 */
export async function noteCloneSighting(
  store: Store,
  licenceId: string,
  info: {
    machine: string;
    legacyMachine?: string | null;
    fingerprint?: unknown;
    os?: string;
    arch?: string;
    cpu?: string;
    cores?: number;
    ramGb?: number;
    ip: string;
  },
  now: Date,
): Promise<CloneRecord> {
  const key = `clones/${licenceId}`;
  const existing = (await store.get(key, { type: 'json' })) as CloneRecord | null;
  const at = now.toISOString();
  const fp = buildFingerprint(info);
  const iph = ipHash(info.ip);
  const neth = ipHash(`net|${ipPrefix(info.ip)}`);
  const legacy = info.legacyMachine && info.legacyMachine !== info.machine ? info.legacyMachine : null;

  if (!existing) {
    const firstRun: CloneSighting = { fingerprint: fp, machine: info.machine, legacyMachine: legacy, ipHash: iph, netHash: neth, firstSeen: at, lastSeen: at };
    const created: CloneRecord = { licenceId, firstRun, sightings: [firstRun], flagged: false, flaggedAt: null, reason: null };
    await store.setJSON(key, created);
    return created;
  }

  const sameHardwareOrLegacy = (s: CloneSighting) =>
    s.fingerprint === fp
    || s.machine === info.machine
    || (legacy !== null && (s.machine === legacy || s.legacyMachine === legacy))
    || (s.legacyMachine !== null && s.legacyMachine === info.machine);
  const sameNetwork = (s: CloneSighting) => s.netHash === neth || s.ipHash === iph;

  const matched = existing.sightings.find((s) => s.fingerprint === fp && sameNetwork(s));
  const sightings = matched
    ? existing.sightings.map((s) => (s === matched ? { ...s, lastSeen: at } : s))
    : [...existing.sightings, { fingerprint: fp, machine: info.machine, legacyMachine: legacy, ipHash: iph, netHash: neth, firstSeen: at, lastSeen: at }].slice(-20);

  let flagged = existing.flagged;
  let flaggedAt = existing.flaggedAt;
  let reason = existing.reason;

  const unrelatedFingerprint = !sameHardwareOrLegacy(existing.firstRun);
  const unrelatedIp = !sameNetwork(existing.firstRun);
  if (!flagged && (unrelatedFingerprint || unrelatedIp)) {
    flagged = true;
    flaggedAt = at;
    reason = unrelatedFingerprint && unrelatedIp
      ? 'unrelated fingerprint and IP network'
      : unrelatedFingerprint
        ? 'unrelated host fingerprint'
        : 'unrelated IP network';
  }

  const updated: CloneRecord = { ...existing, sightings, flagged, flaggedAt, reason };
  await store.setJSON(key, updated);
  return updated;
}
