// Cloudflare Pages Function: /sitemap.xml
// This intercepts requests to /sitemap.xml and generates dynamic content from Supabase.
//
// Required environment variables (set in Cloudflare Pages dashboard):
// - SUPABASE_URL: https://xxx.supabase.co
// - SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIs...
// - SITE_URL: https://mytestblog-d85.pages.dev

import { createClient } from '@supabase/supabase-js';

interface Env {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SITE_URL: string;
}

interface Post {
    id: number;
    title?: string;
    updated_at?: string;
    created_at?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, title, updated_at, created_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            return new Response('Sitemap generation error', { status: 500 });
        }

        const siteUrl = env.SITE_URL || 'https://mytestblog-d85.pages.dev';
        const today = new Date().toISOString().split('T')[0];

        // Generate URLs for each post
        const postUrls = (posts || [])
            .map((post: Post) => {
                const lastmod = post.updated_at
                    ? new Date(post.updated_at).toISOString().split('T')[0]
                    : post.created_at
                        ? new Date(post.created_at).toISOString().split('T')[0]
                        : today;

                return `  <url>
    <loc>${siteUrl}/?post=${post.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
            })
            .join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <!-- Community Hub -->
  <url>
    <loc>${siteUrl}/anticode.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${postUrls}
</urlset>`;

        return new Response(xml, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600', // 1 hour cache
            },
        });
    } catch (e) {
        console.error('Sitemap error:', e);
        return new Response('Internal Server Error', { status: 500 });
    }
};
