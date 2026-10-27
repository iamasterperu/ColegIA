// Web del personal: documentos del asistente docente, radar, alertas tempranas y tutor IA.
import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { alcanceAlumnos } from '../lib/permisos.js';
import { auditar } from '../lib/auditoria.js';
import { alumnosEnRiesgo, radarExamen } from '../lib/riesgo.js';
import { generarExamen, generarSesion } from '../ia/docente.js';
import { guardarDocumento, PARTES, enlace } from '../ia/documentos.js';
import { hayIA, SinIA } from '../ia/modelo.js';

const puedeDocentes = (u) => ['direccion', 'profesor', 'secretaria'].includes(u.rol);

export function rutasDocente(r) {
  r.get('/api/documentos', async (ctx, env) => {
    exigir(ctx);
    if (!puedeDocentes(ctx.usuario)) throw falla(403, 'Tu rol no tiene acceso');
    const propios = ctx.usuario.rol === 'profesor';
    const { results } = await env.DB.prepare(
      `SELECT d.id, d.tipo, d.titulo, d.grado, d.curso, d.token, d.creado_en, u.nombre AS autor,
              (SELECT COUNT(*) FROM examen_resultados r WHERE r.documento_id = d.id) AS calificados
         FROM documentos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.colegio_id = ? ${propios ? 'AND d.usuario_id = ?' : ''} ORDER BY d.id DESC LIMIT 100`,
    ).bind(ctx.colegioId, ...(propios ? [ctx.usuario.id] : [])).all();
    return json(results.map((d) => ({ ...d, pdfs: PARTES[d.tipo].map(([p, n]) => ({ nombre: n, url: enlace(ctx.url.origin, d.token, p) })) })));
  });

  r.get('/api/documentos/:id', async (ctx, env) => {
    exigir(ctx);
    if (!puedeDocentes(ctx.usuario)) throw falla(403, 'Tu rol no tiene acceso');
    const d = await env.DB.prepare('SELECT * FROM documentos WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!d || (ctx.usuario.rol === 'profesor' && d.usuario_id !== ctx.usuario.id)) throw falla(404, 'Documento no encontrado');
    const contenido = JSON.parse(d.contenido);
    const radar = d.tipo === 'examen' ? await radarExamen(env, { ...d, contenido }) : null;
    if (radar?.alumnos.length) ctx.waitUntil(auditar(env, ctx, 'ver_resultados_examen', 'documento', d.id));
    return json({ ...d, contenido, radar, pdfs: PARTES[d.tipo].map(([p, n]) => ({ nombre: n, url: enlace(ctx.url.origin, d.token, p) })) });
  });

  // Crear desde la web (lo mismo que por WhatsApp)
  r.post('/api/documentos', async (ctx, env) => {
    exigir(ctx);
    if (!['direccion', 'profesor'].includes(ctx.usuario.rol)) throw falla(403, 'Solo profesores y dirección');
    const d = await cuerpo(ctx.request, 10_000);
    const pedido = String(d.pedido || '').trim().slice(0, 500);
    if (pedido.length < 8) throw falla(400, 'Describe qué necesitas');
    if (!hayIA(env)) throw falla(503, 'La IA no está activada en este momento');
    try {
      if (d.tipo === 'sesion') {
        const s = await generarSesion(env, pedido);
        return json(await guardarDocumento(env, ctx.colegioId, ctx.usuario.id, { tipo: 'sesion', titulo: s.titulo || pedido, grado: s.grado, curso: s.curso, pedido, contenido: s }), 201);
      }
      const ex = await generarExamen(env, { pedido });
      return json(await guardarDocumento(env, ctx.colegioId, ctx.usuario.id, { tipo: 'examen', titulo: ex.titulo, grado: ex.grado, curso: ex.curso, pedido, contenido: ex }), 201);
    } catch (e) {
      if (e instanceof SinIA) throw falla(503, e.message);
      throw falla(502, `La IA no pudo completarlo: ${e.message}`);
    }
  });

  r.get('/api/alertas', async (ctx, env) => {
    exigir(ctx);
    if (!['direccion', 'profesor', 'secretaria'].includes(ctx.usuario.rol)) throw falla(403, 'Tu rol no tiene acceso');
    const alcance = ctx.usuario.rol === 'profesor' ? alcanceAlumnos(ctx.usuario) : { sql: '1 = 1', params: [] };
    const riesgo = await alumnosEnRiesgo(env, ctx.colegioId, alcance);
    const { results: tutor } = await env.DB.prepare(
      `SELECT t.tema, t.curso, a.grado, a.seccion, COUNT(*) n, SUM(t.trabado) trabados, COUNT(DISTINCT t.alumno_id) alumnos
         FROM tutor_temas t JOIN alumnos a ON a.id = t.alumno_id
        WHERE t.colegio_id = ? AND t.creado_en >= datetime('now', '-30 days') AND ${alcance.sql}
        GROUP BY t.tema, a.grado, a.seccion ORDER BY trabados DESC, n DESC LIMIT 30`,
    ).bind(ctx.colegioId, ...alcance.params).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_alertas_tempranas', null, null, { alumnos: riesgo.length }));
    return json({ riesgo, tutor });
  });
}
