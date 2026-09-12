/* ==========================================================================
   SPENDMINDAI - SERVICE WORKER (PWA & Offline Resilience)
   ========================================================================== */

const CACHE_NAME = 'spendmind-v3.5';
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
    '/js/register.js',
    '/js/cookie-consent.js',
    '/js/pwa-install.js',
    '/js/app-notification.js',
    '/js/index.js',
    '/images/logoapp.png',
    '/images/logoapp-192.png',
    '/images/logoapp-512.png',
    '/images/logoapp.webp',
    '/favicon.ico',
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

/* ==========================================================================
   PUSH NOTIFICATIONS & IN-APP DEVICE REMINDER CLICK HANDLERS
   ========================================================================== */

// 1. Handle notification clicks (lock screen / notification drawer)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.action;
    if (action === 'dismiss') return;

    const targetUrl = (event.notification.data && event.notification.data.url) 
        ? event.notification.data.url 
        : '/dashboard.html?action=add_transaction';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/dashboard.html') && 'focus' in client) {
                    if ('navigate' in client) {
                        client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// 2. Handle inter-process messages from frontend client
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SHOW_NOTIFICATION') {
        const title = event.data.title || 'SpendMindAI - Nhắc nhở chi tiêu';
        const options = event.data.options || {};
        self.registration.showNotification(title, options);
    } else if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 3. Handle Web Push events (if push backend is connected)
self.addEventListener('push', (event) => {
    let payload = {
        title: 'SpendMindAI - Nhắc nhở chi tiêu',
        body: 'Đừng quên ghi chép chi tiêu hôm nay để kiểm soát tài chính tốt nhất!',
        icon: '/images/logoapp-192.png',
        badge: '/images/logoapp-192.png',
        tag: 'spendmind-daily-reminder',
        data: { url: '/dashboard.html?action=add_transaction' }
    };

    if (event.data) {
        try {
            payload = Object.assign(payload, event.data.json());
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon || '/images/logoapp-192.png',
            badge: payload.badge || '/images/logoapp-192.png',
            tag: payload.tag || 'spendmind-daily-reminder',
            renotify: true,
            vibrate: [200, 100, 200],
            data: payload.data || { url: '/dashboard.html?action=add_transaction' },
            actions: [
                { action: 'open', title: 'Ghi chép ngay' },
                { action: 'dismiss', title: 'Để sau' }
            ]
        })
    );
});

