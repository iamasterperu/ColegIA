// Páginas públicas por enlace secreto: tarjetas, comunicados y reportes con la plantilla del colegio,
// y la carta de presentación del colegio para familias nuevas.
import { respuestaPieza } from '../lib/plantillas.js';
import { responderCarta } from '../lib/carta.js';

async function pieza(env, token, parte) {
  const p = await env.DB.prepare('SELECT * FROM piezas WHERE token = ?').bind(token).first();
  if (!p) return new Response('No encontrado', { status: 404 });
  const colegio = await env.DB.prepare('SELECT nombre, direccion, telefono, color_primario, color_secundario FROM colegios WHERE id = ?').bind(p.colegio_id).first();
  p.contenido = JSON.parse(p.contenido);
  return respuestaPieza(p, colegio, parte);
}

export function rutasPublicas(r) {
  r.get('/c/:token', (ctx, env) => pieza(env, ctx.params.token, null));
  r.get('/c/:token/:parte', (ctx, env) => pieza(env, ctx.params.token, ctx.params.parte === 'pdf' ? 'pdf' : null));
  r.get('/carta/:slug', (ctx, env) => responderCarta(env, ctx.params.slug, null));
  r.get('/carta/:slug/:parte', (ctx, env) => responderCarta(env, ctx.params.slug, ctx.params.parte));
}
