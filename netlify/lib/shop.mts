// The licence shop (owner, 2026-11-28: everything automatic, every package gets updates). The owner fills prices in the
// console; an HNMO server shows the priced packages on its admin panel, opens a checkout (Stripe cards, or PayOS bank
// transfer/VietQR in VND), and the hub signs the licence itself as soon as the payment is confirmed. The server's poll
// of /api/licence then brings the file back. Records:
//   config/licence-packages   the catalogue (Package[], JSON edited in the console)
//   shop-orders/<uuid>        an order: package snapshot, machine, request, amount, provider and status
//   shop-refs/<kind>/<id>     Stripe session, subscription and payment intent ids, PayOS order codes → order id
//   shop-events/<id>          webhook events already applied (once each)
//   machine-licences/<m>      the shop licence id of a computer (one per computer, kept across renewals)
//   pending-licences/<m>      a licence waiting for a computer's next request (a move or a second machine)
//   trials/<machine>          the trial a computer had (one each)
//   autoerror-keys/<machine>  the sha256 of a computer's automatic error key
//   config/bank               the owner's bank account for VietQR transfers (not a secret; set in the console)
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sydneyDay } from './day.mts';
import { licenceKey, listJson, type LicenceRecord, type RequestRecord, type Store } from './hub.mts';
import { makeLicenceKey, privatePem, signLicence, type LicenceBody } from './keys.mts';

export type Season = 's6' | 's9' | 'arena';
export type Currency = 'vnd' | 'aud' | 'usd';
export type Provider = 'stripe' | 'payos' | 'bank';
export type Billing = 'month' | 'year' | 'lifetime' | 'once';
export type Addon = 'players' | 'move' | 'second-machine' | 'upgrade';

export interface Text { en: string; vi: string }

export interface Package {
  id: string;
  kind: 'plan' | 'trial' | 'addon';
  name: Text;
  description: Text;
  maxPlayers?: number;
  addPlayers?: number;
  addon?: Addon;
  /** For an 'upgrade' add-on: the plan whose players and seasons the licence takes. */
  upgradeTo?: string;
  seasons: Season[];
  billing: Billing;
  durationDays: number | null;
  prices: Partial<Record<Currency, number>>;
  highlight?: boolean;
  order: number;
  active: boolean;
}

export type OrderStatus = 'pending' | 'awaiting-transfer' | 'paid' | 'issued' | 'refunded' | 'failed' | 'cancelled' | 'expired';

export interface ShopOrder {
  id: string;
  at: string;
  package: Package;
  machine: string;
  legacyMachine: string | null;
  request: string;
  /** The other computer of a move or a second machine. */
  toMachine: string | null;
  currency: Currency;
  amount: number;
  provider: Provider;
  status: OrderStatus;
  licenceId?: string;
  sessionId?: string;
  subscriptionId?: string;
  paymentIntent?: string;
  orderCode?: number;
  /** A bank transfer's note, which the owner matches on the bank statement. */
  transferCode?: string;
  paidAt?: string;
  issuedAt?: string;
  refundedAt?: string;
  note?: string;
}

/** The licence record of the shop: the console's record plus what the package gave. */
export interface ShopLicenceRecord extends LicenceRecord {
  seasons?: Season[];
  package?: string;
  /** Players bought as add-ons; they stay on renewals and upgrades. */
  bonusPlayers?: number;
}

const CURRENCIES: Currency[] = ['vnd', 'aud', 'usd'];
const SEASONS: Season[] = ['s6', 's9', 'arena'];
const ALL_SEASONS: Season[] = ['s6', 's9', 'arena'];
const DAY = 24 * 3600 * 1000;
export const CHECKOUTS_PER_DAY = 10;
const catalogueKey = 'config/licence-packages';

const text = (en: string, vi: string): Text => ({ en, vi });

const plan = (id: string, tier: string, players: number, seasons: Season[], billing: Billing, order: number, highlight = false): Package => {
  const days = billing === 'month' ? 31 : billing === 'year' ? 366 : null;
  const span = billing === 'month' ? text('1 month', '1 tháng') : billing === 'year' ? text('12 months', '12 tháng') : text('lifetime', 'vĩnh viễn');
  const seasonText = seasons.length === 3 ? text('Season 6.3, Season 9 and the Arena', 'Season 6.3, Season 9 và Arena')
    : seasons.length === 2 ? text('Season 6.3 and Season 9', 'Season 6.3 và Season 9') : text('Season 6.3', 'Season 6.3');
  return {
    id, kind: 'plan', name: text(`${tier} · ${span.en}`, `${tier} · ${span.vi}`),
    description: text(`Up to ${players} players at once, ${seasonText.en}, every update.`, `Tối đa ${players} người chơi cùng lúc, ${seasonText.vi}, nhận mọi bản cập nhật.`),
    maxPlayers: players, seasons, billing, durationDays: days, prices: {}, highlight, order, active: true,
  };
};

