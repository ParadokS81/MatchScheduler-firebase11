// Minimal service worker for PWA standalone mode
// Satisfies Chrome's requirement for installable PWA

// Take control immediately on install (don't wait for page reload)
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Claim all clients immediately so beforeinstallprompt can fire
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Pass through all requests to network (no caching)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
