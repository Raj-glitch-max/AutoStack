import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const PRICE_TO_PLAN: Record<string, string> = {};
const priceIds = {
  pro_monthly: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),
  pro_yearly: Deno.env.get('STRIPE_PRICE_PRO_YEARLY'),
  team_monthly: Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY'),
  team_yearly: Deno.env.get('STRIPE_PRICE_TEAM_YEARLY'),
};
if (priceIds.pro_monthly) PRICE_TO_PLAN[priceIds.pro_monthly] = 'pro';
if (priceIds.pro_yearly) PRICE_TO_PLAN[priceIds.pro_yearly] = 'pro';
if (priceIds.team_monthly) PRICE_TO_PLAN[priceIds.team_monthly] = 'team';
if (priceIds.team_yearly) PRICE_TO_PLAN[priceIds.team_yearly] = 'team';

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig || !STRIPE_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify Stripe signature
    const event = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Idempotency check (RULE K1)
    const redis = createRedisClient();
    const eventKey = `stripe:event:${event.id}`;
    const alreadyProcessed = await redis.get(eventKey);
    if (alreadyProcessed) {
      return new Response(JSON.stringify({ status: 'already_processed' }), { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await redis.set(eventKey, '1', 86400); // 24h TTL

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(supabase, event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object);
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event: ${event.type}`);
        break;
    }

    return new Response(JSON.stringify({ received: true }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[stripe-webhook] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(supabase: any, session: any) {
  const { customer, subscription: subId } = session;

  // Fetch subscription from Stripe for full details
  const sub = await stripeGet(`/v1/subscriptions/${subId}`);
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = PRICE_TO_PLAN[priceId] ?? 'pro';

  const orgId = await getOrgIdFromCustomer(supabase, customer);
  if (!orgId) {
    console.error('[stripe-webhook] No org found for customer:', customer);
    return;
  }

  await supabase.from('subscriptions').upsert(
    {
      org_id: orgId,
      stripe_customer_id: customer,
      stripe_subscription_id: subId,
      stripe_price_id: priceId,
      plan,
      status: sub.status,
      current_period_start: epochToISO(sub.current_period_start),
      current_period_end: epochToISO(sub.current_period_end),
      trial_ends_at: sub.trial_end ? epochToISO(sub.trial_end) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' }
  );

  // Update org plan
  await supabase.from('organizations').update({ plan }).eq('id', orgId);

  console.log(`[stripe-webhook] Checkout completed: org=${orgId} plan=${plan}`);
}

async function handleInvoicePaid(supabase: any, invoice: any) {
  const orgId = await getOrgIdFromCustomer(supabase, invoice.customer);
  if (!orgId) return;

  await supabase.from('invoices').upsert(
    {
      org_id: orgId,
      stripe_invoice_id: invoice.id,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      status: 'paid',
      period_start: epochToISO(invoice.period_start),
      period_end: epochToISO(invoice.period_end),
      invoice_pdf_url: invoice.invoice_pdf,
    },
    { onConflict: 'stripe_invoice_id' }
  );

  // Reset dunning state on successful payment
  await supabase
    .from('subscriptions')
    .update({ status: 'active', payment_failed_at: null, dunning_email_count: 0, updated_at: new Date().toISOString() })
    .eq('org_id', orgId);
}

async function handlePaymentFailed(supabase: any, invoice: any) {
  const orgId = await getOrgIdFromCustomer(supabase, invoice.customer);
  if (!orgId) return;

  // Start dunning (RULE K4)
  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      payment_failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId);

  console.log(`[stripe-webhook] Payment failed: org=${orgId} — entering dunning`);
}

async function handleSubscriptionUpdated(supabase: any, sub: any) {
  const orgId = await getOrgIdFromCustomer(supabase, sub.customer);
  if (!orgId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = PRICE_TO_PLAN[priceId] ?? 'free';

  await supabase.from('subscriptions').upsert(
    {
      org_id: orgId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan,
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_start: epochToISO(sub.current_period_start),
      current_period_end: epochToISO(sub.current_period_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' }
  );

  await supabase.from('organizations').update({ plan }).eq('id', orgId);
}

async function handleSubscriptionDeleted(supabase: any, sub: any) {
  const orgId = await getOrgIdFromCustomer(supabase, sub.customer);
  if (!orgId) return;

  await supabase.from('subscriptions').update({
    status: 'canceled',
    canceled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('org_id', orgId);

  await supabase.from('organizations').update({ plan: 'free' }).eq('id', orgId);

  console.log(`[stripe-webhook] Subscription canceled: org=${orgId} → free`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrgIdFromCustomer(supabase: any, customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.org_id ?? null;
}

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return res.json();
}

function epochToISO(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

async function verifyStripeSignature(body: string, sig: string, secret: string): Promise<any | null> {
  // Parse stripe-signature header
  const elements = sig.split(',');
  let timestamp = '';
  let v1Signature = '';

  for (const element of elements) {
    const [key, value] = element.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') v1Signature = value;
  }

  if (!timestamp || !v1Signature) return null;

  // Verify: HMAC-SHA256(timestamp.body, secret)
  const payload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (computed.length !== v1Signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ v1Signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  // Timestamp tolerance: reject events older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return null;

  return JSON.parse(body);
}
