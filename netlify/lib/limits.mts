// One licence, one folder per computer (owner, 2026-11-28). The hub only watches and answers: servers report a folder
// id with their weekly and setup reports; the hub notes which folders each computer runs and which free computers share
// one public address, and flags what looks like more than allowed. A switch (off while the owner tests) is passed to
// the servers in the weekly and update-check answers; only when it is on does a server hold a place per folder on its
// computer. Flags are for the owner to read, never an automatic ban: many providers share one address between homes.
import { createHash } from 'node:crypto';
import { checkLicence, type Licence } from './license.mts';
import { ipHash, listJson, type LicenceRecord, type Store } from './hub.mts';

const DAY = 24 * 3600 * 1000;
export const ACTIVE_DAYS = 14;
// Keep enough observations to detect overflow of a 50-folder licence, with a bounded record.
const MAX_FOLDER_SIGHTINGS = 64;
const MAX_ADDRESS_SIGHTINGS = 20;
const WRITE_ATTEMPTS = 8;
const settingsKey = 'config/limits';

export interface LimitSettings { enforce: boolean }

export const readLimits = async (store: Store): Promise<LimitSettings> => {
  const stored = (await store.get(settingsKey, { type: 'json' })) as Partial<LimitSettings> | null;
  return { enforce: stored?.enforce === true };
};

export const saveLimits = async (store: Store, enforce: boolean): Promise<LimitSettings> => {
  await store.setJSON(settingsKey, { enforce });
  return { enforce };
};

/** A folder id a server sent (16 hex digits), or ''. */
export const cleanFolder = (value: unknown): string =>
  typeof value === 'string' && /^[0-9a-f]{16}$/i.test(value.trim()) ? value.trim().toLowerCase() : '';

/** Resolve telemetry entitlement using the current issued version when the Hub knows this licence ID. */
export function folderEntitlement(
  sent: Licence,
  issued: LicenceRecord | null,
  machine: string,
  legacy: string | null,
  today: string,
  keys: string[],
  revoked = false,
): { licenceId: string | null; allowed: number } {
  const free = { licenceId: null, allowed: 1 };
  if (!sent.valid || revoked || issued?.revoked) return free;
  const matches = (bound: string | null) => !bound || bound.toLowerCase() === machine || bound.toLowerCase() === legacy;
  if (!matches(sent.machine) || (issued && !matches(issued.machine))) return free;
  const current = issued ? checkLicence(issued.file, today, keys) : sent;
  if (!current.valid || current.id !== sent.id || !matches(current.machine)) return free;
  return { licenceId: current.id, allowed: current.folders };
}

export interface FolderRecord {
  machine: string;
  licenceId: string | null;
  /** Folders the licence lets run at once (1 without a licence). */
  allowed: number;
  /** Folder id → when it was last seen. */
  folders: Record<string, string>;
  observedAt?: string;
  entitlementChangedAt?: string;
}

export interface AddressRecord {
  address: string;
  /** Computer → when it was last seen and the licence it showed (null on the free build). */
  machines: Record<string, { last: string; licenceId: string | null }>;
}

const recent = (at: string, now: Date) => now.getTime() - Date.parse(at) < ACTIVE_DAYS * DAY;

const prune = <T,>(entries: Record<string, T>, at: (value: T) => string, now: Date, keep: number): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => recent(at(value), now))
    .sort((a, b) => at(b[1]).localeCompare(at(a[1])) || a[0].localeCompare(b[0])).slice(0, keep));

/** Strong reads and conditional writes protect independent function instances writing the same key. */
async function updateRecord<T>(store: Store, key: string, update: (previous: T | null) => T | null): Promise<void> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const previous = await store.getWithMetadata(key, { type: 'json' });
    const next = update(previous ? previous.data as T : null);
    if (next === null) return;
    if (previous && !previous.etag) throw new Error('Missing ETag for folder-limit telemetry');
    const result = await store.setJSON(key, next, previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
    if (result.modified) return;
    if (attempt + 1 < WRITE_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * (4 << Math.min(attempt, 4))));
    }
  }
  throw new Error('Concurrent folder-limit telemetry update did not settle');
}

/** Notes one report: the computer's folder, and the computer at its public address. */
export async function noteFolder(
  store: Store,
  info: { machine: string; folder: string; ip: string; licenceId: string | null; allowed: number },
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  if (info.folder) {
    await updateRecord<FolderRecord>(store, `limit-folders/${info.machine}`, previous => {
      const folders = previous?.folders ?? {};
      const priorAt = previous?.observedAt ?? Object.values(folders).sort().at(-1) ?? '';
      const observedAt = at < priorAt ? priorAt : at;
      const entitlement = previous && at < priorAt ? previous : info;
      const changed = entitlement.licenceId !== previous?.licenceId || entitlement.allowed !== previous?.allowed;
      if (previous && (folders[info.folder] ?? '') >= at && !changed) return null;
      return {
        machine: info.machine, licenceId: entitlement.licenceId, allowed: entitlement.allowed, observedAt,
        entitlementChangedAt: changed ? at : previous?.entitlementChangedAt,
        folders: prune({ ...folders, [info.folder]: at }, last => last, new Date(observedAt), MAX_FOLDER_SIGHTINGS),
      };
    });
  }
  if (!info.ip) return;
  const address = ipHash(`limits|${info.ip}`);
  await updateRecord<AddressRecord>(store, `limit-addresses/${address}`, previous => {
    const machines = previous?.machines ?? {};
    const sighting = machines[info.machine];
    if (sighting && (sighting.last > at || (sighting.last === at && sighting.licenceId === info.licenceId))) return null;
    const latest = Object.values(machines).reduce((last, value) => value.last > last ? value.last : last, at);
    return {
      address,
      machines: prune({ ...machines, [info.machine]: { last: at, licenceId: info.licenceId } },
        value => value.last, new Date(latest), MAX_ADDRESS_SIGHTINGS),
    };
  });
}