/** The catalogue the hub starts with: no prices, so nothing is sold until the owner fills them in. */
export const DEFAULT_CATALOGUE: Package[] = [
  {
    id: 'trial-14', kind: 'trial', name: text('Trial · 14 days', 'Dùng thử · 14 ngày'),
    description: text('100 players, every Season and the Arena, for 14 days. Free, once per computer.', '100 người chơi, mọi Season và Arena, trong 14 ngày. Miễn phí, mỗi máy một lần.'),
    maxPlayers: 100, seasons: ALL_SEASONS, billing: 'once', durationDays: 14, prices: {}, order: 0, active: true,
  },
  plan('starter-month', 'Starter', 50, ['s6'], 'month', 10),
  plan('standard-month', 'Standard', 200, ['s6', 's9'], 'month', 11, true),
  plan('pro-month', 'Pro', 1000, ALL_SEASONS, 'month', 12),
  plan('starter-year', 'Starter', 50, ['s6'], 'year', 20),
  plan('standard-year', 'Standard', 200, ['s6', 's9'], 'year', 21, true),
  plan('pro-year', 'Pro', 1000, ALL_SEASONS, 'year', 22),
  plan('starter-lifetime', 'Starter', 50, ['s6'], 'lifetime', 30),
  plan('standard-lifetime', 'Standard', 200, ['s6', 's9'], 'lifetime', 31),
  plan('pro-lifetime', 'Pro', 1000, ALL_SEASONS, 'lifetime', 32),
  {
    id: 'players-100', kind: 'addon', addon: 'players', addPlayers: 100, name: text('+100 players', '+100 người chơi'),
    description: text('100 more players at once on the licence you have, until it ends.', 'Thêm 100 người chơi cùng lúc cho license đang dùng, tới khi hết hạn.'),
    seasons: [], billing: 'once', durationDays: null, prices: {}, order: 40, active: true,
  },
  {
    id: 'upgrade-to-standard', kind: 'addon', addon: 'upgrade', upgradeTo: 'standard-year', name: text('Upgrade to Standard', 'Nâng cấp lên Standard'),
    description: text('Standard players and Seasons for the rest of your licence.', 'Số người chơi và Season của Standard cho thời gian còn lại của license.'),
    seasons: [], billing: 'once', durationDays: null, prices: {}, order: 41, active: true,
  },
  {
    id: 'upgrade-to-pro', kind: 'addon', addon: 'upgrade', upgradeTo: 'pro-year', name: text('Upgrade to Pro', 'Nâng cấp lên Pro'),
    description: text('Pro players, every Season and the Arena for the rest of your licence.', 'Số người chơi của Pro, mọi Season và Arena cho thời gian còn lại của license.'),
    seasons: [], billing: 'once', durationDays: null, prices: {}, order: 42, active: true,
  },
  {
    id: 'move', kind: 'addon', addon: 'move', name: text('Move to another computer', 'Chuyển sang máy khác'),
    description: text('Moves your licence to a new computer; this one goes back to the free 10 players.', 'Chuyển license sang máy mới; máy này về bản miễn phí 10 người.'),
    seasons: [], billing: 'once', durationDays: null, prices: {}, order: 43, active: true,
  },
  {
    id: 'second-machine', kind: 'addon', addon: 'second-machine', maxPlayers: 20, name: text('Second computer (test server)', 'Máy thứ hai (server test)'),
    description: text('A licence for a second computer with up to 20 players, ending with your main licence.', 'License cho máy thứ hai, tối đa 20 người, hết hạn cùng license chính.'),
    seasons: [], billing: 'once', durationDays: null, prices: {}, order: 44, active: true,
  },
];

const plainText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;

function readText(value: unknown, max: number): Text | null {
  if (typeof value === 'string') {
    const one = plainText(value, max);
    return one ? { en: one, vi: one } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const { en, vi } = value as Record<string, unknown>;
  const english = plainText(en, max);
  const vietnamese = plainText(vi, max) ?? english;
  return english && vietnamese ? { en: english, vi: vietnamese } : null;
}

const whole = (value: unknown, min: number, max: number): number | null =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : null;

/** Checks one package; old catalogues (name, description, currency, unitAmount) are read as a plan without a limit. */
export function readPackage(value: unknown): Package | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' && /^[a-z0-9-]{1,40}$/.test(item.id) ? item.id : null;
  const name = readText(item.name, 80);
  const description = readText(item.description, 600);
  if (!id || !name || !description) return null;

  if (item.kind === undefined && typeof item.currency === 'string' && 'unitAmount' in item) {
    const currency = CURRENCIES.find(c => c === item.currency);
    const amount = whole(item.unitAmount, 1, 99_999_999);
    if (!currency || amount === null) return null;
    return { id, kind: 'plan', name, description, maxPlayers: 50, seasons: ['s6'], billing: 'lifetime', durationDays: null, prices: { [currency]: amount }, order: 100, active: true };
  }

  const kind = item.kind === 'plan' || item.kind === 'trial' || item.kind === 'addon' ? item.kind : null;
  const billing = (['month', 'year', 'lifetime', 'once'] as const).find(b => b === item.billing) ?? null;
  if (!kind || !billing) return null;
  const seasons = Array.isArray(item.seasons) ? item.seasons.filter((s): s is Season => SEASONS.includes(s as Season)) : null;
  if (!seasons || seasons.length !== (item.seasons as unknown[]).length || new Set(seasons).size !== seasons.length) return null;
  const durationDays = item.durationDays === null || item.durationDays === undefined ? null : whole(item.durationDays, 1, 3660);
  if (item.durationDays !== null && item.durationDays !== undefined && durationDays === null) return null;
  const prices: Partial<Record<Currency, number>> = {};
  if (item.prices !== undefined) {
    if (!item.prices || typeof item.prices !== 'object' || Array.isArray(item.prices)) return null;
    for (const [key, amount] of Object.entries(item.prices as Record<string, unknown>)) {
      const currency = CURRENCIES.find(c => c === key);
      if (!currency) return null;
      if (amount === null || amount === 0) continue;
      const checked = whole(amount, 1, 99_999_999_999);
      if (checked === null) return null;
      prices[currency] = checked;
    }
  }
  const result: Package = {
    id, kind, name, description, seasons, billing, durationDays, prices,
    order: whole(item.order, -1000, 1000) ?? 0, active: item.active !== false,
  };
  if (item.highlight === true) result.highlight = true;

  if (kind === 'plan' || kind === 'trial') {
    const players = whole(item.maxPlayers, 1, 100_000);
    if (players === null || seasons.length === 0) return null;
    if ((billing === 'month' || billing === 'year') && durationDays === null) return null;
    result.maxPlayers = players;
  } else {
    const addon = (['players', 'move', 'second-machine', 'upgrade'] as const).find(a => a === item.addon);
    if (!addon || billing === 'month' || billing === 'year') return null;
    result.addon = addon;
    if (addon === 'players') {
      const more = whole(item.addPlayers, 1, 100_000);
      if (more === null) return null;
      result.addPlayers = more;
    }
    if (addon === 'second-machine') {
      const players = whole(item.maxPlayers, 1, 100_000);
      if (players === null) return null;
      result.maxPlayers = players;
    }
    if (addon === 'upgrade') {
      const target = typeof item.upgradeTo === 'string' && /^[a-z0-9-]{1,40}$/.test(item.upgradeTo) ? item.upgradeTo : null;
      if (!target) return null;
      result.upgradeTo = target;
    }
  }
  return result;
}

