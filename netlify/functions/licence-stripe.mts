import { hub, json } from '../lib/hub.mts';
import { authenticStripeEvent, recordStripeEvent, stripeTestSettings } from '../lib/licence-purchase.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const settings = stripeTestSettings();
  if (!settings) return json({ error: 'offline' }, 503);
  const body = await req.text();
  if (body.length > 128_000 || !authenticStripeEvent(body, req.headers.get('stripe-signature') ?? '', settings.webhookKey)) {
    return json({ error: 'signature' }, 400);
  }
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'body' }, 400);
  }
  const outcome = await recordStripeEvent(hub(), event);
  return outcome === 'retry' ? json({ error: 'retry' }, 503) : json({ ok: true });
};

export const config = { path: '/api/licence-stripe' };
