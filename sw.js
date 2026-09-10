/* ==========================================================================
   SPENDMINDAI - SERVICE WORKER (PWA & Offline Resilience)
   ========================================================================== */

const CACHE_NAME = 'spendmind-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/login.html',
    '/register.html',
    '/css/styles.css',
    '/css/mobile.css',
    '/js/dashboard.js',
    '/js/chatbot.js',
    '/js/login.js',
    '/js/index.js',
    '/images/logoapp.png',
    '/images/logoapp.webp',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('Service Worker cache.addAll notice:', err);
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

    // Never intercept API calls, Google OAuth, external CDNs or non-GET requests
    if (url.pathname.startsWith('/api') || 
        url.hostname.includes('googleapis.com') || 
        url.hostname.includes('accounts.google.com') ||
        event.request.method !== 'GET') {
        return;
    }

    // For HTML navigation requests, use Network-First with safe offline cache fallback
    // This prevents ERR_FAILED caused by caching redirected responses
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request).then((cached) => {
                    return cached || caches.match('/index.html') || caches.match('/');
                });
            })
        );
        return;
    }

    // Cache-First strategy for static assets (CSS, JS, Images), fallback to Network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to revalidate cache without blocking UI
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            });
        })
    );
});
