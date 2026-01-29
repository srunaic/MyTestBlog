// Supabase Edge Function: sitemap
// Generates a dynamic sitemap.xml by querying the posts table.
//
// Required secrets:
// - SUPABASE_URL (built-in) or PROJECT_URL
// - SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy sitemap --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Configure your site's base URL here
const SITE_BASE_URL = "https://srunaic.github.io/MyTestBlog";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL") ?? "";
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return new Response("Missing SUPABASE_URL or SERVICE_ROLE_KEY", {
                status: 500,
                headers: corsHeaders,
            });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Query published posts
        const { data: posts, error } = await supabase
            .from("posts")
            .select("id, title, updated_at, created_at")
            .order("updated_at", { ascending: false });

        if (error) {
            console.error("Supabase query error:", error);
            return new Response(`Database error: ${error.message}`, {
                status: 500,
                headers: corsHeaders,
            });
        }

        // Build XML sitemap
        const today = new Date().toISOString().split("T")[0];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${SITE_BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <!-- Community Hub -->
  <url>
    <loc>${SITE_BASE_URL}/anticode.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
`;

        // Add each post
        if (posts && posts.length > 0) {
            for (const post of posts) {
                const lastmod = post.updated_at
                    ? new Date(post.updated_at).toISOString().split("T")[0]
                    : post.created_at
                        ? new Date(post.created_at).toISOString().split("T")[0]
                        : today;

                // Escape XML special characters in title (used for comment)
                const safeTitle = String(post.title || "Untitled")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");

                xml += `  <!-- ${safeTitle} -->
  <url>
    <loc>${SITE_BASE_URL}/?post=${post.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
            }
        }

        xml += `</urlset>`;

        return new Response(xml, {
            status: 200,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=3600", // Cache for 1 hour
            },
        });
    } catch (e) {
        console.error("Sitemap generation error:", e);
        return new Response(`Error: ${e?.message || e}`, {
            status: 500,
            headers: corsHeaders,
        });
    }
});
