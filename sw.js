// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:58
const CACHE_NAME = 'nanodoroshi-v1.6'; // Increment version to force refresh
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

// Fetch Event: Network-First Strategy
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and Supabase Realtime/Storage if necessary (usually they are POST/WebSocket)
    if (event.request.method !== 'GET') return;

    // Network-First for everything to ensure updates are caught
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Update cache with fresh version if it's a successful response
                if (response && response.status === 200) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request);
            })
    );
});

// Notification click: focus/open the app
self.addEventListener('notificationclick', (event) => {
    try { event.notification.close(); } catch (_) { }
    event.waitUntil((async () => {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of allClients) {
            if ('focus' in client) {
                await client.focus();
                return;
            }
        }
        if (self.clients.openWindow) {
            await self.clients.openWindow('/anticode.html');
        }
    })());
});