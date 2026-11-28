// The developer's console is on /c/<CONSOLE_SLUG>/. Any other /c/… path shows the public 404 page.
// Sign-in always requires the password. An untrusted browser also needs an authenticator code. Every successful sign-in
// starts a new trust period. The first visit uses the hub key to set the password and create the authenticator key.
// API under /c/<slug>/api/: status, setup, login, logout, state, make-key, issue, decline, revoke,
// forget-device, mark (a test machine or a real host), latest (the newest release HNMO servers are told about). Every change needs the session cookie and the X-Console header (no cross-site requests).
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { base32Encode, checkPassword, checkTotp, cookie, cookies, hashPassword, sign, unsign, SESSION_HOURS, TRUST_DAYS } from '../lib/auth.mts';
import { makeLicenceKey, privatePem, signLicence, type LicenceBody } from '../lib/keys.mts';
import { sydneyDay } from '../lib/day.mts';
import { clientIp, consoleCredentials, countOnce, hub, ipHash, json, licenceKey, listJson, type CloneRecord, type ConsoleCredentials, type Device, type HostRecord, type LicenceRecord, type MachineMark, type RequestRecord, type SeenRecord, type SetupRecord, type Store, isTestMachine } from '../lib/hub.mts';
import { consolePage, notFoundPage } from '../lib/console-page.mts';
import { purge } from '../lib/cdn.mts';
import { listLimitFlags, readLimits, saveLimits, setFlagAside } from '../lib/limits.mts';
import { amountText, bankSettings, cancelTransfer, listOrders, markTransferPaid, paymentStatus, providers, readCatalogue, saveBankSettings, saveCatalogue, savePayos, ShopError } from '../lib/shop.mts';
import { licenceOrdersCsv, listLicenceOrders, parseLicenceOrderFilters } from '../lib/licence-orders.mts';

interface Session { exp: number; d: string }
interface Trust { exp: number; d: string }

const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });

async function signedIn(req: Request, store: Store): Promise<Session | null> {
  const session = unsign<Session>(cookies(req).hnmo_session);
  if (!session || session.exp < Date.now()) return null;
  return (await store.get(`devices/${session.d}`)) ? session : null;
}

async function trustedDevice(req: Request, store: Store): Promise<string | null> {
  const trust = unsign<Trust>(cookies(req).hnmo_device);
  if (!trust || trust.exp < Date.now()) return null;
  return (await store.get(`devices/${trust.d}`)) ? trust.d : null;
}

