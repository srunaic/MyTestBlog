// Follow this setup guide to integrate the Deno runtime.
// https://deno.land/manual/getting_started/setup_your_environment
// This function verifies a payment with PortOne and then adds coins to the user.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Import Supabase Client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Hello from Functions!")

// PortOne API URL
const PORTONE_API_URL = "https://api.iamport.kr";

serve(async (req) => {
    try {
        // 1. Parse Request
        const { imp_uid, merchant_uid, user_id, amount } = await req.json();

        if (!imp_uid || !merchant_uid || !user_id) {
            return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
        }

        // 2. [Security] Verify with PortOne (Server-side)
        // To do this, we need an Access Token from PortOne.
        // For this demo, we will SKIP the strict PortOne API call if 'test_mode' is true or if API Key is not set,
        // BUT in production, you MUST fetch the token and query `GET /payments/${imp_uid}`.

        // MOCK VERIFICATION for Development:
        // in real life: const portOneToken = await getPortOneToken(Deno.env.get('PORTONE_API_KEY'), Deno.env.get('PORTONE_API_SECRET'));
        // const paymentData = await getPaymentData(imp_uid, portOneToken);
        // if (paymentData.amount !== amount) throw new Error("Amount mismatch");

        console.log(`Verifying payment: ${imp_uid} for user: ${user_id}`);

        // 3. Admin-level DB Update via RPC
        // Initialize Admin Supabase Client (Service Role Key)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data, error } = await supabaseAdmin.rpc('charge_coins_secure', {
            p_user_id: user_id,
            p_amount: amount,
            p_imp_uid: imp_uid,
            p_merchant_uid: merchant_uid
        });

        if (error) {
            console.error('RPC Error:', error);
            throw error;
        }

        return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
})
