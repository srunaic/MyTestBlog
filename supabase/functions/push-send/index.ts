// Supabase Edge Function: push-send
// Sends Web Push notifications to stored subscriptions.
//
// Required secrets (Supabase Functions -> Secrets):
// NOTE: Secret names cannot start with "SUPABASE_" in the dashboard UI.
// Use these names instead:
// - PROJECT_URL (or rely on built-in SUPABASE_URL if present)
// - SERVICE_ROLE_KEY
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT (e.g. "mailto:you@example.com")
//
// Tables:
// - public.anticode_push_subscriptions (see ../sql/anticode_push_subscriptions.sql)
// - public.anticode_channel_members (optional but recommended; used to target channel members)
// - public.anticode_channels (optional; used to include owner_id)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushReq = {
  kind: "chat" | string;
  channel_id?: string;
  from_username?: string;
  title?: string;
  body?: string;
  url?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Prefer built-in env if available, otherwise fall back to custom secret names
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response("Missing PROJECT_URL/SUPABASE_URL or SERVICE_ROLE_KEY", { status: 500, headers: corsHeaders });
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response("Missing VAPID keys", { status: 500, headers: corsHeaders });
    }

    const payload: PushReq = await req.json();
    const title = payload.title ?? "Nanodoroshi / Anticode";
    const body = payload.body ?? "새 알림이 있습니다.";
    const url = payload.url ?? "/anticode.html";
    const channelId = payload.channel_id ?? null;
    const from = payload.from_username ?? null;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Determine allowed recipients for a channel (optional; best-effort)
    let allowedUsernames: string[] | null = null;
    if (channelId) {
      try {
        const membersRes = await supabase
          .from("anticode_channel_members")
          .select("username")
          .eq("channel_id", channelId);
        if (!membersRes.error) {
          const names = (membersRes.data ?? []).map((r: any) => String(r.username)).filter(Boolean);
          allowedUsernames = Array.from(new Set(names));
        }
      } catch (_) {
        // ignore
      }
      try {
        const chRes = await supabase
          .from("anticode_channels")
          .select("owner_id")
          .eq("id", channelId)
          .maybeSingle();
        if (!chRes.error && chRes.data?.owner_id) {
          const owner = String(chRes.data.owner_id);
          allowedUsernames = Array.from(new Set([...(allowedUsernames ?? []), owner]));
        }
      } catch (_) {
        // ignore
      }
    }

    // Fetch subscriptions
    let q = supabase
      .from("anticode_push_subscriptions")
      .select("username, endpoint, p256dh, auth")
      .eq("enabled", true);
    if (from) q = q.neq("username", from);
    if (allowedUsernames && allowedUsernames.length > 0) q = q.in("username", allowedUsernames);

    const subsRes = await q;
    if (subsRes.error) {
      return new Response(`Subscription query failed: ${subsRes.error.message}`, { status: 500, headers: corsHeaders });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const results = await Promise.allSettled(
      (subsRes.data ?? []).map((s: any) =>
        webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify({
            title,
            body,
            url,
            tag: payload.kind === "chat" ? `anticode_chat_${channelId ?? ""}` : "nano_push",
          }),
        )
      ),
    );

    let ok = 0;
    let fail = 0;
    for (const r of results) (r.status === "fulfilled") ? ok++ : fail++;

    return new Response(JSON.stringify({ ok, fail, targeted: subsRes.data?.length ?? 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


