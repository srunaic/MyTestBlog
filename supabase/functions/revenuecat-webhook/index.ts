// Supabase Edge Function: RevenueCat webhook -> app_entitlements upsert
//
// RevenueCat docs: webhooks can be configured with a static Authorization header value.
// We verify that header for every request.
//
// Required secrets:
// - PROJECT_URL
// - SERVICE_ROLE_KEY
// - REVENUECAT_WEBHOOK_AUTH   (the exact value you set in RevenueCat dashboard)
//
// Deploy:
//   supabase functions deploy revenuecat-webhook --project-ref <ref>
//
// Then set secrets:
//   supabase secrets set --project-ref <ref> PROJECT_URL=... SERVICE_ROLE_KEY=... REVENUECAT_WEBHOOK_AUTH="Bearer ..."(or any string)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: 0, error: "method_not_allowed" }, 405);

  const expectedAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") || "";
  if (!expectedAuth) return json({ ok: 0, error: "missing_REVENUECAT_WEBHOOK_AUTH" }, 500);

  const gotAuth = req.headers.get("Authorization") || "";
  if (gotAuth !== expectedAuth) return json({ ok: 0, error: "unauthorized" }, 401);

  const PROJECT_URL = Deno.env.get("PROJECT_URL") || "";
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
  if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ ok: 0, error: "missing_supabase_secrets" }, 500);

  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: 0, error: "invalid_json" }, 400);
  }

  const event = payload?.event || {};
  const eventId = String(event?.id || "");
  const appUserId = String(event?.app_user_id || "");
  const type = String(event?.type || "");
  const entitlementIds: string[] = Array.isArray(event?.entitlement_ids) ? event.entitlement_ids : [];
  const expirationAtMs = typeof event?.expiration_at_ms === "number" ? event.expiration_at_ms : null;

  // Idempotency log (best-effort)
  if (eventId) {
    await supabase.from("revenuecat_events").upsert(
      {
        event_id: eventId,
        user_id: appUserId || null,
        type: type || null,
        raw: payload,
      },
      { onConflict: "event_id" },
    );
  }

  // Minimal entitlement sync strategy:
  // If 'pro' is present in entitlement_ids, set pro active until expiration (if provided).
  // If pro is NOT present, mark pro inactive.
  //
  // (More robust but heavier approach: call RevenueCat REST API GET /subscribers after webhook.)
  const hasPro = entitlementIds.includes("pro");
  const endsAt = expirationAtMs ? new Date(expirationAtMs).toISOString() : null;

  if (!appUserId) return json({ ok: 0, error: "missing_app_user_id" }, 200);

  const { error: upsertErr } = await supabase.from("app_entitlements").upsert(
    {
      user_id: appUserId,
      entitlement: "pro",
      is_active: hasPro,
      period_ends_at: endsAt,
      source: "revenuecat",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entitlement" },
  );

  if (upsertErr) return json({ ok: 0, error: "db_upsert_failed", detail: upsertErr.message }, 500);

  return json({
    ok: 1,
    eventId,
    appUserId,
    type,
    pro: { active: hasPro, period_ends_at: endsAt },
  });
});



