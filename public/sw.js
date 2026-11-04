// Service worker de ColegIA: permite instalar la app, avisa de mensajes nuevos (push) y, si no hay
// internet, muestra un aviso en vez de la pantalla de error. No guarda datos ni respuestas de la API.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ColegIA</title><body style="font-family:system-ui;text-align:center;padding:48px 24px;color:#1b2333"><h1 style="color:#00a884">Sin internet</h1><p>ColegIA necesita conexión. Revisa tu internet y vuelve a abrir la app.</p>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});

// El aviso llega sin contenido: el texto se pide con la sesión de esta persona
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let d = { titulo: 'ColegIA', cuerpo: 'Tienes un mensaje nuevo', n: 1 };
    try { const r = await fetch('/api/chat/ultimo', { credentials: 'same-origin' }); if (r.ok) d = await r.json(); } catch { /* sin conexión: aviso genérico */ }
    try { await self.navigator.setAppBadge?.(d.n || 1); } catch { /* sin soporte */ }
    await self.registration.showNotification(d.titulo, {
      body: d.cuerpo, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'colegia-chat', renotify: true, vibrate: [200, 100, 200], silent: false, requireInteraction: false, data: { url: '/entrar#/chat' },
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || '/entrar#/chat';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const una = abiertas.find((c) => c.url.includes('/entrar'));
    if (una) { await una.focus(); una.navigate?.(destino).catch(() => {}); return; }
    await self.clients.openWindow(destino);
  })());
});

// Si el celular renueva su suscripción, se vuelve a vincular con la sesión abierta
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const { clave } = await (await fetch('/api/push/clave', { credentials: 'same-origin' })).json();
      const b = Uint8Array.from(atob(clave.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b });
      await fetch('/api/push/suscribir', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-colegia': '1' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    } catch { /* sin sesión: se vincula al abrir la app */ }
  })());
});
