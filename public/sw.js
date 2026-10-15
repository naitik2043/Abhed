/* Abhed approver: receives push when an AI agent's high-risk action needs a person. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Abhed', body: event.data ? event.data.text() : 'An approval is waiting' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Approval needed', {
      body: data.body || 'An AI agent is waiting for a person.',
      tag: data.tag || 'abhed',
      renotify: true,
      requireInteraction: true,
      vibrate: [220, 90, 220, 90, 320],
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/approver' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/approver';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
