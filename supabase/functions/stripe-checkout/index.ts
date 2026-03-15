import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://autostack.app';

const VALID_PRICE_IDS = new Set(
  [
    Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_PRO_YEARLY'),
    Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_TEAM_YEARLY'),
  ].filter(Boolean)
);

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const orgId = user.user_metadata?.org_id
    if (!orgId) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Org context missing' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        price_id: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { price_id } = body

    if (!VALID_PRICE_IDS.has(price_id)) {
      return new Response(JSON.stringify({ error: 'Invalid price_id' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get or create Stripe customer
    let { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, trial_ends_at')
      .eq('org_id', orgId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripePost('/v1/customers', {
        email: user.email!,
        metadata: { org_id: orgId },
      });
      customerId = customer.id;

      await supabaseAdmin.from('subscriptions').upsert(
        { org_id: orgId, stripe_customer_id: customerId },
        { onConflict: 'org_id' }
      );
    }

    const hasHadTrial = !!sub?.trial_ends_at;

    const sessionParams: Record<string, string> = {
      'mode': 'subscription',
      'customer': customerId,
      'line_items[0][price]': price_id,
      'line_items[0][quantity]': '1',
      'success_url': `${APP_URL}/dashboard?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${APP_URL}/dashboard?tab=settings`,
      'allow_promotion_codes': 'true',
    };

    if (!hasHadTrial) {
      sessionParams['subscription_data[trial_period_days]'] = '14';
    }

    const session = await stripePost('/v1/checkout/sessions', sessionParams);

    return new Response(JSON.stringify({ checkout_url: session.url }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    console.error('[stripe-checkout] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

async function stripePost(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return res.json();
}
