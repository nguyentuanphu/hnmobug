// The developer's console, on a hidden path: /c/<CONSOLE_SLUG>/ (any other /c/… path is a plain "not found" page of
// the cover site). Sign-in: the password always; on a browser not yet trusted also the authenticator code, after which
// the browser is trusted for 30 days. API under /c/<slug>/api/: login, logout, state, make-key, issue, decline, revoke,
// forget-device. Every change needs the session cookie and the X-Console header (no cross-site requests).
import { randomUUID } from 'node:crypto';
import { checkPassword, checkTotp, cookie, cookies, sign, unsign, SESSION_HOURS, TRUST_DAYS } from '../lib/auth.mts';
import { makeLicenceKey, privatePem, signLicence, type LicenceBody } from '../lib/keys.mts';
import { sydneyDay } from '../lib/day.mts';
import { clientIp, countOnce, hub, ipHash, json, licenceKey, listJson, type Device, type HostRecord, type LicenceRecord, type RequestRecord, type Store } from '../lib/hub.mts';
import { consolePage, notFoundPage } from '../lib/console-page.mts';

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

  if (action === 'login' && req.method === 'POST') {
    const who = ipHash(clientIp(req, context));
    const hour = new Date().toISOString().slice(0, 13);
    const failKey = `auth/fail/${who}/${hour}`;
    if (Number((await store.get(failKey)) ?? 0) >= 10) return json({ error: 'wait', message: 'Too many tries; wait an hour.' }, 429);
    const body = (await req.json().catch(() => ({}))) as { password?: string; code?: string };
    const fail = async () => {
      await countOnce(store, failKey, 1000);
      return json({ error: 'wrong' }, 401);
    };
    if (!checkPassword(body.password ?? '')) return fail();
    let device = await trustedDevice(req, store);
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (!device) {
      if (!body.code) return json({ needCode: true });
      if (!checkTotp(body.code)) return fail();
      device = randomUUID();
      const now = new Date().toISOString();
      const record: Device = { id: device, name: cleanText(req.headers.get('user-agent'), 160) || 'browser', added: now, lastSeen: now };
      await store.setJSON(`devices/${device}`, record);
      headers.append('Set-Cookie', cookie('hnmo_device', sign({ exp: Date.now() + TRUST_DAYS * 86400_000, d: device }), base, TRUST_DAYS * 86400));
    } else {
      const record = (await store.get(`devices/${device}`, { type: 'json' })) as Device | null;
      if (record) await store.setJSON(`devices/${device}`, { ...record, lastSeen: new Date().toISOString() });
    }
    headers.append('Set-Cookie', cookie('hnmo_session', sign({ exp: Date.now() + SESSION_HOURS * 3600_000, d: device }), base, SESSION_HOURS * 3600));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  const session = await signedIn(req, store);
  if (!session) return json({ error: 'sign in' }, 401);

  if (action === 'logout') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie('hnmo_session', '', base, 0) } });
  }

  if (action === 'state' && req.method === 'GET') {
    const key = await licenceKey(store);
    const [hosts, requests, licences, devices] = await Promise.all([
      listJson<HostRecord>(store, 'hosts/'),
      listJson<RequestRecord>(store, 'requests/'),
      listJson<LicenceRecord>(store, 'licences/'),
      listJson<Device>(store, 'devices/'),
    ]);
    const { blobs } = await store.list({ prefix: 'pending/' });
    return json({
      today: sydneyDay(),
      licenceKey: key ? { publicPem: key.publicPem, made: key.made } : null,
      hosts: hosts.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
      requests: requests.map(({ tokenHash: _hidden, ...r }) => r).sort((a, b) => b.at.localeCompare(a.at)),
      licences: licences.sort((a, b) => b.issued.localeCompare(a.issued)),
      devices: devices.map((d) => ({ ...d, current: d.id === session.d })),
      pendingBugs: blobs.length,
      issuesUrl: process.env.ISSUES_URL || '',
    });
  }

  if (req.method !== 'POST') return json({ error: 'unknown' }, 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

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
    await store.setJSON(`licences/${id}`, { ...record, revoked: body.undo === true ? null : new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === 'forget-device') {
    const id = cleanText(body.device, 60);
    await store.delete(`devices/${id}`);
    return json({ ok: true });
  }

  return json({ error: 'unknown' }, 404);
};

export const config = { path: '/c/*' };
