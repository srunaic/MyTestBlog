// [DEPLOYMENT] Cloudflare Pages Sync - 2026-01-03 10:58
const CACHE_NAME = 'nanodoroshi-v2.0'; // [PERFORMANCE] Increment version
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/worker.js', // [MULTI-THREAD] Add worker to cache
    '/anticode.html',
    '/anticode.css',
    '/anticode.js',
    '/icon-192x192-maskable.png',
    '/manifest-v3.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];
// Message listener for PWABuilder compatibility
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

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

// Fetch Event: [PERFORMANCE] Stale-While-Revalidate Strategy
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // Skip Supabase Realtime/Auth (Always network)
    if (url.hostname.includes('supabase.co')) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(response => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => null);

                // Return cached response immediately if available, else wait for network
                return response || fetchPromise;
            });
        })
    );
});

// Push Notifications (Web Push)
self.addEventListener('push', (event) => {
    const fallback = { title: 'Nanodoroshi / Anticode', body: '새 알림이 있습니다.', url: '/anticode.html' };
    let payload = fallback;
    try {
        if (event.data) payload = event.data.json();
    } catch (_) {
        try { payload = { ...fallback, body: event.data.text() }; } catch (_) { payload = fallback; }
    }
    const title = payload.title || fallback.title;
    const options = {
        body: payload.body || fallback.body,
        icon: payload.icon || undefined,
        badge: payload.badge || undefined,
        tag: payload.tag || 'nano_push',
        renotify: false,
        data: { url: payload.url || fallback.url }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus/open the app
self.addEventListener('notificationclick', (event) => {
    try { event.notification.close(); } catch (_) { }
    event.waitUntil((async () => {
        const url = event.notification?.data?.url || '/anticode.html';
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of allClients) {
            if ('focus' in client) {
                await client.focus();
                return;
            }
        }
        if (self.clients.openWindow) {
            await self.clients.openWindow(url);
        }
    })());
});