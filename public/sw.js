/* Service worker: muestra las notificaciones de trabajos nuevos aunque la app esté cerrada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => e.waitUntil((async () => {
  let a = null;
  try {
    const r = await fetch('/api/avisos', { credentials: 'include', headers: { 'x-requested-with': 'copias-color' }, cache: 'no-store' });
    if (r.ok) a = (await r.json()).aviso;
  } catch { /* sin conexión */ }
  await self.registration.showNotification(a?.titulo || 'Trabajo nuevo', {
    body: a?.cuerpo || 'Llegó un pedido nuevo. Toca para verlo.',
    icon: '/icon-192.png', badge: '/icon-192.png', tag: 'trabajos', renotify: true,
    data: { url: a?.url || '/#trabajos' },
  });
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/#trabajos';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
