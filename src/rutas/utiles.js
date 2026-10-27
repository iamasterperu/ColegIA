import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar } from '../lib/auditoria.js';
import { cargarConexion, enviar } from '../whatsapp/envio.js';

const MAX_ITEMS = 150;
const LOTE_AVISO = 40;

async function gradosDelPadre(env, usuario) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT a.grado FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = ?`,
  ).bind(usuario.apoderado_id ?? -1).all();
  return results.map((x) => x.grado);
}

export function rutasUtiles(r) {
  r.get('/api/utiles', async (ctx, env) => {
    exigir(ctx, 'utiles.ver');
    let sql = `SELECT l.id, l.grado, l.anio, l.titulo, l.fuente, l.publicada, l.creado_en,
                      (SELECT COUNT(*) FROM utiles_items i WHERE i.lista_id = l.id) AS items
                 FROM listas_utiles l WHERE l.colegio_id = ?`;
    const params = [ctx.colegioId];
    if (ctx.usuario.rol === 'padre') {
      const grados = await gradosDelPadre(env, ctx.usuario);
      if (!grados.length) return json([]);
      sql += ` AND l.publicada = 1 AND l.grado IN (${grados.map(() => '?').join(',')})`;
      params.push(...grados);
    }
    const { results } = await env.DB.prepare(sql + ' ORDER BY l.anio DESC, l.grado').bind(...params).all();
    return json(results);
  });

  r.get('/api/utiles/:id', async (ctx, env) => {
    exigir(ctx, 'utiles.ver');
    const lista = await env.DB.prepare('SELECT * FROM listas_utiles WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!lista) throw falla(404, 'Lista no encontrada');
    if (ctx.usuario.rol === 'padre' && (!lista.publicada || !(await gradosDelPadre(env, ctx.usuario)).includes(lista.grado))) {
      throw falla(404, 'Lista no encontrada');
    }
    const { results } = await env.DB.prepare('SELECT cantidad, descripcion, detalle FROM utiles_items WHERE lista_id = ? ORDER BY orden').bind(lista.id).all();
    return json({ ...lista, items: results });
  });

  // Guarda (o reemplaza) la lista de un grado. Los ítems llegan ya leídos en el
  // navegador desde Excel o desde la foto: el Worker solo valida y guarda.
  r.post('/api/utiles', async (ctx, env) => {
    exigir(ctx, 'utiles.editar');
    const d = await cuerpo(ctx.request, 60_000);
    const grado = String(d.grado || '').trim().slice(0, 40);
    const anio = entero(d.anio, new Date().getFullYear());
    const fuente = ['manual', 'excel', 'foto'].includes(d.fuente) ? d.fuente : 'manual';
    const items = (Array.isArray(d.items) ? d.items : [])
      .map((i) => ({
        cantidad: String(i.cantidad ?? '').trim().slice(0, 20) || null,
        descripcion: String(i.descripcion ?? '').trim().slice(0, 200),
        detalle: String(i.detalle ?? '').trim().slice(0, 200) || null,
      }))
      .filter((i) => i.descripcion)
      .slice(0, MAX_ITEMS);
    if (!grado) throw falla(400, 'Elige el grado');
    if (!items.length) throw falla(400, 'La lista no tiene ítems');
    const titulo = String(d.titulo || `Lista de útiles ${grado} ${anio}`).trim().slice(0, 120);

    const lista = await env.DB.prepare(
      `INSERT INTO listas_utiles (colegio_id, grado, anio, titulo, fuente, creado_por) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(colegio_id, grado, anio) DO UPDATE SET titulo = excluded.titulo, fuente = excluded.fuente,
         creado_por = excluded.creado_por, creado_en = datetime('now')
       RETURNING id`,
    ).bind(ctx.colegioId, grado, anio, titulo, fuente, ctx.usuario.id).first();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM utiles_items WHERE lista_id = ?').bind(lista.id),
      ...items.map((i, n) => env.DB.prepare(
        'INSERT INTO utiles_items (lista_id, orden, cantidad, descripcion, detalle) VALUES (?, ?, ?, ?, ?)',
      ).bind(lista.id, n, i.cantidad, i.descripcion, i.detalle)),
    ]);
    await auditar(env, ctx, 'guardar_lista_utiles', 'lista_utiles', lista.id, { grado, fuente, items: items.length });
    return json({ id: lista.id, items: items.length });
  });

  r.post('/api/utiles/:id/publicar', async (ctx, env) => {
    exigir(ctx, 'utiles.editar');
    const d = await cuerpo(ctx.request, 1000);
    const res = await env.DB.prepare('UPDATE listas_utiles SET publicada = ? WHERE id = ? AND colegio_id = ?')
      .bind(d.publicada ? 1 : 0, entero(ctx.params.id), ctx.colegioId).run();
    if (!res.meta.changes) throw falla(404, 'Lista no encontrada');
    return json({ ok: true });
  });

  r.delete('/api/utiles/:id', async (ctx, env) => {
    exigir(ctx, 'utiles.editar');
    const id = entero(ctx.params.id);
    const lista = await env.DB.prepare('SELECT id FROM listas_utiles WHERE id = ? AND colegio_id = ?').bind(id, ctx.colegioId).first();
    if (!lista) throw falla(404, 'Lista no encontrada');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM utiles_items WHERE lista_id = ?').bind(id),
      env.DB.prepare('DELETE FROM listas_utiles WHERE id = ?').bind(id),
    ]);
    await auditar(env, ctx, 'borrar_lista_utiles', 'lista_utiles', id);
    return json({ ok: true });
  });

  // Avisa por WhatsApp a los apoderados del grado que autorizaron el canal.
  // Va por lotes: el navegador repite la llamada mientras queden pendientes.
  r.post('/api/utiles/:id/notificar', async (ctx, env) => {
    exigir(ctx, 'utiles.editar');
    const lista = await env.DB.prepare('SELECT * FROM listas_utiles WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!lista) throw falla(404, 'Lista no encontrada');
    if (!lista.publicada) throw falla(409, 'Publica la lista antes de avisar a los padres');
    const motivo = `utiles:${lista.id}`;
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT ap.id, ap.nombres, ap.telefono FROM alumnos a
         JOIN alumno_apoderado aa ON aa.alumno_id = a.id JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE a.colegio_id = ? AND a.grado = ? AND a.estado = 'matriculado' AND ap.telefono IS NOT NULL
          AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = a.id
                AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1
          AND NOT EXISTS (SELECT 1 FROM mensajes m WHERE m.colegio_id = a.colegio_id AND m.apoderado_id = ap.id AND m.motivo = ?)
        LIMIT ?`,
    ).bind(ctx.colegioId, lista.grado, motivo, LOTE_AVISO + 1).all();
    const lote = results.slice(0, LOTE_AVISO);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const conexion = await cargarConexion(env, colegio);
    let enviados = 0;
    for (const ap of lote) {
      const texto = `Hola ${ap.nombres}, ya está publicada la *${lista.titulo}*. Escribe *ÚTILES* para recibirla aquí.`;
      const r2 = await enviar(env, conexion, {
        telefono: ap.telefono, apoderadoId: ap.id, texto, motivo, enviadoPor: ctx.usuario.id,
        plantilla: colegio.wa_plantilla_aviso ? { nombre: colegio.wa_plantilla_aviso, parametros: [ap.nombres, lista.titulo] } : null,
      });
      if (r2.estado === 'ok') enviados++;
    }
    await auditar(env, ctx, 'avisar_lista_utiles', 'lista_utiles', lista.id, { enviados });
    return json({ enviados, quedan: results.length > LOTE_AVISO });
  });
}
