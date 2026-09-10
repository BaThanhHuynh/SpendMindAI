/* ==========================================================================
   SPENDMINDAI - SERVICE WORKER (PWA & Offline Resilience)
   ========================================================================== */

const CACHE_NAME = 'spendmind-v1';
const STATIC_ASSETS = [
    '/',
    '/dashboard.html',
    '/login.html',
    '/register.html',
    '/css/styles.css',
    '/css/mobile.css',
    '/js/dashboard.js',
    '/js/chatbot.js',
    '/js/login.js',
    '/images/logoapp.png',
    '/images/logoapp.webp',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('Service Worker cache.addAll failed partially:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache API calls, Google auth or CDN dynamically changing data
    if (url.pathname.startsWith('/api') || 
        url.hostname.includes('googleapis.com') || 
        url.hostname.includes('accounts.google.com') ||
        event.request.method !== 'GET') {
        return;
    }

    // Cache-First strategy for static assets, fallback to Network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache (Stale-While-Revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            });
        })
    );
});
