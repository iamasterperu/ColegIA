// Entrada alternativa: el Worker sirve también la app web (ver scripts/empaquetar-estaticos.mjs).
import app from './index.js';
import { ARCHIVOS, CABECERAS } from './estaticos.generado.js';

const servir = (ruta) => {
  const a = ARCHIVOS[ruta] || ARCHIVOS['/index.html']; // rutas de la app (SPA) devuelven index.html
  const cuerpo = a.b64 ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : a.texto;
  return new Response(cuerpo, {
    headers: { 'content-type': a.tipo, 'cache-control': ruta.endsWith('.html') || !ARCHIVOS[ruta] ? 'no-cache' : 'public, max-age=300', ...CABECERAS },
  });
};

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (/^\/(api|webhook|d|c|carta)\//.test(pathname)) return app.fetch(request, env, ctx);
    // La portada es la página pública de ColegIA; la app (inicio de sesión) vive en /entrar
    return servir(pathname === '/' ? '/colegia.html' : pathname === '/entrar' ? '/index.html' : pathname === '/panel-iamaster' ? '/dueno.html' : pathname);
  },
  scheduled: app.scheduled,
};
