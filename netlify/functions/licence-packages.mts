// The licence shop's server-facing calls, in one function (owner, 2026-11-28: as few function calls as possible).
// GET  /api/licence-packages: the packages a server shows on its admin panel (priced and active, and the trial) and the
//      payment providers that are set up. The same for everyone, so it stays on the CDN (tag `licence-packages`, purged
//      when the console saves the packages).
// POST /api/licence-checkout {machine, legacyMachine?, request, token, packageId, currency, provider, toMachine?}: an
//      HNMO server opens a payment page for its own licence request; the hub signs the licence when the payment is
//      confirmed and the server's next POST /api/licence brings it. provider 'bank' (VND): no page; the answer has the
//      owner's account, the amount and the transfer note for the server's own VietQR code; the owner marks it paid.
// POST /api/licence-trial {machine, request, token}: the free trial, at once, once per computer.
import { CDN_HEADERS } from '../lib/cdn.mts';
import { sydneyDay } from '../lib/day.mts';
import { authenticRequest, countOnce, hub, json } from '../lib/hub.mts';
import { cleanMachine } from '../lib/report.mts';
import { CHECKOUTS_PER_DAY, forSale, providers, readCatalogue, ShopError, startCheckout, startTrial } from '../lib/shop.mts';

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const store = hub();
  if (path === '/api/licence-packages') {
    if (req.method !== 'GET') return json({ error: 'Buy from the License page of your HNMO admin panel.' }, 410);
    return json({ packages: forSale(await readCatalogue(store)), providers: await providers(store) }, 200, CDN_HEADERS('licence-packages'));
  }

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  if (raw.length > 4_000) return json({ error: 'too big' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'not JSON' }, 400);
  const machine = cleanMachine(body.machine);
  if (!machine) return json({ error: 'machine' }, 400);
  const legacy = cleanMachine(body.legacyMachine);
  const request = await authenticRequest(store, body, machine, legacy);
  if (!request) return json({ error: 'unknown request' }, 404);

  try {
    if (path === '/api/licence-trial') {
      const licence = await startTrial(store, request);
      return json({ status: 'issued', licence: licence.file });
    }
    if (!(await countOnce(store, `limits/${sydneyDay()}/checkout/m-${machine}`, CHECKOUTS_PER_DAY))) return json({ error: 'limit' }, 429);
    return json(await startCheckout(store, {
      machine, legacyMachine: legacy, request, packageId: body.packageId, currency: body.currency, provider: body.provider,
      toMachine: cleanMachine(body.toMachine),
    }));
  } catch (error) {
    if (error instanceof ShopError) return json({ error: error.code }, error.status);
    return json({ error: 'checkout' }, 502);
  }
};

export const config = { path: ['/api/licence-packages', '/api/licence-checkout', '/api/licence-trial'] };
