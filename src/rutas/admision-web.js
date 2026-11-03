// Chat público para familias nuevas: un enlace (o QR) por colegio, sin cuenta ni WhatsApp.
// Solo responde con lo que el colegio aprobó y deja el contacto para secretaría.
import { json, cuerpo, falla, entero } from '../lib/http.js';
import { procesarEntrante } from '../whatsapp/agente.js';

const MAX_POR_HORA = 40;

async function colegioPublico(env, slug) {
  const c = await env.DB.prepare('SELECT * FROM colegios WHERE slug = ? AND suspendido = 0').bind(String(slug)).first();
  if (!c) throw falla(404, 'Colegio no encontrado');
  return c;
}

const visitanteOk = (v) => (/^[a-f0-9]{16,40}$/.test(String(v || '')) ? String(v) : null);

export function rutasAdmisionWeb(r) {
  r.get('/api/publico/admision/:slug', async (ctx, env) => {
    const c = await colegioPublico(env, ctx.params.slug);
    return json({ nombre: c.nombre, color_primario: c.color_primario, color_secundario: c.color_secundario });
  });

  r.post('/api/publico/admision/:slug/chat', async (ctx, env) => {
    const colegio = await colegioPublico(env, ctx.params.slug);
    const d = await cuerpo(ctx.request, 4000);
    const visitante = visitanteOk(d.visitante);
    if (!visitante) throw falla(400, 'Solicitud no válida');
    const texto = String(d.texto || '').trim().slice(0, 500);
    if (!texto) throw falla(400, 'Escribe un mensaje');
    const telefono = `web-${visitante}`;
    const { n } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mensajes WHERE colegio_id = ? AND telefono = ? AND sentido = 'entrante' AND creado_en > datetime('now','-1 hour')",
    ).bind(colegio.id, telefono).first();
    if (n >= MAX_POR_HORA) throw falla(429, 'Has enviado muchos mensajes. Intenta de nuevo en un rato o escribe a secretaría.');
    await procesarEntrante(env, { colegio, modo: 'simulado', numerosPrueba: [] }, { telefono, tipo: 'texto', texto, publico: true, origen: ctx.url.origin });
    const { results } = await env.DB.prepare(
      'SELECT id, sentido, tipo, texto, creado_en FROM mensajes WHERE colegio_id = ? AND telefono = ? AND id > ? ORDER BY id LIMIT 40',
    ).bind(colegio.id, telefono, entero(d.despues, 0)).all();
    return json({ mensajes: results });
  });
}
