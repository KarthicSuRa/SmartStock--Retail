// /src/service-worker.ts
// PWA Service Worker with Workbox BackgroundSync & Push Notifications

import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { Queue } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// ==================== BACKGROUND SYNC QUEUES ====================
export const damageLogQueue = new Queue('damage-log-queue', {
  maxRetentionTime: 24 * 60, // 24 hours retention
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
        console.log('[BackgroundSync] Damage log synced:', entry.request.url);
      } catch (error) {
        console.error('[BackgroundSync] Damage log sync failed, requeuing:', error);
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  }
});

export const stockCountQueue = new Queue('stock-count-queue', {
  maxRetentionTime: 24 * 60,
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
      } catch (error) {
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  }
});

export const poApprovalQueue = new Queue('po-approval-queue', {
  maxRetentionTime: 72 * 60, // 3 days for approvals
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
      } catch (error) {
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  }
});

// ==================== ROUTE REGISTRATION ====================
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      {
        fetchDidFail: async ({ originalRequest }) => {
          if (originalRequest.method === 'POST' || originalRequest.method === 'PUT') {
            const url = originalRequest.url;
            if (url.includes('/damage')) await damageLogQueue.pushRequest({ request: originalRequest });
            if (url.includes('/count')) await stockCountQueue.pushRequest({ request: originalRequest });
            if (url.includes('/approve')) await poApprovalQueue.pushRequest({ request: originalRequest });
          }
        }
      }
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'static-assets' })
);

// ==================== SYNC EVENT LISTENERS ====================
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-damage-logs') {
    event.waitUntil(damageLogQueue.replayRequests());
  }
  if (event.tag === 'sync-stock-counts') {
    event.waitUntil(stockCountQueue.replayRequests());
  }
  if (event.tag === 'sync-po-approvals') {
    event.waitUntil(poApprovalQueue.replayRequests());
  }
});

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event: any) => {
  const data = event.data?.json() || {};
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Stock Alert', {
      body: data.body || 'An item requires attention',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.alert_id || 'stock-alert',
      requireInteraction: data.severity === 'critical',
      actions: [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        url: data.deep_link || '/dashboard/alerts'
      }
    })
  );
});

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(self.clients.openWindow(event.notification.data.url));
  }
});
