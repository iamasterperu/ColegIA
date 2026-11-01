// Service worker mínimo: permite instalar ColegIA como app. No guarda datos ni respuestas de la API
// (todo es en vivo y privado); si no hay internet, muestra un aviso en vez de la pantalla de error.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ColegIA</title><body style="font-family:system-ui;text-align:center;padding:48px 24px;color:#1b2333"><h1 style="color:#1e3a8a">Sin internet</h1><p>ColegIA necesita conexión. Revisa tu internet y vuelve a abrir la app.</p>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
