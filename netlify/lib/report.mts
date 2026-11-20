// What a game server may send, cleaned and cut to size. Nothing else is kept: no login, e-mail or IP (the IP only as a
// salted hash, for the daily limit).
export const CATEGORIES = ['display', 'skill', 'item', 'quest', 'connection', 'other'] as const;
export type Kind = 'bug' | 'licence-request';

export interface Incoming {
  kind: Kind;
  // a bug
  id?: string; category?: string; text?: string; server?: string; place?: string; status?: string; info?: string;
  reply?: string; character?: string; created?: string;
  // a licence request
  name?: string; contact?: string; players?: number; message?: string;
  // every message
  version?: string; machine?: string; licence?: string | null;
}

export interface Stored {
  kind: Kind;
  receivedAt: string;
  machine: string;
  version: string;
  licensee: string | null;
  licenceProblem: string | null;
  bug?: { id: string; category: string; text: string; server: string; place: string; status: string; info: string; reply: string; character: string; created: string };
  request?: { name: string; contact: string; players: number; message: string };
}

const cut = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '');

/** Cleans what came in; null when it isn't a report or a request. */
export function clean(body: unknown, licensee: string | null, licenceProblem: string | null, now: Date): Stored | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Incoming;
  const machine = cut(b.machine, 32).toLowerCase();
  if (!/^[0-9a-f]{8,32}$/.test(machine)) return null;
  const base = { receivedAt: now.toISOString(), machine, version: cut(b.version, 40), licensee, licenceProblem };
  if (b.kind === 'bug') {
    const text = cut(b.text, 2000);
    if (text.length < 10) return null;
    const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number]) ? (b.category as string) : 'other';
    return {
      ...base, kind: 'bug',
      bug: { id: cut(b.id, 20), category, text, server: cut(b.server, 60), place: cut(b.place, 80), status: cut(b.status, 20),
        info: cut(b.info, 3000), reply: cut(b.reply, 1000), character: cut(b.character, 40), created: cut(b.created, 40) },
    };
  }
  if (b.kind === 'licence-request') {
    const name = cut(b.name, 100);
    if (!name) return null;
    const players = typeof b.players === 'number' && Number.isFinite(b.players) ? Math.max(1, Math.min(10000, Math.round(b.players))) : 0;
    return { ...base, kind: 'licence-request', request: { name, contact: cut(b.contact, 200), players, message: cut(b.message, 1000) } };
  }
  return null;
}

/** How many a computer may send in a Sydney day. */
export function dailyLimit(kind: Kind, licensed: boolean): number {
  if (kind === 'licence-request') return 3;
  return licensed ? 200 : 10;
}
