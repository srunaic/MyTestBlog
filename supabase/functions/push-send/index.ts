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

    const targets = (subsRes.data ?? []).map((s: any) => ({
      username: String(s.username),
      endpoint: String(s.endpoint),
      p256dh: String(s.p256dh),
      auth: String(s.auth),
    }));

    const results = await Promise.allSettled(
      targets.map((t) =>
        webpush.sendNotification(
          {
            endpoint: t.endpoint,
            keys: { p256dh: t.p256dh, auth: t.auth },
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
    let disabled = 0;
    const failByStatus: Record<string, number> = {};
    let sampleFail: { statusCode?: number; message?: string; body?: string } | null = null;
    const disableEndpoints: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        ok++;
        continue;
      }
      fail++;
      const reason: any = (r as any).reason;
      const statusCode = Number(reason?.statusCode ?? reason?.status ?? 0);
      const statusKey = String(statusCode || "unknown");
      failByStatus[statusKey] = (failByStatus[statusKey] ?? 0) + 1;

      // Log detailed failure on the server for debugging (does not expose keys)
      try {
        const host = (() => {
          try { return new URL(targets[i]?.endpoint || "").hostname; } catch (_) { return "unknown"; }
        })();
        console.error("[push-send] failed", {
          statusCode,
          host,
          username: targets[i]?.username,
          message: String(reason?.message ?? ""),
          body: typeof reason?.body === "string" ? reason.body.slice(0, 400) : undefined,
        });
      } catch (_) { }

      if (!sampleFail) {
        sampleFail = {
          statusCode: statusCode || undefined,
          message: reason?.message ? String(reason.message).slice(0, 240) : undefined,
          body: typeof reason?.body === "string" ? reason.body.slice(0, 240) : undefined,
        };
      }
      // 404/410 typically means the subscription is gone; disable it automatically
      if (statusCode === 404 || statusCode === 410) {
        disableEndpoints.push(targets[i]?.endpoint);
      }
    }

    if (disableEndpoints.length > 0) {
      try {
        const upd = await supabase
          .from("anticode_push_subscriptions")
          .update({ enabled: false })
          .in("endpoint", disableEndpoints);
        if (!upd.error) disabled = disableEndpoints.length;
      } catch (_) {
        // ignore
      }
    }

    return new Response(JSON.stringify({
      ok,
      fail,
      targeted: subsRes.data?.length ?? 0,
      disabled,
      failByStatus,
      sampleFail,
    }), {
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


