// Diplomas con el diseño propio del colegio: se sube su PDF sin nombre una sola vez, se marca dónde va
// el nombre y la app genera un diploma por alumno (el armado del PDF/ZIP ocurre en el navegador).
import { json, cuerpo, falla } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { alcanceAlumnos } from '../lib/permisos.js';
import { auditar } from '../lib/auditoria.js';

const MAX_PDF = 1_400_000;
const ESTILOS = ['elegante', 'moderno', 'clasico'];
const num = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def);

export function rutasDiplomas(r) {
  r.get('/api/diplomas/plantilla', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const f = await env.DB.prepare('SELECT nombre_archivo, x_pct, y_pct, tam, color, estilo, actualizado_en FROM diploma_plantillas WHERE colegio_id = ?').bind(ctx.colegioId).first();
    return json({ plantilla: f || null });
  });

  r.get('/api/diplomas/plantilla/archivo', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const f = await env.DB.prepare('SELECT pdf_base64 FROM diploma_plantillas WHERE colegio_id = ?').bind(ctx.colegioId).first();
    if (!f) throw falla(404, 'Todavía no subiste tu diploma');
    const bin = atob(f.pdf_base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  });

  r.put('/api/diplomas/plantilla', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const d = await cuerpo(ctx.request, 2_100_000);
    const actual = await env.DB.prepare('SELECT 1 FROM diploma_plantillas WHERE colegio_id = ?').bind(ctx.colegioId).first();
    const x = num(d.x_pct, 0, 100, 50), y = num(d.y_pct, 0, 100, 50), tam = num(d.tam, 10, 90, 32);
    const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#1e3a8a';
    const estilo = ESTILOS.includes(d.estilo) ? d.estilo : 'elegante';
    if (d.pdf_base64) {
      const b64 = String(d.pdf_base64);
      if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length > Math.ceil(MAX_PDF / 3) * 4) throw falla(400, 'El PDF pesa demasiado (máximo 1,4 MB). Expórtalo de nuevo con menor calidad de imagen.');
      if (atob(b64.slice(0, 12)).slice(0, 4) !== '%PDF') throw falla(400, 'El archivo no es un PDF');
      await env.DB.prepare(
        `INSERT INTO diploma_plantillas (colegio_id, nombre_archivo, pdf_base64, x_pct, y_pct, tam, color, estilo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(colegio_id) DO UPDATE SET nombre_archivo = excluded.nombre_archivo, pdf_base64 = excluded.pdf_base64, x_pct = excluded.x_pct, y_pct = excluded.y_pct,
         tam = excluded.tam, color = excluded.color, estilo = excluded.estilo, actualizado_en = CURRENT_TIMESTAMP`,
      ).bind(ctx.colegioId, String(d.nombre_archivo || 'diploma.pdf').slice(0, 120), b64, x, y, tam, color, estilo).run();
    } else {
      if (!actual) throw falla(400, 'Primero sube el PDF de tu diploma');
      await env.DB.prepare('UPDATE diploma_plantillas SET x_pct = ?, y_pct = ?, tam = ?, color = ?, estilo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE colegio_id = ?')
        .bind(x, y, tam, color, estilo, ctx.colegioId).run();
    }
    await auditar(env, ctx, 'diploma_plantilla', null, null, { archivo: d.nombre_archivo || null });
    return json({ ok: true });
  });

  r.delete('/api/diplomas/plantilla', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    await env.DB.prepare('DELETE FROM diploma_plantillas WHERE colegio_id = ?').bind(ctx.colegioId).run();
    return json({ ok: true });
  });

  // Aulas y alumnos del colegio para elegir a quiénes se les hace el diploma
  r.get('/api/diplomas/alumnos', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const al = alcanceAlumnos(ctx.usuario);
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.nombres, a.apellidos, a.grado, a.seccion FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${al.sql} ORDER BY a.grado, a.seccion, a.apellidos, a.nombres`,
    ).bind(ctx.colegioId, ...al.params).all();
    await auditar(env, ctx, 'listar_alumnos_diploma', null, null, { total: results.length });
    return json({ alumnos: results });
  });
}