/** The whole catalogue, or null when one package is wrong, ids repeat, an upgrade names no plan or there are too many. */
export function parseCatalogue(value: unknown): Package[] | null {
  if (!Array.isArray(value) || value.length > 60) return null;
  const packages = value.map(readPackage);
  if (packages.some(p => p === null)) return null;
  const checked = packages as Package[];
  if (new Set(checked.map(p => p.id)).size !== checked.length) return null;
  if (checked.filter(p => p.kind === 'trial').length > 1) return null;
  for (const p of checked) {
    if (p.addon === 'upgrade' && !checked.some(t => t.id === p.upgradeTo && t.kind === 'plan')) return null;
  }
  return checked;
}

/** The stored catalogue; the default one (without prices) when none is stored yet or it can't be read. */
export async function readCatalogue(store: Store): Promise<Package[]> {
  return parseCatalogue(await store.get(catalogueKey, { type: 'json' })) ?? DEFAULT_CATALOGUE;
}

export async function saveCatalogue(store: Store, value: unknown): Promise<boolean> {
  const packages = parseCatalogue(value);
  if (!packages) return false;
  await store.setJSON(catalogueKey, packages);
  return true;
}

export const isPriced = (p: Package): boolean => Object.values(p.prices).some(amount => typeof amount === 'number' && amount > 0);

/** What a server shows: active priced packages and the trial (free), in the owner's order. */
export function forSale(packages: Package[]): Package[] {
  return packages.filter(p => p.active && (p.kind === 'trial' || isPriced(p))).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

// ---------- providers ----------

export interface StripeSettings { apiKey: string; webhookKey: string; live: boolean }
export interface PayosSettings { clientId: string; apiKey: string; checksumKey: string }

/** Live keys (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) first, else the test keys the hub already had. */
export function stripeSettings(env: NodeJS.ProcessEnv = process.env): StripeSettings | null {
  const live = { apiKey: env.STRIPE_SECRET_KEY ?? '', webhookKey: env.STRIPE_WEBHOOK_SECRET ?? '' };
  if (/^(sk|rk)_live_[A-Za-z0-9]+$/.test(live.apiKey) && /^whsec_[A-Za-z0-9]+$/.test(live.webhookKey)) return { ...live, live: true };
  const test = { apiKey: env.LICENCE_STRIPE_TEST_KEY ?? '', webhookKey: env.LICENCE_STRIPE_WEBHOOK_SECRET ?? '' };
  if (/^(sk|rk)_test_[A-Za-z0-9]+$/.test(test.apiKey) && /^whsec_[A-Za-z0-9]+$/.test(test.webhookKey)) return { ...test, live: false };
  return null;
}

export function payosSettings(env: NodeJS.ProcessEnv = process.env): PayosSettings | null {
  const clientId = (env.PAYOS_CLIENT_ID ?? '').trim();
  const apiKey = (env.PAYOS_API_KEY ?? '').trim();
  const checksumKey = (env.PAYOS_CHECKSUM_KEY ?? '').trim();
  return clientId.length >= 8 && apiKey.length >= 8 && checksumKey.length >= 16 ? { clientId, apiKey, checksumKey } : null;
}

/** The hub's own address for the checkout pages (HUB_ORIGIN, else the old test setting, else the site). */
export function hubOrigin(env: NodeJS.ProcessEnv = process.env): string {
  for (const value of [env.HUB_ORIGIN, env.LICENCE_CHECKOUT_ORIGIN]) {
    try {
      const url = new URL(value ?? '');
      if (url.protocol === 'https:' && url.origin === value) return url.origin;
    } catch { /* next */ }
  }
  return 'https://hnmobug.netlify.app';
}

/** The owner's bank for an ordinary transfer from a VietQR code (NAPAS bank BIN, account, its name, the note's prefix). */
export interface BankSettings { bin: string; account: string; accountName: string; notePrefix: string }

export function readBankSettings(value: unknown): BankSettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const bin = typeof v.bin === 'string' && /^\d{6}$/.test(v.bin.trim()) ? v.bin.trim() : null;
  const account = typeof v.account === 'string' && /^[0-9A-Za-z]{4,19}$/.test(v.account.trim()) ? v.account.trim() : null;
  const name = typeof v.accountName === 'string' ? v.accountName.trim().toUpperCase() : '';
  const accountName = /^[A-Z0-9 .-]{2,50}$/.test(name) ? name : null;
  const prefix = typeof v.notePrefix === 'string' && v.notePrefix.trim() ? v.notePrefix.trim().toUpperCase() : 'HNMO';
  const notePrefix = /^[A-Z0-9]{2,8}$/.test(prefix) ? prefix : null;
  return bin && account && accountName && notePrefix ? { bin, account, accountName, notePrefix } : null;
}

