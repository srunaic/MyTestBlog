// Supabase Edge Function: Verify Google Play subscription purchase token (server-side)
//
// Flow:
// App (after purchase/restore) sends purchaseToken + productId + packageName + userId
// -> This function calls Android Publisher API to verify and reads expiryTimeMillis
// -> Upserts public.app_entitlements (entitlement='pro')
// -> Logs token hash in public.play_purchase_tokens
//
// Required secrets:
// - PROJECT_URL
// - SERVICE_ROLE_KEY
// - PLAY_SERVICE_ACCOUNT_JSON  (full service account JSON as one line)
//
// Optional (recommended) secret:
// - PLAY_VERIFY_AUTH  (static string; client sends as Authorization header)
//
// Deploy:
//   supabase functions deploy play-verify-subscription --project-ref <ref>
// Secrets:
//   supabase secrets set --project-ref <ref> PROJECT_URL=... SERVICE_ROLE_KEY=... PLAY_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
//   supabase secrets set --project-ref <ref> PLAY_VERIFY_AUTH="Bearer <random>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.2.4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const textEncoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const scope = "https://www.googleapis.com/auth/androidpublisher";

  const pk = await importPKCS8(String(serviceAccount.private_key), "RS256");
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(String(serviceAccount.client_email))
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(pk);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`oauth_token_failed:${res.status}`);
  const j = await res.json();
  const token = String(j.access_token || "");
  if (!token) throw new Error("oauth_missing_access_token");
  return token;
}

async function verifySubscription({
  accessToken,
  packageName,
  productId,
  purchaseToken,
}: {
  accessToken: string;
  packageName: string;
  productId: string;
  purchaseToken: string;
}): Promise<any> {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const bodyText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {
    parsed = { _raw: bodyText };
  }
  if (!res.ok) {
    const msg = parsed?.error?.message || bodyText || `status:${res.status}`;
    throw new Error(`verify_failed:${res.status}:${msg}`);
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: 0, error: "method_not_allowed" }, 405);

  // Optional auth guard (recommended to avoid open quota abuse)
  const expectedAuth = Deno.env.get("PLAY_VERIFY_AUTH") || "";
  if (expectedAuth) {
    const gotAuth = req.headers.get("Authorization") || "";
    if (gotAuth !== expectedAuth) return json({ ok: 0, error: "unauthorized" }, 401);
  }

  const PROJECT_URL = Deno.env.get("PROJECT_URL") || "";
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
  const SA_JSON = Deno.env.get("PLAY_SERVICE_ACCOUNT_JSON") || "";
  if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ ok: 0, error: "missing_supabase_secrets" }, 500);
  if (!SA_JSON) return json({ ok: 0, error: "missing_PLAY_SERVICE_ACCOUNT_JSON" }, 500);

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(SA_JSON);
  } catch {
    return json({ ok: 0, error: "invalid_PLAY_SERVICE_ACCOUNT_JSON" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: 0, error: "invalid_json" }, 400);
  }

  const userId = String(body?.userId || body?.user_id || "");
  const packageName = String(body?.packageName || body?.package_name || "");
  const productId = String(body?.productId || body?.product_id || "");
  const purchaseToken = String(body?.purchaseToken || body?.purchase_token || "");

  if (!userId || !packageName || !productId || !purchaseToken) {
    return json({ ok: 0, error: "missing_fields", need: ["userId", "packageName", "productId", "purchaseToken"] }, 400);
  }

  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const verified = await verifySubscription({ accessToken, packageName, productId, purchaseToken });

    const expiryMsRaw = verified?.expiryTimeMillis ?? verified?.expiryTimeMillis?.toString?.();
    const expiryMs = Number(expiryMsRaw);
    const expiresAt = Number.isFinite(expiryMs) && expiryMs > 0 ? new Date(expiryMs).toISOString() : null;
    const active = !!expiresAt && new Date(expiresAt).getTime() > Date.now();

    // Upsert entitlement
    const { error: entErr } = await supabase.from("app_entitlements").upsert(
      {
        user_id: userId,
        entitlement: "pro",
        is_active: active,
        period_ends_at: expiresAt,
        source: "play",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entitlement" },
    );
    if (entErr) throw new Error(`entitlement_upsert_failed:${entErr.message}`);

    // Log token hash (avoid storing raw token)
    const tokenHash = await sha256Hex(purchaseToken);
    await supabase.from("play_purchase_tokens").upsert(
      {
        user_id: userId,
        package_name: packageName,
        product_id: productId,
        token_hash: tokenHash,
        last_verified_at: new Date().toISOString(),
        expires_at: expiresAt,
        raw: verified,
      },
      { onConflict: "package_name,product_id,token_hash" },
    );

    return json({
      ok: 1,
      userId,
      entitlement: "pro",
      active,
      period_ends_at: expiresAt,
    });
  } catch (e) {
    return json({ ok: 0, error: String((e as any)?.message || e) }, 400);
  }
});





