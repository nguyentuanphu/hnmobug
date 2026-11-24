import { clientIp, countOnce, hub, ipHash, json } from '../lib/hub.mts';
import { sydneyDay } from '../lib/day.mts';
import { checkout, readPackages, stripeTestSettings } from '../lib/licence-purchase.mts';

export default async (req: Request, context: { ip?: string }) => {
  const settings = stripeTestSettings();
  const store = hub();
  if (req.method === 'GET') {
    return json({ packages: await readPackages(store), testCheckout: !!settings && new URL(req.url).origin === settings.origin });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!settings || new URL(req.url).origin !== settings.origin) return json({ error: 'offline' }, 503);
  if (req.headers.get('origin') !== settings.origin || !req.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: 'origin' }, 403);
  }

  const input = await req.text();
  if (input.length > 1024) return json({ error: 'size' }, 400);
  let packageId: unknown;
  try {
    packageId = JSON.parse(input)?.packageId;
  } catch {
    return json({ error: 'package' }, 400);
  }
  const item = (await readPackages(store)).find(p => p.id === packageId);
  if (!item) return json({ error: 'package' }, 404);
  if (!await countOnce(store, 'limits/' + sydneyDay() + '/licence-checkout/' + ipHash(clientIp(req, context)), 10)) {
    return json({ error: 'limit' }, 429);
  }
  try {
    return json({ url: await checkout(store, item, settings) });
  } catch {
    return json({ error: 'checkout' }, 502);
  }
};

export const config = { path: '/api/licence-packages' };
