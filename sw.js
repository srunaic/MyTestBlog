const CACHE_NAME = 'nanodoroshi-v1.3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './anticode.html',
    './anticode.css',
    './anticode.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

// Install Event: Cache critical assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
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
});

// Fetch Event: Serve from cache if possible, otherwise network
self.addEventListener('fetch', event => {
    // Skip non-GET requests and external chrome extensions
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(networkResponse => {
                // Optional: Cache new assets on the fly
                return networkResponse;
            }).catch(err => {
                // If the network fails and there's no cache, 
                // we just let it fail naturally or return an offline fallback if we had one.
                // WE MUST NOT RETURN NULL HERE.
                console.error('[SW] Fetch failed:', event.request.url, err);
                throw err;
            });
        })
    );
});
