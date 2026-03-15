import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { CORS_HEADERS, jsonResponse, errorResponse } from "../_shared/cors.ts"
import Stripe from 'https://esm.sh/stripe@12.9.0?target=deno'

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) throw new Error('Missing stripe-signature header')

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );

    // Idempotency check (RULE K1)
    const redis = createRedisClient();
    const eventKey = `stripe:event:${event.id}`;
    const alreadyProcessed = await redis.get(eventKey);
    if (alreadyProcessed) {
      return jsonResponse({ status: 'already_processed' });
    }
    await redis.set(eventKey, '1', 86400); // 24h TTL

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, event.data.object);
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

    return jsonResponse({ received: true })
  } catch (err: any) {
    console.error(`[Stripe Webhook Error] ${err.message}`)
    return errorResponse(400, err.message)
  }
});

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(supabase: any, stripe: Stripe, session: any) {
  const { customer, subscription: subId } = session;

  // Fetch subscription from Stripe for full details
  const sub = await stripe.subscriptions.retrieve(subId as string);
  const priceId = (sub.items.data[0].price as any).id;
  const plan = PRICE_TO_PLAN[priceId] ?? 'pro';

  const orgId = await getOrgIdFromCustomer(supabase, customer as string);
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

function epochToISO(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}
