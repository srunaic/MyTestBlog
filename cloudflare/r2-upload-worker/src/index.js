/**
 * Cloudflare Worker: R2 upload + private serving
 *
 * Endpoints:
 * - POST /upload?folder=blog|chat
 *   Body: raw file bytes
 *   Headers:
 *     - Content-Type: file mime
 *     - X-Filename: (optional) urlencoded original filename
 *   Response: { ok: 1, key, url }
 *
 * - GET /file/<key...>
 *   Streams file from R2 (private bucket OK)
 */

function corsHeadersFor(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").trim();

  // If not set, allow all (easy start). For production, set ALLOWED_ORIGINS.
  if (!allowed) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
      "Access-Control-Allow-Headers": "Content-Type,X-Filename",
    };
  }

  const allowList = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = allowList.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowList[0] || "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "Content-Type,X-Filename",
  };
}

function isOriginAllowed(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").trim();
  if (!allowed) return true; // dev/easy start
  const origin = request.headers.get("Origin") || "";
  if (!origin) return false;
  const allowList = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowList.includes(origin);
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function sanitizeFilename(name) {
  const base = String(name || "file").split(/[\\/]/).pop() || "file";
  // keep simple safe charset
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "file";
}

function randomId() {
  // short random id (not cryptographic, but fine for naming)
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname || "/";

    const cors = corsHeadersFor(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Serve file from private R2
    if (request.method === "GET" || request.method === "HEAD") {
      if (path.startsWith("/file/")) {
        const key = path.slice("/file/".length);
        if (!key) return new Response("Missing key", { status: 400, headers: cors });

        const obj = await env.R2.get(key);
        if (!obj) return new Response("Not found", { status: 404, headers: cors });

        const headers = new Headers(cors);
        const ct = obj.httpMetadata?.contentType || "application/octet-stream";
        headers.set("Content-Type", ct);
        // Since key includes random+timestamp, it is effectively immutable.
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        if (request.method === "HEAD") return new Response(null, { status: 200, headers });
        return new Response(obj.body, { status: 200, headers });
      }
    }

    // Upload file bytes to R2
    if (request.method === "POST" && path === "/upload") {
      // IMPORTANT: CORS is not authentication, but we still hard-block browser origins not on the allowlist.
      if (!isOriginAllowed(request, env)) {
        return json({ ok: 0, error: "origin_not_allowed" }, 403, cors);
      }

      const folder = (url.searchParams.get("folder") || "uploads").replace(/[^A-Za-z0-9._-]/g, "_");
      const maxBytes = Number(env.MAX_UPLOAD_BYTES || 10485760); // 10MB default

      const filenameHeader = request.headers.get("X-Filename") || "";
      let original = "";
      try { original = decodeURIComponent(filenameHeader); } catch (_) { original = filenameHeader; }
      const safeName = sanitizeFilename(original || "upload.bin");

      const contentType = request.headers.get("Content-Type") || "application/octet-stream";
      const buf = await request.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        return json({ ok: 0, error: "file_too_large", maxBytes }, 413, cors);
      }

      const d = new Date();
      const yyyy = String(d.getUTCFullYear());
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");

      const key = `${folder}/${yyyy}/${mm}/${dd}/${Date.now()}_${randomId()}_${safeName}`;

      await env.R2.put(key, buf, {
        httpMetadata: { contentType },
      });

      const origin = `${url.protocol}//${url.host}`;
      const fileUrl = `${origin}/file/${key}`;

      return json({ ok: 1, key, url: fileUrl }, 200, cors);
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};


