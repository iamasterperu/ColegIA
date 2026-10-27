// Entrada alternativa: el Worker sirve también la app web (ver scripts/empaquetar-estaticos.mjs).
import app from './index.js';
import { ARCHIVOS, CABECERAS } from './estaticos.generado.js';

const servir = (ruta) => {
  const a = ARCHIVOS[ruta] || ARCHIVOS['/index.html']; // rutas de la app (SPA) devuelven index.html
  return new Response(a.texto, {
    headers: { 'content-type': a.tipo, 'cache-control': ruta.endsWith('.html') || !ARCHIVOS[ruta] ? 'no-cache' : 'public, max-age=300', ...CABECERAS },
  });
};

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (/^\/(api|webhook|d)\//.test(pathname)) return app.fetch(request, env, ctx);
    return servir(pathname === '/' ? '/index.html' : pathname);
  },
  scheduled: app.scheduled,
};
