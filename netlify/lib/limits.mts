// One licence, one folder per computer (owner, 2026-11-28). The hub only watches and answers: servers report a folder
// id with their weekly and setup reports; the hub notes which folders each computer runs and which free computers share
// one public address, and flags what looks like more than allowed. A switch (off while the owner tests) is passed to
// the servers in the weekly and update-check answers; only when it is on does a server hold a place per folder on its
// computer. Flags are for the owner to read, never an automatic ban: many providers share one address between homes.
import { ipHash, listJson, type Store } from './hub.mts';

const DAY = 24 * 3600 * 1000;
export const ACTIVE_DAYS = 14;
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

export interface FolderRecord {
  machine: string;
  licenceId: string | null;
  /** Folders the licence lets run at once (1 without a licence). */
  allowed: number;
  /** Folder id → when it was last seen. */
  folders: Record<string, string>;
}

export interface AddressRecord {
  address: string;
  /** Computer → when it was last seen and the licence it showed (null on the free build). */
  machines: Record<string, { last: string; licenceId: string | null }>;
}

const recent = (at: string, now: Date) => now.getTime() - Date.parse(at) < ACTIVE_DAYS * DAY;
const prune = <T,>(entries: Record<string, T>, at: (value: T) => string, now: Date, keep = 20): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => recent(at(value), now)).sort((a, b) => at(b[1]).localeCompare(at(a[1]))).slice(0, keep));

/** Notes one report: the computer's folder, and the computer at its public address. */
export async function noteFolder(
  store: Store,
  info: { machine: string; folder: string; ip: string; licenceId: string | null; allowed: number },
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  if (info.folder) {
    const key = `limit-folders/${info.machine}`;
    const previous = (await store.get(key, { type: 'json' })) as FolderRecord | null;
    const record: FolderRecord = {
      machine: info.machine, licenceId: info.licenceId, allowed: info.allowed,
      folders: prune({ ...(previous?.folders ?? {}), [info.folder]: at }, last => last, now),
    };
    await store.setJSON(key, record);
  }
  const address = ipHash(`limits|${info.ip}`);
  const key = `limit-addresses/${address}`;
  const previous = (await store.get(key, { type: 'json' })) as AddressRecord | null;
  const record: AddressRecord = {
    address,
    machines: prune({ ...(previous?.machines ?? {}), [info.machine]: { last: at, licenceId: info.licenceId } }, value => value.last, now),
  };
  await store.setJSON(key, record);
}

export type LimitFlagKind = 'folders' | 'address';

export interface LimitFlag {
  /** Stable id of what is flagged, used to set it aside. */
  key: string;
  kind: LimitFlagKind;
  /** The computer (folders) or a short code of the public address (address). */
  subject: string;
  count: number;
  allowed: number;
  licenceId: string | null;
  machines: string[];
  last: string;
}

/** What looks like more than allowed, minus what the owner set aside (until it grows). */
export async function listLimitFlags(store: Store, now = new Date()): Promise<LimitFlag[]> {
  const [folderRecords, addressRecords, setAside] = await Promise.all([
    listJson<FolderRecord>(store, 'limit-folders/'),
    listJson<AddressRecord>(store, 'limit-addresses/'),
    store.list({ prefix: 'limit-aside/' }),
  ]);
  const aside = new Map<string, number>();
  for (const blob of setAside.blobs) {
    const value = (await store.get(blob.key, { type: 'json' })) as { count?: number } | null;
    aside.set(blob.key.slice('limit-aside/'.length), value?.count ?? 0);
  }

  const flags: LimitFlag[] = [];
  for (const record of folderRecords) {
    const active = Object.entries(record.folders).filter(([, last]) => recent(last, now));
    if (active.length > record.allowed) {
      flags.push({
        key: `folders-${record.machine}`, kind: 'folders', subject: record.machine, count: active.length, allowed: record.allowed,
        licenceId: record.licenceId, machines: [record.machine], last: active.map(([, last]) => last).sort().at(-1)!,
      });
    }
  }
  for (const record of addressRecords) {
    const free = Object.entries(record.machines).filter(([, value]) => value.licenceId === null && recent(value.last, now));
    if (free.length > 1) {
      flags.push({
        key: `address-${record.address}`, kind: 'address', subject: record.address.slice(0, 8), count: free.length, allowed: 1,
        licenceId: null, machines: free.map(([machine]) => machine), last: free.map(([, value]) => value.last).sort().at(-1)!,
      });
    }
  }
  return flags.filter(flag => (aside.get(flag.key) ?? 0) < flag.count).sort((a, b) => b.last.localeCompare(a.last));
}

/** Sets a flag aside until more computers or folders show up than now. */
export async function setFlagAside(store: Store, key: string, now = new Date()): Promise<boolean> {
  if (!/^(folders|address)-[0-9a-f]{8,32}$/.test(key)) return false;
  const flag = (await listLimitFlags(store, now)).find(f => f.key === key);
  if (!flag) return false;
  await store.setJSON(`limit-aside/${key}`, { count: flag.count, at: now.toISOString() });
  return true;
}
