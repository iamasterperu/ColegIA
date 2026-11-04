// App instalable de cada colegio: manifiesto y ícono propios (/i/<colegio>/…).
// La app de cada colegio se abre en /e/<colegio> y su página pública está en /colegio/<colegio>.
import { falla } from '../lib/http.js';
import { nombreCorto, decodificarImagen, imagenFija } from '../lib/marca.js';

const colegioDe = async (env, slug) => {
  const c = await env.DB.prepare('SELECT slug, nombre, nombre_corto, color_primario, logo, icono FROM colegios WHERE slug = ? AND suspendido = 0').bind(String(slug).toLowerCase()).first();
  if (!c) throw falla(404, 'Colegio no encontrado');
  return c;
};

export function rutasInstalacion(r) {
  r.get('/i/:slug/manifest.webmanifest', async (ctx, env) => {
    const c = await colegioDe(env, ctx.params.slug);
    const base = `/e/${c.slug}`, ic = `/i/${c.slug}`;
    const cuerpo = {
      id: base, name: c.nombre, short_name: nombreCorto(c), description: `Chat privado de ${c.nombre}: avisos, pagos, notas y mensajes, en tu celular`,
      lang: 'es-PE', start_url: base, scope: base, display: 'standalone', background_color: '#ffffff', theme_color: c.color_primario || '#00a884',
      icons: [
        { src: `${ic}/icono-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${ic}/icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${ic}/icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    return new Response(JSON.stringify(cuerpo), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=300' } });
  });

  // Ícono del colegio (cualquier tamaño pedido devuelve la misma imagen: el celular la escala)
  r.get('/i/:slug/:archivo', async (ctx, env) => {
    if (!/^icono-\d+\.png$/.test(ctx.params.archivo)) throw falla(404, 'No encontrado');
    const c = await colegioDe(env, ctx.params.slug);
    const fija = imagenFija(c.slug, 'icono') || imagenFija(c.slug, 'logo');
    const img = decodificarImagen(c.icono) || (fija ? { tipo: 'image/png', bytes: Uint8Array.from(atob(fija.b64), (ch) => ch.charCodeAt(0)) } : null) || decodificarImagen(c.logo);
    if (!img) return new Response(null, { status: 302, headers: { location: ctx.params.archivo.includes('180') ? '/icons/apple-touch-icon.png' : ctx.params.archivo.includes('192') ? '/icons/icon-192.png' : '/icons/icon-512.png' } });
    return new Response(img.bytes, { headers: { 'content-type': img.tipo, 'cache-control': 'public, max-age=300' } });
  });
}
