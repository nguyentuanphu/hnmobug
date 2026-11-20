// What a game server may send, cleaned and cut to size. Nothing else is kept: no player login, e-mail or password. The IP
// only as a salted hash for the limits, except the first-setup report, which keeps the IP it came from and its country
// (owner's choice, 2026-11-21; the server's setup page tells the host).
export const CATEGORIES = ['display', 'skill', 'item', 'quest', 'connection', 'other'] as const;

const cut = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '');
const num = (value: unknown, max = 1e9): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0);
const flag = (value: unknown): boolean => value === true;

export const cleanMachine = (value: unknown): string | null => {
  const machine = cut(value, 32).toLowerCase();
  return /^[0-9a-f]{8,32}$/.test(machine) ? machine : null;
};

export interface Bug { id: string; category: string; text: string; server: string; place: string; status: string; info: string; reply: string; character: string; created: string }

export interface Stored {
  kind: 'bug';
  receivedAt: string;
  machine: string;
  version: string;
  licensee: string | null;
  licenceProblem: string | null;
  bug: Bug;
}

export function cleanBug(value: unknown): Bug | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  const text = cut(b.text, 2000);
  if (text.length < 10) return null;
  const category = (CATEGORIES as readonly string[]).includes(b.category as string) ? (b.category as string) : 'other';
  return {
    id: cut(b.id, 20), category, text, server: cut(b.server, 60), place: cut(b.place, 80), status: cut(b.status, 20),
    info: cut(b.info, 3000), reply: cut(b.reply, 1000), character: cut(b.character, 40), created: cut(b.created, 40),
  };
}

export interface Request { name: string; contact: string; players: number; message: string; token: string }

/** A licence request; the token is the one-time secret only the asking server knows (it fetches its licence with it). */
export function cleanRequest(value: unknown): Request | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  const name = cut(b.name, 100);
  const token = cut(b.token, 100);
  if (!name || !/^[A-Za-z0-9_-]{24,100}$/.test(token)) return null;
  return { name, contact: cut(b.contact, 200), players: Math.max(0, Math.min(10000, num(b.players))), message: cut(b.message, 1000), token };
}

export interface Weekly {
  version: string;
  os: string;
  uptimeHours: number;
  players: { peak: number; limit: number; accounts: number; characters: number; online: number; graceStarted: string | null };
  health: { crashes: number; errors: number; integrity: string };
  features: { season9: boolean; arena: boolean; expRate: number; dropRate: number; plugins: string[] };
  bugs: Bug[];
}

/** The weekly report: numbers and names of features only. At most 50 bug reports. */
export function cleanWeekly(value: unknown): Weekly | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  const players = (b.players ?? {}) as Record<string, unknown>;
  const health = (b.health ?? {}) as Record<string, unknown>;
  const features = (b.features ?? {}) as Record<string, unknown>;
  const integrity = cut(health.integrity, 20);
  return {
    version: cut(b.version, 40),
    os: cut(b.os, 80),
    uptimeHours: num(b.uptimeHours, 24 * 3650),
    players: {
      peak: num(players.peak, 100000), limit: num(players.limit, 100000), accounts: num(players.accounts), characters: num(players.characters), online: num(players.online, 100000),
      graceStarted: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(cut(players.graceStarted, 40)) ? cut(players.graceStarted, 40) : null,
    },
    health: { crashes: num(health.crashes, 100000), errors: num(health.errors, 1e7), integrity: ['ok', 'modified', 'unsigned', 'unknown'].includes(integrity) ? integrity : 'unknown' },
    features: {
      season9: flag(features.season9),
      arena: flag(features.arena),
      expRate: num(features.expRate, 1e6),
      dropRate: num(features.dropRate, 1e6),
      plugins: Array.isArray(features.plugins) ? features.plugins.map((p) => cut(p, 60)).filter(Boolean).slice(0, 300) : [],
    },
    bugs: Array.isArray(b.bugs) ? b.bugs.slice(0, 50).map(cleanBug).filter((x): x is Bug => x !== null) : [],
  };
}

export interface Setup {
  system: { os: string; arch: string; cpu: string; cores: number; ramGb: number; freeDiskGb: number | null; dotnet: string };
  game: { name: string; servers: number[]; seasons: string[]; publicAddress: string; language: string };
  host: { name: string; contact: string };
}

const gb = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1e6, Math.round(value * 10) / 10)) : 0);

/** The first-setup report: the host's system and game, and the host's optional name and contact. */
export function cleanSetup(value: unknown): Setup | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  if (typeof b.system !== 'object' || b.system === null) return null;
  const system = b.system as Record<string, unknown>;
  const game = (b.game ?? {}) as Record<string, unknown>;
  const host = (b.host ?? {}) as Record<string, unknown>;
  return {
    system: {
      os: cut(system.os, 120), arch: cut(system.arch, 20), cpu: cut(system.cpu, 120), cores: num(system.cores, 4096),
      ramGb: gb(system.ramGb), freeDiskGb: system.freeDiskGb === null || system.freeDiskGb === undefined ? null : gb(system.freeDiskGb), dotnet: cut(system.dotnet, 60),
    },
    game: {
      name: cut(game.name, 80),
      servers: Array.isArray(game.servers) ? game.servers.map((s) => num(s, 255)).slice(0, 50) : [],
      seasons: Array.isArray(game.seasons) ? game.seasons.map((s) => cut(s, 10)).filter((s) => ['s6', 's9', 'arena'].includes(s)) : [],
      publicAddress: cut(game.publicAddress, 200),
      language: cut(game.language, 20),
    },
    host: { name: cut(host.name, 80), contact: cut(host.contact, 120) },
  };
}

/** First-setup reports a computer may send in a Sydney day. */
export const SETUPS_PER_DAY = 3;

/** A server may send its weekly report once in this many days. */
export const WEEKLY_MIN_DAYS = 6;

/** Licence requests a computer may send in a Sydney day. */
export const REQUESTS_PER_DAY = 3;
