// A store in memory with the parts of a Netlify Blobs store the hub uses, for the tests.
import type { Store } from '../netlify/lib/hub.mts';

export function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const store = {
    data,
    async get(key: string, options?: { type?: string }) {
      const value = data.get(key);
      if (value === undefined) return null;
      return options?.type === 'json' ? JSON.parse(value) : value;
    },
    async set(key: string, value: string) { data.set(key, value); },
    async setJSON(key: string, value: unknown) { data.set(key, JSON.stringify(value)); },
    async delete(key: string) { data.delete(key); },
    async list(options?: { prefix?: string }) {
      const blobs = [...data.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).sort().map((key) => ({ key, etag: '' }));
      return { blobs, directories: [] };
    },
  };
  return store as unknown as Store & { data: Map<string, string> };
}
