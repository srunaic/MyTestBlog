// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:58
const CACHE_NAME = 'nanodoroshi-v1.4'; // Increment version to force refresh
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/anticode.html',
    '/anticode.css',
    '/anticode.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

// Install Event: Cache critical assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Mixed Strategy
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('.html');

    // 1. Network-First for HTML/Navigation to avoid redirect/404 issues
    if (isHTML) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Update cache with fresh version
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 2. Cache-First for other static assets
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(response => {
                // If it's a redirect, we can't safely cache and return it to respondWith in some cases
                // but for non-nav requests it's usually okay.
                // However, we check for redirected status to be safe.
                if (response.redirected && event.request.redirect !== 'follow') {
                    // Return the response as is, browser will handle or error
                }
                return response;
            });
        })
    );
});