const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export default async (req: Request, context: { ip?: string }) => {
  const url = new URL(req.url);
  const slug = process.env.CONSOLE_SLUG || '';
  const parts = url.pathname.split('/').filter(Boolean); // c, slug, …
  if (slug.length < 12 || parts[1] !== slug) return html(notFoundPage(), 404);
  const base = `/c/${slug}`;
  const action = parts[2] === 'api' ? parts[3] ?? '' : '';
  if (!action) return html(consolePage(base));

  const store = hub();
  if (req.method === 'POST' && req.headers.get('x-console') !== '1') return json({ error: 'header' }, 403);

  const who = ipHash(clientIp(req, context));
  const failKey = `auth/fail/${who}/${new Date().toISOString().slice(0, 13)}`;
  const tooMany = async () => Number((await store.get(failKey)) ?? 0) >= 10;
  const fail = async () => {
    await countOnce(store, failKey, 1000);
    return json({ error: 'wrong' }, 401);
  };

  // Whether the sign-in was set yet (the page shows the first-use form when not).
  if (action === 'status' && req.method === 'GET') {
    return json({ configured: (await consoleCredentials(store)) !== null });
  }

  // First use: the hub key (which only the developer has) proves it's them; the password is set and an authenticator
  // key is made, shown once to add to the app. Refused once a sign-in exists.
  if (action === 'setup' && req.method === 'POST') {
    if (await tooMany()) return json({ error: 'wait' }, 429);
    if (await consoleCredentials(store)) return json({ error: 'already set' }, 409);
    const body = (await req.json().catch(() => ({}))) as { hubKey?: string; password?: string };
    const expected = Buffer.from(process.env.HUB_KEY || '');
    const given = Buffer.from(typeof body.hubKey === 'string' ? body.hubKey.trim() : '');
    if (expected.length < 20 || given.length !== expected.length || !timingSafeEqual(given, expected)) return fail();
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 12 || password.length > 200) return json({ error: 'The password needs 12 characters or more.' }, 400);
    const credentials: ConsoleCredentials = { passwordHash: hashPassword(password), totpSecret: base32Encode(randomBytes(20)), made: new Date().toISOString() };
    await store.setJSON('config/console', credentials);
    return json({ ok: true, totpSecret: credentials.totpSecret, otpauth: `otpauth://totp/HNMO%20console?secret=${credentials.totpSecret}&issuer=HNMO` });
  }

  if (action === 'login' && req.method === 'POST') {
    if (await tooMany()) return json({ error: 'wait', message: 'Too many tries; wait an hour.' }, 429);
    const credentials = await consoleCredentials(store);
    if (!credentials) return json({ error: 'not set' }, 409);
    const body = (await req.json().catch(() => ({}))) as { password?: string; code?: string };
    if (!checkPassword(body.password ?? '', credentials.passwordHash)) return fail();
    let device = await trustedDevice(req, store);
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (!device) {
      if (!body.code) return json({ needCode: true });
      if (!checkTotp(body.code, Date.now(), credentials.totpSecret)) return fail();
      device = randomUUID();
      const now = new Date().toISOString();
      const record: Device = { id: device, name: cleanText(req.headers.get('user-agent'), 160) || 'browser', added: now, lastSeen: now };
      await store.setJSON(`devices/${device}`, record);
    } else {
      const record = (await store.get(`devices/${device}`, { type: 'json' })) as Device | null;
      if (record) await store.setJSON(`devices/${device}`, { ...record, lastSeen: new Date().toISOString() });
    }
    const now = Date.now();
    const trustSeconds = TRUST_DAYS * 86400;
    const sessionSeconds = SESSION_HOURS * 3600;
    headers.append('Set-Cookie', cookie('hnmo_device', sign({ exp: now + trustSeconds * 1000, d: device }), base, trustSeconds));
    headers.append('Set-Cookie', cookie('hnmo_session', sign({ exp: now + sessionSeconds * 1000, d: device }), base, sessionSeconds));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  const session = await signedIn(req, store);
  if (!session) return json({ error: 'sign in' }, 401);

  if (action === 'logout') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie('hnmo_session', '', base, 0) } });
  }

  // The folder limits: the switch and what looks like more than allowed.
  if (req.method === 'GET' && action === 'limits') return json({ ...(await readLimits(store)), flags: await listLimitFlags(store) });

  if (req.method === 'GET' && (action === 'licence-commerce' || action === 'licence-orders' || action === 'licence-orders.csv')) {
    const filters = parseLicenceOrderFilters(url.searchParams);
    const pageText = url.searchParams.get('page') ?? '1';
    if (!filters || !/^[1-9]\d{0,5}$/.test(pageText)) return json({ error: 'filters' }, 400);
    if (action === 'licence-orders.csv') {
      const { orders } = await listLicenceOrders(store, filters);
      return new Response(licenceOrdersCsv(orders), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="hnmo-test-licence-orders-${sydneyDay()}.csv"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    const results = listLicenceOrders(store, filters, Number(pageText));
    if (action === 'licence-orders') return json(await results);
    const [packages, orderPage, shopOrders, bank, payWith, payStatus] = await Promise.all([readCatalogue(store), results, listOrders(store), bankSettings(store), providers(store), paymentStatus(store)]);
    const shop = shopOrders.slice(0, 200).map(o => ({
      id: o.id, at: o.at, package: o.package.id, name: o.package.name, machine: o.machine, toMachine: o.toMachine, provider: o.provider,
      amount: amountText(o.amount, o.currency), status: o.status, transferCode: o.transferCode ?? null, licenceId: o.licenceId ?? null,
      paidAt: o.paidAt ?? null, issuedAt: o.issuedAt ?? null, refundedAt: o.refundedAt ?? null, note: o.note ?? null,
    }));
    const extra = { shopOrders: shop, bank, providers: payWith, payStatus };
    return url.searchParams.has('page') ? json({ packages, ...orderPage, ...extra }) : json({ packages, orders: orderPage.orders, ...extra });
  }

  if (action === 'state' && req.method === 'GET') {
    const key = await licenceKey(store);
    const [hosts, requests, licences, devices, setups, seen, marks, clones] = await Promise.all([
      listJson<HostRecord>(store, 'hosts/'),
      listJson<RequestRecord>(store, 'requests/'),
      listJson<LicenceRecord>(store, 'licences/'),
      listJson<Device>(store, 'devices/'),
      listJson<SetupRecord>(store, 'setups/'),
      listJson<SeenRecord>(store, 'seen/'),
      listJson<MachineMark>(store, 'marks/'),
      listJson<CloneRecord>(store, 'clones/'),
    ]);
    const markOf = (machine: string) => marks.find((m) => m.machine === machine);
    const { blobs } = await store.list({ prefix: 'pending/' });
    return json({
      today: sydneyDay(),
      licenceKey: key ? { publicPem: key.publicPem, made: key.made } : null,
      hosts: hosts.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).map((h) => ({ ...h, test: isTestMachine(h.latest.test, markOf(h.machine)), marked: !!markOf(h.machine) })),
      requests: requests.map(({ tokenHash: _hidden, ...r }) => r).sort((a, b) => b.at.localeCompare(a.at)),
      licences: licences.sort((a, b) => b.issued.localeCompare(a.issued)).map(({ file, ...l }) => ({ ...l, file, computers: seen.find((s) => s.licenceId === l.id)?.computers ?? [], clone: clones.find((c) => c.licenceId === l.id) ?? null })),
      clones: clones.filter((c) => c.flagged),
      setups: setups.sort((a, b) => b.at.localeCompare(a.at)).map((s) => ({ ...s, test: isTestMachine(s.test, markOf(s.machine)), marked: !!markOf(s.machine) })),
      devices: devices.map((d) => ({ ...d, current: d.id === session.d })),
      pendingBugs: blobs.length,
      issuesUrl: process.env.ISSUES_URL || '',
      latest: (await store.get('config/latest', { type: 'json' })) ?? null,
    });
  }

  if (req.method !== 'POST') return json({ error: 'unknown' }, 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (action === 'licence-commerce') {
    if (!(await saveCatalogue(store, body?.packages))) return json({ error: 'packages' }, 400);
    await purge('licence-packages');
    return json({ ok: true });
  }

  if (action === 'limits-enforce') {
    if (typeof body?.enforce !== 'boolean') return json({ error: 'enforce' }, 400);
    return json({ ok: true, ...(await saveLimits(store, body.enforce)) });
  }
  if (action === 'limits-aside') {
    if (typeof body?.key !== 'string' || !(await setFlagAside(store, body.key))) return json({ error: 'flag' }, 400);
    return json({ ok: true });
  }

  // PayOS keys typed in the console (null clears them); the answer never repeats the keys.
  if (action === 'shop-payos') {
    if (!(await savePayos(store, body?.payos ?? null))) return json({ error: 'payos' }, 400);
    await purge('licence-packages');
    return json({ ok: true, payStatus: await paymentStatus(store) });
  }

  // The owner's bank for transfers from a VietQR code (null clears it).
  if (action === 'shop-bank') {
    if (!(await saveBankSettings(store, body?.bank ?? null))) return json({ error: 'bank' }, 400);
    await purge('licence-packages');
    return json({ ok: true, bank: await bankSettings(store) });
  }

  // A bank transfer seen on the statement: the licence is signed and goes to the server like after a webhook.
  if (action === 'shop-order-paid' || action === 'shop-order-cancel') {
    try {
      const order = action === 'shop-order-paid' ? await markTransferPaid(store, body.order) : await cancelTransfer(store, body.order);
      return json({ ok: true, status: order.status, licenceId: order.licenceId ?? null });
    } catch (error) {
      if (error instanceof ShopError) return json({ error: error.code }, error.status);
      throw error;
    }
  }

  if (action === 'make-key') {
    const existing = await licenceKey(store);
    if (existing) return json({ publicPem: existing.publicPem, made: existing.made });
    const key = makeLicenceKey();
    await store.setJSON('keys/licence', key);
    return json({ publicPem: key.publicPem, made: key.made });
  }

  if (action === 'issue') {
    const key = await licenceKey(store);
    if (!key) return json({ error: 'Make the licence key first (Security).' }, 400);
    const requestId = cleanText(body.request, 60) || null;
    const request = requestId ? (await store.get(`requests/${requestId}`, { type: 'json' })) as RequestRecord | null : null;
    const licensee = cleanText(body.licensee, 100);
    const maxPlayers = typeof body.maxPlayers === 'number' ? Math.round(body.maxPlayers) : 0;
    const expires = cleanText(body.expires, 10) || null;
    const machine = cleanText(body.machine, 32).toLowerCase() || null;
    if (!licensee || maxPlayers < 1 || maxPlayers > 100000) return json({ error: 'A name and 1 or more players are needed.' }, 400);
    if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return json({ error: 'The end date is YYYY-MM-DD.' }, 400);
    if (machine && !/^[0-9a-f]{8,32}$/.test(machine)) return json({ error: 'The computer id is 16 letters and digits.' }, 400);
    const id = `L-${sydneyDay()}-${randomUUID().slice(0, 6)}`;
    const licence: LicenceBody = { licensee, maxPlayers, expires, machine, issued: new Date().toISOString(), id };
    const file = signLicence(licence, privatePem(key));
    const record: LicenceRecord = { ...licence, requestId, revoked: null, file };
    await store.setJSON(`licences/${id}`, record);
    if (request) await store.setJSON(`requests/${request.id}`, { ...request, status: 'issued', licenceId: id, licence: file, decidedAt: new Date().toISOString() });
    return json({ ok: true, licence: record });
  }

  if (action === 'decline') {
    const id = cleanText(body.request, 60);
    const request = (await store.get(`requests/${id}`, { type: 'json' })) as RequestRecord | null;
    if (!request) return json({ error: 'unknown request' }, 404);
    await store.setJSON(`requests/${id}`, { ...request, status: 'declined', decidedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === 'revoke') {
    const id = cleanText(body.licence, 60);
    const record = (await store.get(`licences/${id}`, { type: 'json' })) as LicenceRecord | null;
    if (!record) return json({ error: 'unknown licence' }, 404);
    // Giving back a licence withdrawn by itself (seen on 2 or more computers) lets it be used on more computers.
    const undo = body.undo === true;
    await store.setJSON(`licences/${id}`, undo
      ? { ...record, revoked: null, revokedReason: null, manyComputers: record.manyComputers === true || !!record.revokedReason }
      : { ...record, revoked: new Date().toISOString(), revokedReason: null });
    return json({ ok: true });
  }

  // The developer marks computers as test machines or real hosts (one, or several at once).
  if (action === 'mark') {
    const list = Array.isArray(body.machines) ? body.machines : [body.machine];
    const machines = list.map((m) => cleanText(m, 32).toLowerCase()).filter((m) => /^[0-9a-f]{8,32}$/.test(m)).slice(0, 500);
    if (!machines.length || typeof body.test !== 'boolean') return json({ error: 'machine and test' }, 400);
    const at = new Date().toISOString();
    for (const machine of machines) await store.setJSON(`marks/${machine}`, { machine, test: body.test, at } satisfies MachineMark);
    return json({ ok: true, marked: machines.length });
  }

  // The newest HNMO release: what servers' update check and their website's download link get (/api/latest).
  if (action === 'latest') {
    const tag = cleanText(body.tag, 40);
    const url = cleanText(body.url, 500);
    if (url && !/^https:\/\/[^\s]+$/.test(url)) return json({ error: 'The link starts with https://.' }, 400);
    if (tag && !/^\d+\.\d+\.\d+$/.test(tag)) return json({ error: 'The version is like 1.0.0.' }, 400);
    if (!tag) {
      await store.delete('config/latest');
      await purge('latest');
      return json({ ok: true, latest: null });
    }
    // The download link may stay empty: the release's own HNMO.zip on the update storage is used then.
    const latest = { tag, url, notes: cleanText(body.notes, 4000), published: new Date().toISOString() };
    await store.setJSON('config/latest', latest);
    await purge('latest');
    return json({ ok: true, latest });
  }

  if (action === 'forget-device') {
    const id = cleanText(body.device, 60);
    await store.delete(`devices/${id}`);
    return json({ ok: true });
  }

  return json({ error: 'unknown' }, 404);
};

export const config = { path: '/c/*' };
