// Entrada alternativa: el Worker sirve también la app web (ver scripts/empaquetar-estaticos.mjs).
import app from './index.js';
import { ARCHIVOS, CABECERAS } from './estaticos.generado.js';
import { nombreCorto, esc } from './lib/marca.js';

const servir = (ruta) => {
  const a = ARCHIVOS[ruta] || ARCHIVOS['/index.html']; // rutas de la app (SPA) devuelven index.html
  const cuerpo = a.b64 ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : a.texto;
  return new Response(cuerpo, {
    headers: { 'content-type': a.tipo, 'cache-control': ruta.endsWith('.html') || !ARCHIVOS[ruta] ? 'no-cache' : 'public, max-age=300', ...CABECERAS },
  });
};

// App de un colegio (/e/<colegio>): la misma app, con el manifiesto, el ícono y el nombre de ese colegio
async function paginaColegio(env, slug) {
  const c = await env.DB.prepare('SELECT slug, nombre, nombre_corto, color_primario FROM colegios WHERE slug = ? AND suspendido = 0').bind(slug).first().catch(() => null);
  if (!c) return servir('/index.html');
  const corto = esc(nombreCorto(c));
  const texto = ARCHIVOS['/index.html'].texto
    .replace('/manifest.webmanifest', `/i/${c.slug}/manifest.webmanifest`)
    .replace('/icons/apple-touch-icon.png', `/i/${c.slug}/icono-180.png`)
    .replace('<title>ColegIA</title>', `<title>${esc(c.nombre)}</title>`)
    .replace('content="#00a884"', `content="${esc(c.color_primario || '#00a884')}"`)
    .replace('apple-mobile-web-app-title" content="ColegIA"', `apple-mobile-web-app-title" content="${corto}"`)
    .replace('Cargando ColegIA…', 'Cargando…');
  return new Response(texto, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...CABECERAS } });
}

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (/^\/(api|webhook|d|c|i|carta)\//.test(pathname)) return app.fetch(request, env, ctx);
    const dePagina = /^\/e\/([a-z0-9-]{3,30})\/?$/.exec(pathname);
    if (dePagina) return paginaColegio(env, dePagina[1]);
    if (/^\/colegio\/[a-z0-9-]{3,30}\/?$/.exec(pathname)) return servir('/colegio.html');
    // La portada es la página pública de ColegIA; la app (inicio de sesión) vive en /entrar
    return servir(pathname === '/' ? '/colegia.html' : pathname === '/entrar' ? '/index.html' : pathname === '/panel-iamaster' ? '/dueno.html' : pathname.startsWith('/admision/') ? '/admision.html' : pathname);
  },
  scheduled: app.scheduled,
};