export async function bankSettings(store: Store): Promise<BankSettings | null> {
  return readBankSettings(await store.get('config/bank', { type: 'json' }));
}

/** Saves the bank (null clears it); false when a field is wrong. */
export async function saveBankSettings(store: Store, value: unknown): Promise<boolean> {
  if (value === null) {
    await store.delete('config/bank');
    return true;
  }
  const bank = readBankSettings(value);
  if (!bank) return false;
  await store.setJSON('config/bank', bank);
  return true;
}

export const providers = async (store: Store, env: NodeJS.ProcessEnv = process.env) =>
  ({ stripe: !!stripeSettings(env), payos: !!payosSettings(env), bank: !!(await bankSettings(store)) });

/** A bank transfer stays open this long; then it expires. */
export const TRANSFER_DAYS = 7;
const TRANSFER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function authenticStripeEvent(raw: string, header: string, key: string, now = Date.now()): boolean {
  const parts = header.split(',').map(part => part.trim().split('=', 2));
  const stamps = parts.filter(([name]) => name === 't').map(([, value]) => value);
  if (stamps.length !== 1 || !/^\d{1,12}$/.test(stamps[0])) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(stamps[0])) > 300) return false;
  const hmac = createHmac('sha256', key).update(stamps[0] + '.' + raw).digest();
  return parts.some(([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/i.test(value ?? '')
    && timingSafeEqual(hmac, Buffer.from(value, 'hex')));
}

/** PayOS's signature: HMAC-SHA256 of the fields sorted by name as key=value&…, null and undefined as ''. */
export function payosSignature(data: Record<string, unknown>, checksumKey: string): string {
  const line = Object.keys(data).sort().filter(key => data[key] !== undefined).map(key => {
    let value = data[key];
    if (Array.isArray(value)) value = JSON.stringify(value.map(item => item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map(k => [k, (item as Record<string, unknown>)[k]])) : item));
    if (value === null || value === 'null' || value === 'undefined') value = '';
    return `${key}=${value}`;
  }).join('&');
  return createHmac('sha256', checksumKey).update(line).digest('hex');
}