export type LimitFlagKind = 'folders' | 'address';

export interface LimitFlag {
  key: string;
  kind: LimitFlagKind;
  subject: string;
  count: number;
  /** The count is a lower bound once the retained sample fills up. */
  capped: boolean;
  allowed: number;
  licenceId: string | null;
  machines: string[];
  last: string;
  /** Identifies exactly the observed membership and entitlement shown to the owner. */
  fingerprint: string;
}

function withFingerprint(flag: Omit<LimitFlag, 'fingerprint'>, members: string[], entitlementChangedAt = ''): LimitFlag {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([flag.key, flag.licenceId, flag.allowed, entitlementChangedAt, members.sort()])).digest('hex');
  return { ...flag, fingerprint };
}

function folderFlag(record: FolderRecord, now: Date): LimitFlag | null {
  const active = Object.entries(record.folders).filter(([, last]) => recent(last, now));
  if (active.length <= record.allowed) return null;
  return withFingerprint({
    key: `folders-${record.machine}`, kind: 'folders', subject: record.machine,
    count: active.length, capped: active.length >= MAX_FOLDER_SIGHTINGS, allowed: record.allowed,
    licenceId: record.licenceId, machines: [record.machine], last: active.map(([, last]) => last).sort().at(-1)!,
  }, active.map(([id]) => id), record.entitlementChangedAt);
}

function addressFlag(record: AddressRecord, now: Date): LimitFlag | null {
  const active = Object.entries(record.machines).filter(([, value]) => recent(value.last, now));
  const free = active.filter(([, value]) => value.licenceId === null);
  if (free.length <= 1) return null;
  const machines = free.map(([machine]) => machine);
  return withFingerprint({
    key: `address-${record.address}`, kind: 'address', subject: record.address.slice(0, 8),
    count: free.length, capped: active.length >= MAX_ADDRESS_SIGHTINGS, allowed: 1,
    licenceId: null, machines, last: free.map(([, value]) => value.last).sort().at(-1)!,
  }, [...machines]);
}

const asidePrefix = 'limit-aside/';

/** What looks like more than allowed, minus what the owner set aside (until the members or allowance change). */
export async function listLimitFlags(store: Store, now = new Date()): Promise<LimitFlag[]> {
  const [folderRecords, addressRecords, setAside] = await Promise.all([
    listJson<FolderRecord>(store, 'limit-folders/'),
    listJson<AddressRecord>(store, 'limit-addresses/'),
    store.list({ prefix: asidePrefix }),
  ]);
  const dismissed = new Set(setAside.blobs.map(blob => blob.key));
  const flags = [...folderRecords.map(record => folderFlag(record, now)),
    ...addressRecords.map(record => addressFlag(record, now))]
    .filter((flag): flag is LimitFlag => flag !== null);

  const visible: LimitFlag[] = [];
  for (const flag of flags) {
    const key = asidePrefix + flag.key;
    if (dismissed.has(key)) {
      const value = (await store.get(key, { type: 'json' })) as { fingerprint?: string } | null;
      if (value?.fingerprint === flag.fingerprint) continue;
    }
    visible.push(flag);
  }
  return visible.sort((a, b) => b.last.localeCompare(a.last));
}

/** Dismiss just the snapshot the owner saw, without listing unrelated records. */
export async function setFlagAside(store: Store, key: string, now: Date, fingerprint: string): Promise<boolean> {
  const match = /^(folders|address)-([0-9a-f]{8,32})$/.exec(key);
  if (!match || !/^[0-9a-f]{64}$/.test(fingerprint)) return false;
  const [, kind, id] = match;
  let flag: LimitFlag | null;
  if (kind === 'folders') {
    const record = (await store.get(`limit-folders/${id}`, { type: 'json' })) as FolderRecord | null;
    flag = record && folderFlag(record, now);
  } else {
    const record = (await store.get(`limit-addresses/${id}`, { type: 'json' })) as AddressRecord | null;
    flag = record && addressFlag(record, now);
  }
  if (flag?.fingerprint !== fingerprint) return false;
  await store.setJSON(asidePrefix + key, { fingerprint, at: now.toISOString() });
  return true;
}
