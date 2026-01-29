# Supabase Sitemap Edge Function

This function generates a dynamic `sitemap.xml` by querying the `posts` table in Supabase.

## Deployment

### Prerequisites
1. Supabase CLI installed: `npm install -g supabase`
2. Logged in: `supabase login`
3. Linked to project: `supabase link --project-ref YOUR_PROJECT_REF`

### Deploy Command
```bash
supabase functions deploy sitemap --no-verify-jwt
```

The `--no-verify-jwt` flag is required because search engine bots cannot authenticate.

### Required Secrets
The function uses built-in environment variables:
- `SUPABASE_URL` (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)

If these are not available, set custom secrets:
```bash
supabase secrets set PROJECT_URL=https://xxx.supabase.co
supabase secrets set SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Usage

### Direct Access
```
GET https://[PROJECT-REF].supabase.co/functions/v1/sitemap
```

### Google Search Console
Submit the above URL as your sitemap in Google Search Console.

### Response
Returns XML with `Content-Type: application/xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://srunaic.github.io/MyTestBlog/</loc>
    <lastmod>2026-01-29</lastmod>
    <priority>1.0</priority>
  </url>
  <!-- ... posts ... -->
</urlset>
```

## Caching
The response includes `Cache-Control: public, max-age=3600` (1 hour cache).