export function authenticPayos(data: Record<string, unknown>, signature: unknown, checksumKey: string): boolean {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(payosSignature(data, checksumKey), 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
}

// ---------- orders ----------

const orderKey = (id: string) => `shop-orders/${id}`;
type RefKind = 'session' | 'subscription' | 'intent' | 'payos' | 'request';
const refKey = (kind: RefKind, id: string | number) => `shop-refs/${kind}/${id}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function readOrder(store: Store, id: unknown): Promise<ShopOrder | null> {
  return typeof id === 'string' && UUID.test(id) ? (await store.get(orderKey(id), { type: 'json' })) as ShopOrder | null : null;
}

const saveOrder = (store: Store, order: ShopOrder) => store.setJSON(orderKey(order.id), order);

async function orderByRef(store: Store, kind: RefKind, id: string | number): Promise<ShopOrder | null> {
  return readOrder(store, await store.get(refKey(kind, id)));
}

export interface CheckoutInput {
  machine: string;
  legacyMachine: string | null;
  request: RequestRecord;
  packageId: unknown;
  currency: unknown;
  provider: unknown;
  toMachine: string | null;
}

export class ShopError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const amountText = (amount: number, currency: Currency) => currency === 'vnd' ? `${amount} VND` : `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

/** Makes an order and the provider's payment page; gives the page's address. */
export type CheckoutAnswer =
  | { url: string; order: string }
  | { order: string; bank: { bin: string; account: string; accountName: string }; amount: number; note: string };

export async function startCheckout(store: Store, input: CheckoutInput, send: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<CheckoutAnswer> {
  const item = forSale(await readCatalogue(store)).find(p => p.id === input.packageId);
  if (!item || item.kind === 'trial') throw new ShopError('package', 404);
  const currency = CURRENCIES.find(c => c === input.currency);
  const amount = currency ? item.prices[currency] : undefined;
  if (!currency || !amount) throw new ShopError('currency', 400);
  const provider = (['stripe', 'payos', 'bank'] as const).find(p => p === input.provider);
  if (!provider) throw new ShopError('provider', 400);
  if ((provider === 'payos' || provider === 'bank') && currency !== 'vnd') throw new ShopError('currency', 400);
  const stripe = stripeSettings(env);
  const payos = payosSettings(env);
  const bank = provider === 'bank' ? await bankSettings(store) : null;
  if ((provider === 'stripe' && !stripe) || (provider === 'payos' && !payos) || (provider === 'bank' && !bank)) throw new ShopError('offline', 503);

  const current = await activeLicence(store, input.machine);
  if (item.kind === 'addon' && !current) throw new ShopError('no licence', 409);
  if ((item.addon === 'move' || item.addon === 'second-machine') && (!input.toMachine || input.toMachine === input.machine)) throw new ShopError('to machine', 400);

  const order: ShopOrder = {
    id: randomUUID(), at: now.toISOString(), package: item, machine: input.machine, legacyMachine: input.legacyMachine,
    request: input.request.id, toMachine: item.addon === 'move' || item.addon === 'second-machine' ? input.toMachine : null,
    currency, amount, provider, status: 'pending',
  };
  const origin = hubOrigin(env);
  const back = (result: 'paid' | 'cancelled') => `${origin}/packages.html?checkout=${result}&order=${order.id}`;
  if (provider === 'bank') {
    // An ordinary transfer: the server draws the VietQR code itself; the owner marks the order paid in the console.
    order.status = 'awaiting-transfer';
    order.transferCode = bank!.notePrefix + Array.from(randomBytes(6), b => TRANSFER_ALPHABET[b % TRANSFER_ALPHABET.length]).join('');
  }
  await saveOrder(store, order);
  await store.set(refKey('request', input.request.id), order.id);
  if (provider === 'bank') {
    return { order: order.id, bank: { bin: bank!.bin, account: bank!.account, accountName: bank!.accountName }, amount, note: order.transferCode! };
  }

  if (provider === 'stripe') {
    const recurring = item.billing === 'month' || item.billing === 'year';
    const fields = new URLSearchParams({
      mode: recurring ? 'subscription' : 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': `HNMO · ${item.name.en}`,
      'metadata[hnmo_order]': order.id,
      client_reference_id: order.id,
      success_url: back('paid'),
      cancel_url: back('cancelled'),
    });
    if (recurring) {
      fields.set('line_items[0][price_data][recurring][interval]', item.billing);
      fields.set('subscription_data[metadata][hnmo_order]', order.id);
    } else {
      fields.set('payment_intent_data[metadata][hnmo_order]', order.id);
    }
    const result = await send('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + stripe!.apiKey, 'Idempotency-Key': order.id, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fields,
      signal: AbortSignal.timeout(10_000),
    });
    if (!result.ok) throw new ShopError('checkout', 502);
    const data = await result.json() as { id?: string; url?: string; livemode?: boolean };
    const url = data.url ? new URL(data.url) : null;
    if (!url || url.origin !== 'https://checkout.stripe.com' || url.username || url.password
      || data.livemode !== stripe!.live || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(data.id ?? '')) throw new ShopError('checkout', 502);
    order.sessionId = data.id;
    await saveOrder(store, order);
    await store.set(refKey('session', data.id!), order.id);
    return { url: url.href, order: order.id };
  }

  // PayOS: a positive whole order code (up to 15 digits) of the time and a random part, kept to find the order.
  const orderCode = Number(`${now.getTime() % 1_000_000_000}${randomBytes(2).readUInt16BE() % 1000}`.padEnd(12, '0').slice(0, 12));
  const description = `HNMO${String(orderCode).slice(-5)}`;
  const signed = { amount, cancelUrl: back('cancelled'), description, orderCode, returnUrl: back('paid') };
  const result = await send('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: { 'x-client-id': payos!.clientId, 'x-api-key': payos!.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...signed, items: [{ name: `HNMO ${item.id}`.slice(0, 25), quantity: 1, price: amount }], signature: payosSignature(signed, payos!.checksumKey) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new ShopError('checkout', 502);
  const answer = await result.json() as { code?: string; data?: { checkoutUrl?: string; orderCode?: number; amount?: number } };
  const url = answer.data?.checkoutUrl ? new URL(answer.data.checkoutUrl) : null;
  if (answer.code !== '00' || !url || url.protocol !== 'https:' || !/(^|\.)payos\.vn$/.test(url.hostname)
    || answer.data?.orderCode !== orderCode || answer.data?.amount !== amount) throw new ShopError('checkout', 502);
  order.orderCode = orderCode;
  await saveOrder(store, order);
  await store.set(refKey('payos', orderCode), order.id);
  return { url: url.href, order: order.id };
}

/** Seconds until a server should ask /api/licence again: soon while its order is being paid, else every 6 hours. */
export async function retryAfterSeconds(store: Store, request: RequestRecord, now = new Date()): Promise<number> {
  const order = await orderByRef(store, 'request', request.id);
  const age = order ? now.getTime() - Date.parse(order.at) : Infinity;
  // A transfer is confirmed by hand and may take hours: once an hour keeps the calls few.
  if (order?.status === 'awaiting-transfer' && age < TRANSFER_DAYS * DAY) return 3600;
  return order && (order.status === 'pending' || order.status === 'paid') && age < 30 * 60 * 1000 ? 30 : 21_600;
}

// ---------- licences ----------

/** The shop licence a computer has now (not withdrawn, not ended), or null. */
export async function activeLicence(store: Store, machine: string, today = sydneyDay()): Promise<ShopLicenceRecord | null> {
  const id = await store.get(`machine-licences/${machine}`);
  if (typeof id !== 'string') return null;
  const record = (await store.get(`licences/${id}`, { type: 'json' })) as ShopLicenceRecord | null;
  if (!record || record.revoked || (record.expires && record.expires < today)) return null;
  return record;
}

const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);

async function signingKey(store: Store) {
  let key = await licenceKey(store);
  if (!key) {
    key = makeLicenceKey();
    await store.setJSON('keys/licence', key);
  }
  return privatePem(key);
}

/** Signs a licence, keeps it, and hands it to the computer's request (its next /api/licence poll gets it). */
type Fields = Omit<LicenceBody, 'issued'> & { seasons: Season[]; package: string; bonusPlayers?: number };

async function sign(store: Store, fields: Fields, request: RequestRecord | null, now: Date): Promise<ShopLicenceRecord> {
  const { seasons, package: packageId, bonusPlayers, ...body } = fields;
  const licence: LicenceBody & { seasons: Season[] } = { ...body, issued: now.toISOString(), seasons };
  const file = signLicence(licence as LicenceBody, await signingKey(store));
  const previous = (await store.get(`licences/${licence.id}`, { type: 'json' })) as ShopLicenceRecord | null;
  const record: ShopLicenceRecord = {
    ...licence, requestId: request?.id ?? previous?.requestId ?? null, revoked: null, file, seasons, package: packageId,
    ...(bonusPlayers ? { bonusPlayers } : {}),
    ...(previous?.manyComputers ? { manyComputers: true } : {}),
  };
  await store.setJSON(`licences/${licence.id}`, record);
  if (licence.machine) await store.set(`machine-licences/${licence.machine}`, licence.id);
  if (request) {
    await store.setJSON(`requests/${request.id}`, { ...request, status: 'issued', licenceId: licence.id, licence: file, decidedAt: now.toISOString() });
  }
  return record;
}

const newLicenceId = (now: Date) => `L-${sydneyDay(now)}-${randomUUID().slice(0, 6)}`;

async function readRequest(store: Store, id: string): Promise<RequestRecord | null> {
  return (await store.get(`requests/${id}`, { type: 'json' })) as RequestRecord | null;
}

/** Applies a paid order: a plan starts or extends the computer's licence, an add-on changes it. Once per order. */
export async function issueOrder(store: Store, order: ShopOrder, now = new Date(), renewal = false): Promise<ShopLicenceRecord | null> {
  const request = await readRequest(store, order.request);
  const today = sydneyDay(now);
  const current = await activeLicence(store, order.machine, today);
  const item = order.package;
  const licensee = current?.licensee ?? (request?.name || 'HNMO host');
  let record: ShopLicenceRecord | null = null;

  const bonus = current?.bonusPlayers ?? 0;
  const base = current ? current.maxPlayers - bonus : 0;
  const seasons = current?.seasons ?? ['s6'];
  if (item.kind === 'plan' || item.kind === 'trial') {
    // A plan bought again (or its renewal invoice) extends from the current end; the plan's players and Seasons apply,
    // except that a renewal keeps what an upgrade gave.
    const from = current?.expires && current.expires >= today ? current.expires : today;
    const lifetime = item.durationDays === null || (current !== null && current.expires === null);
    const players = renewal && current ? base : item.maxPlayers ?? 1;
    record = await sign(store, {
      licensee, id: current?.id ?? newLicenceId(now), machine: order.machine,
      maxPlayers: players + bonus, expires: lifetime ? null : addDays(from, item.durationDays!),
      seasons: renewal && current ? seasons : item.seasons, package: item.id, bonusPlayers: bonus,
    }, request, now);
  } else if (current) {
    const same = { licensee, id: current.id, machine: order.machine, expires: current.expires, package: current.package ?? item.id };
    if (item.addon === 'players') {
      const more = bonus + (item.addPlayers ?? 0);
      record = await sign(store, { ...same, maxPlayers: base + more, seasons, bonusPlayers: more }, request, now);
    } else if (item.addon === 'upgrade') {
      const target = (await readCatalogue(store)).find(p => p.id === item.upgradeTo);
      record = await sign(store, { ...same, maxPlayers: Math.max(base, target?.maxPlayers ?? base) + bonus, seasons: target?.seasons ?? seasons, package: target?.id ?? same.package, bonusPlayers: bonus }, request, now);
    } else if (item.addon === 'move' && order.toMachine) {
      await store.setJSON(`licences/${current.id}`, { ...current, revoked: now.toISOString(), revokedReason: `moved to ${order.toMachine}` });
      await store.delete(`machine-licences/${order.machine}`);
      record = await deliverToMachine(store, order.toMachine, { ...same, id: newLicenceId(now), machine: order.toMachine, maxPlayers: current.maxPlayers, seasons, bonusPlayers: bonus }, now);
    } else if (item.addon === 'second-machine' && order.toMachine) {
      record = await deliverToMachine(store, order.toMachine, { ...same, id: newLicenceId(now), machine: order.toMachine, maxPlayers: item.maxPlayers ?? 20, seasons, package: item.id }, now);
    }
  }

  order.status = record ? 'issued' : 'failed';
  order.issuedAt = now.toISOString();
  if (record) order.licenceId = record.id;
  else order.note = 'no active licence to change';
  await saveOrder(store, order);
  return record;
}

/** A licence for another computer: given to its open request now, or kept for its next request. */
async function deliverToMachine(store: Store, machine: string, fields: Fields, now: Date): Promise<ShopLicenceRecord> {
  const open = (await listJson<RequestRecord>(store, 'requests/')).filter(r => r.machine === machine && r.status === 'open').sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const record = await sign(store, fields, open, now);
  if (!open) await store.set(`pending-licences/${machine}`, record.id);
  return record;
}

/** A new request of a computer that a licence is waiting for (a move or a second machine) gets it at once. */
export async function deliverPending(store: Store, request: RequestRecord, now = new Date()): Promise<boolean> {
  const id = await store.get(`pending-licences/${request.machine}`);
  if (typeof id !== 'string') return false;
  const record = (await store.get(`licences/${id}`, { type: 'json' })) as ShopLicenceRecord | null;
  if (!record || record.revoked) return false;
  await store.setJSON(`requests/${request.id}`, { ...request, status: 'issued', licenceId: record.id, licence: record.file, decidedAt: now.toISOString() });
  await store.setJSON(`licences/${record.id}`, { ...record, requestId: request.id });
  await store.delete(`pending-licences/${request.machine}`);
  return true;
}

/** The free trial: once per computer, never after a paid licence. */
export async function startTrial(store: Store, request: RequestRecord, now = new Date()): Promise<ShopLicenceRecord> {
  const trial = (await readCatalogue(store)).find(p => p.kind === 'trial' && p.active);
  if (!trial) throw new ShopError('no trial', 404);
  const machine = request.machine;
  if (await store.get(`trials/${machine}`) || await store.get(`machine-licences/${machine}`)) throw new ShopError('trial used', 409);
  await store.setJSON(`trials/${machine}`, { at: now.toISOString(), request: request.id });
  return sign(store, {
    licensee: request.name || 'HNMO host', id: newLicenceId(now), machine, maxPlayers: trial.maxPlayers ?? 100,
    expires: addDays(sydneyDay(now), trial.durationDays ?? 14), seasons: trial.seasons, package: trial.id,
  }, request, now);
}

async function withdraw(store: Store, order: ShopOrder, reason: string, now: Date): Promise<void> {
  if (order.licenceId) {
    const record = (await store.get(`licences/${order.licenceId}`, { type: 'json' })) as ShopLicenceRecord | null;
    if (record && !record.revoked) await store.setJSON(`licences/${record.id}`, { ...record, revoked: now.toISOString(), revokedReason: reason });
  }
  order.status = 'refunded';
  order.refundedAt = now.toISOString();
  order.note = reason;
  await saveOrder(store, order);
}

/** Once per event id: false when it was applied before. */
async function firstTime(store: Store, id: string, now: Date): Promise<boolean> {
  const key = `shop-events/${id}`;
  if (await store.get(key)) return false;
  await store.set(key, now.toISOString());
  return true;
}

type StripeObject = {
  id?: string; object?: string; metadata?: Record<string, string>; client_reference_id?: string; currency?: string;
  amount_total?: number; amount_paid?: number; payment_status?: string; payment_intent?: string | null;
  subscription?: string | null; billing_reason?: string; mode?: string;
};

/** A verified Stripe event: issue on a paid checkout, extend on a renewal invoice, withdraw on a refund or dispute. */
export async function applyStripeEvent(store: Store, event: unknown, settings: StripeSettings, now = new Date()): Promise<'applied' | 'ignored' | 'retry'> {
  if (!event || typeof event !== 'object') return 'ignored';
  const e = event as { id?: string; type?: string; livemode?: boolean; data?: { object?: StripeObject } };
  if (typeof e.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(e.id) || e.livemode !== settings.live) return 'ignored';
  const object = e.data?.object;
  if (!object) return 'ignored';

  if (e.type === 'checkout.session.completed' || e.type === 'checkout.session.async_payment_succeeded') {
    const order = await readOrder(store, object.metadata?.hnmo_order ?? object.client_reference_id);
    if (!order || order.provider !== 'stripe') return 'ignored';
    if (!order.sessionId) return 'retry';
    if (order.sessionId !== object.id || order.currency !== object.currency || order.amount !== object.amount_total
      || (object.payment_status !== 'paid' && object.payment_status !== 'no_payment_required')) return 'ignored';
    if (await finishPaid(store, order, now)) return 'applied';
    if (!await firstTime(store, e.id, now) || order.status !== 'pending') return 'applied';
    order.status = 'paid';
    order.paidAt = now.toISOString();
    if (typeof object.payment_intent === 'string') {
      order.paymentIntent = object.payment_intent;
      await store.set(refKey('intent', object.payment_intent), order.id);
    }
    if (typeof object.subscription === 'string') {
      order.subscriptionId = object.subscription;
      await store.set(refKey('subscription', object.subscription), order.id);
    }
    await saveOrder(store, order);
    await issueOrder(store, order, now);
    return 'applied';
  }

  if (e.type === 'invoice.paid') {
    if (typeof object.subscription !== 'string' || object.billing_reason === 'subscription_create') return 'ignored';
    const order = await orderByRef(store, 'subscription', object.subscription);
    if (!order) return 'ignored';
    if (!await firstTime(store, e.id, now)) return 'applied';
    if (typeof object.payment_intent === 'string') await store.set(refKey('intent', object.payment_intent), order.id);
    await issueOrder(store, order, now, true);
    return 'applied';
  }

  if (e.type === 'charge.refunded' || e.type === 'charge.dispute.created') {
    if (typeof object.payment_intent !== 'string') return 'ignored';
    const order = await orderByRef(store, 'intent', object.payment_intent);
    if (!order) return 'ignored';
    if (!await firstTime(store, e.id, now)) return 'applied';
    await withdraw(store, order, e.type === 'charge.refunded' ? 'refunded' : 'payment disputed', now);
    return 'applied';
  }
  return 'ignored';
}

/**
 * An order saved as paid whose licence wasn't issued (the issue failed after the save): the repeated webhook or the
 * owner's second click issues it now. Gives whether it was such an order.
 */
async function finishPaid(store: Store, order: ShopOrder, now: Date): Promise<boolean> {
  if (order.status !== 'paid' || order.issuedAt) return false;
  await issueOrder(store, order, now);
  return true;
}

/** A PayOS webhook: verified by its signature; code '00' for the right amount issues the licence once. */
export async function applyPayosWebhook(store: Store, body: unknown, settings: PayosSettings, now = new Date()): Promise<'applied' | 'ignored' | 'invalid'> {
  if (!body || typeof body !== 'object') return 'invalid';
  const hook = body as { code?: string; success?: boolean; data?: Record<string, unknown>; signature?: unknown };
  if (!hook.data || typeof hook.data !== 'object' || !authenticPayos(hook.data, hook.signature, settings.checksumKey)) return 'invalid';
  const orderCode = hook.data.orderCode;
  if (!Number.isInteger(orderCode)) return 'ignored';
  const order = await orderByRef(store, 'payos', orderCode as number);
  if (!order || order.provider !== 'payos') return 'ignored';
  if (hook.code !== '00' || hook.data.code !== '00' || hook.data.amount !== order.amount) return 'ignored';
  if (await finishPaid(store, order, now)) return 'applied';
  if (!await firstTime(store, `payos-${orderCode}-${String(hook.data.reference ?? '')}`, now) || order.status !== 'pending') return 'applied';
  order.status = 'paid';
  order.paidAt = now.toISOString();
  await saveOrder(store, order);
  await issueOrder(store, order, now);
  return 'applied';
}

/** A transfer left unpaid for TRANSFER_DAYS ends; gives whether it did (and saves it). */
async function expireIfOld(store: Store, order: ShopOrder, now: Date): Promise<boolean> {
  if (order.status !== 'awaiting-transfer' || now.getTime() - Date.parse(order.at) < TRANSFER_DAYS * DAY) return false;
  order.status = 'expired';
  await saveOrder(store, order);
  return true;
}

/** The owner saw the transfer on the statement: the order is issued like a webhook's. */
export async function markTransferPaid(store: Store, id: unknown, now = new Date()): Promise<ShopOrder> {
  const order = await readOrder(store, id);
  if (!order || order.provider !== 'bank') throw new ShopError('unknown order', 404);
  if (await expireIfOld(store, order, now)) throw new ShopError('expired', 409);
  if (await finishPaid(store, order, now)) return (await readOrder(store, order.id))!;
  if (order.status !== 'awaiting-transfer') throw new ShopError('not waiting', 409);
  order.status = 'paid';
  order.paidAt = now.toISOString();
  await saveOrder(store, order);
  await issueOrder(store, order, now);
  return (await readOrder(store, order.id))!;
}

export async function cancelTransfer(store: Store, id: unknown): Promise<ShopOrder> {
  const order = await readOrder(store, id);
  if (!order || order.provider !== 'bank') throw new ShopError('unknown order', 404);
  if (order.status !== 'awaiting-transfer') throw new ShopError('not waiting', 409);
  order.status = 'cancelled';
  await saveOrder(store, order);
  return order;
}

export async function listOrders(store: Store, now = new Date()): Promise<ShopOrder[]> {
  const orders = (await listJson<ShopOrder>(store, 'shop-orders/', 5000)).sort((a, b) => b.at.localeCompare(a.at));
  for (const order of orders) await expireIfOld(store, order, now);
  return orders;
}

export { amountText };

// ---------- automatic error keys ----------

const keyHash = (key: string) => createHash('sha256').update(`hnmo-auto-error|${key}`).digest('hex');

/** A new automatic error key for a computer (its old one stops working); only its hash is kept. */
export async function newAutoErrorKey(store: Store, machine: string, now = new Date()): Promise<string> {
  const key = randomBytes(32).toString('base64url');
  await store.setJSON(`autoerror-keys/${machine}`, { hash: keyHash(key), made: now.toISOString() });
  return key;
}

/** The key the first-setup answer brings: only when the computer has none yet. */
export async function firstAutoErrorKey(store: Store, machine: string, now = new Date()): Promise<string | null> {
  return await store.get(`autoerror-keys/${machine}`) ? null : newAutoErrorKey(store, machine, now);
}

export async function checkAutoErrorKey(store: Store, machine: string, supplied: unknown): Promise<boolean> {
  if (typeof supplied !== 'string' || supplied.length < 32 || supplied.length > 256) return false;
  const saved = (await store.get(`autoerror-keys/${machine}`, { type: 'json' })) as { hash?: string } | null;
  if (!saved?.hash) return false;
  return timingSafeEqual(Buffer.from(saved.hash, 'hex'), Buffer.from(keyHash(supplied), 'hex'));
}
