// A store in memory with the parts of a Netlify Blobs store the hub uses, for the tests.
import type { Store } from '../netlify/lib/hub.mts';

export function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const versions = new Map<string, string>();
  let version = 0;
  const store = {
    data,
    async get(key: string, options?: { type?: string }) {
      const value = data.get(key);
      if (value === undefined) return null;
      return options?.type === 'json' ? JSON.parse(value) : value;
    },
    async getWithMetadata(key: string) {
      const value = data.get(key);
      if (value === undefined) return null;
      return { data: JSON.parse(value), etag: versions.get(key) ?? '"seeded"', metadata: {} };
    },
    async set(key: string, value: string) {
      data.set(key, value);
      versions.set(key, `"${++version}"`);
    },
    async setJSON(key: string, value: unknown, options?: { onlyIfNew?: boolean; onlyIfMatch?: string }) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      const etag = data.has(key) ? versions.get(key) ?? '"seeded"' : undefined;
      if (options?.onlyIfMatch && options.onlyIfMatch !== etag) return { modified: false };
      await store.set(key, JSON.stringify(value));
      return { modified: true, etag: versions.get(key) };
    },
    async delete(key: string) {
      data.delete(key);
      versions.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const blobs = [...data.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).sort().map((key) => ({ key, etag: '' }));
      return { blobs, directories: [] };
    },
  };
  return store as unknown as Store & { data: Map<string, string> };
}
