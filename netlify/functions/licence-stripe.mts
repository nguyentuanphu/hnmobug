// Payment webhooks of the licence shop, in one function.
// POST /api/licence-stripe: Stripe (signature checked over the exact body): a paid checkout issues the licence, a renewal
//      invoice extends it, a refund or dispute withdraws it.
// POST /api/licence-payos: PayOS (bank transfer/VietQR; signature over the sorted data fields): code '00' for the
//      order's amount issues the licence. PayOS checks the address with a test call when it is set up: answered 200.
import { hub, json } from '../lib/hub.mts';
import { applyPayosWebhook, applyStripeEvent, authenticStripeEvent, payosSettings, stripeSettings } from '../lib/shop.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await req.text();
  if (body.length > 128_000) return json({ error: 'size' }, 413);
  const path = new URL(req.url).pathname;

  if (path === '/api/licence-payos') {
    const settings = payosSettings();
    if (!settings) return json({ error: 'offline' }, 503);
    let hook: unknown;
    try {
      hook = JSON.parse(body);
    } catch {
      return json({ error: 'body' }, 400);
    }
    const outcome = await applyPayosWebhook(hub(), hook, settings);
    return outcome === 'invalid' ? json({ error: 'signature' }, 400) : json({ success: true });
  }

  const settings = stripeSettings();
  if (!settings) return json({ error: 'offline' }, 503);
  if (!authenticStripeEvent(body, req.headers.get('stripe-signature') ?? '', settings.webhookKey)) return json({ error: 'signature' }, 400);
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'body' }, 400);
  }
  const outcome = await applyStripeEvent(hub(), event, settings);
  return outcome === 'retry' ? json({ error: 'retry' }, 503) : json({ ok: true });
};

export const config = { path: ['/api/licence-stripe', '/api/licence-payos'] };
