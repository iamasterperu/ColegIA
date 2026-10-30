// Panel de automatización: avisos automáticos, comunicados por aprobar, cumpleaños, personal,
// asistencia con la toma de lista, reportes, reinscripción y comprobantes electrónicos.
import { json, cuerpo, falla, entero, hoyLima } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { tiene, alcanceAlumnos } from '../lib/permisos.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';
import { sentenciasAsistencia, sentenciaLista, resumenAsistenciaDia } from '../lib/asistencia.js';
import { guardarConfig, configurado, emitirPago } from '../lib/nubefact.js';
import { guardarPieza } from '../lib/plantillas.js';
import { decidirBorrador, cumpleHoy, construirReporte, enviarReporteMensual, nombreMes, examenesDelDia } from '../whatsapp/automatizacion.js';
import { iniciarReinscripcion } from '../whatsapp/reinscripcion.js';
import { procesarCola } from '../whatsapp/comun.js';
import { cargarConexion } from '../whatsapp/envio.js';

const TOGGLES = ['cumple_auto', 'fiestas_auto', 'reporte_auto', 'asistencia_reporte', 'resumen_diario', 'recordatorio_auto', 'alertas_padres'];
const fechaOk = (f) => f === '' || f === null || (/^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f)));
const colegioDe = (env, id) => env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(id).first();

export function rutasAutomatizacion(r) {
  // ---- Estado general ----
  r.get('/api/automatizacion', async (ctx, env) => {
    exigir(ctx, 'comunicados.aprobar');
    const admin = tiene(ctx.usuario, 'automatizacion.editar');
    const c = await colegioDe(env, ctx.colegioId);
    const [borradores, personal, usuarios, comp] = await env.DB.batch([
      env.DB.prepare("SELECT id, titulo, fecha, texto, estado FROM borradores WHERE colegio_id = ? ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, fecha DESC LIMIT 30").bind(ctx.colegioId),
      env.DB.prepare('SELECT id, nombre, cargo, telefono, fecha_nacimiento, activo FROM personal WHERE colegio_id = ? ORDER BY nombre').bind(ctx.colegioId),
      env.DB.prepare("SELECT id, nombre, rol, telefono, fecha_nacimiento FROM usuarios WHERE colegio_id = ? AND rol != 'padre' AND activo = 1 ORDER BY nombre").bind(ctx.colegioId),
      env.DB.prepare('SELECT id, tipo, serie, numero, cliente_nombre, total_centimos, estado, enlace_pdf, detalle, creado_en FROM comprobantes WHERE colegio_id = ? ORDER BY id DESC LIMIT 30').bind(ctx.colegioId),
    ]);
    return json({
      admin, borradores: borradores.results, cumples_hoy: await cumpleHoy(env, ctx.colegioId),
      ...(admin ? {
        config: Object.fromEntries(TOGGLES.map((k) => [k, c[k] ? 1 : 0])), personal: personal.results, usuarios: usuarios.results,
        nubefact: { configurado: configurado(c), ruta: c.nbf_ruta || '', serie_boleta: c.nbf_serie_boleta || '', serie_factura: c.nbf_serie_factura || '', tipo_igv: c.nbf_tipo_igv, token_guardado: !!c.nbf_token_cifrado },
        comprobantes: comp.results,
      } : {}),
    });
  });

  r.put('/api/automatizacion', async (ctx, env) => {
    exigir(ctx, 'automatizacion.editar');
    const d = await cuerpo(ctx.request, 3000);
    const campos = TOGGLES.filter((k) => d[k] !== undefined);
    if (!campos.length) throw falla(400, 'Nada que guardar');
    await env.DB.batch([
      env.DB.prepare(`UPDATE colegios SET ${campos.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...campos.map((k) => (d[k] ? 1 : 0)), ctx.colegioId),
      sentenciaAuditoria(env, ctx, 'editar_automatizacion', 'colegio', ctx.colegioId, Object.fromEntries(campos.map((k) => [k, d[k] ? 1 : 0]))),
    ]);
    return json({ ok: true });
  });

  // ---- Comunicados por aprobar ----
  const decidir = (accion) => async (ctx, env) => {
    exigir(ctx, 'comunicados.aprobar');
    const d = accion === 'editar' ? await cuerpo(ctx.request, 3000) : {};
    const colegio = await colegioDe(env, ctx.colegioId);
    const res = await decidirBorrador(env, colegio, entero(ctx.params.id), accion, ctx.usuario, d.texto);
    if (!res.ok) throw falla(400, res.texto.replace(/\*/g, ''));
    if (res.enviarCola) ctx.waitUntil(procesarCola(env, 30, cargarConexion));
    return json({ ok: true, mensaje: res.texto.replace(/\*/g, '') });
  };
  r.post('/api/borradores/:id/aprobar', decidir('aprobar'));
  r.post('/api/borradores/:id/rechazar', decidir('rechazar'));
  r.put('/api/borradores/:id', decidir('editar'));

  // ---- Personal sin acceso a la app y fechas de cumpleaños ----
  r.post('/api/personal', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const d = await cuerpo(ctx.request, 2000);
    const nombre = String(d.nombre || '').trim().slice(0, 100);
    if (nombre.length < 3) throw falla(400, 'Escribe el nombre');
    if (!fechaOk(d.fecha_nacimiento ?? '')) throw falla(400, 'Fecha inválida');
    const tel = String(d.telefono || '').replace(/\D/g, '');
    const f = await env.DB.prepare('INSERT INTO personal (colegio_id, nombre, cargo, telefono, fecha_nacimiento) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(ctx.colegioId, nombre, String(d.cargo || '').slice(0, 60) || null, tel || null, d.fecha_nacimiento || null).first();
    return json({ id: f.id }, 201);
  });
  r.put('/api/personal/:id', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const d = await cuerpo(ctx.request, 2000);
    if (!fechaOk(d.fecha_nacimiento ?? '')) throw falla(400, 'Fecha inválida');
    const tel = d.telefono !== undefined ? String(d.telefono).replace(/\D/g, '') : undefined;
    const res = await env.DB.prepare(
      'UPDATE personal SET fecha_nacimiento = COALESCE(?, fecha_nacimiento), telefono = COALESCE(?, telefono), cargo = COALESCE(?, cargo), activo = COALESCE(?, activo) WHERE id = ? AND colegio_id = ?',
    ).bind(d.fecha_nacimiento || null, tel || null, d.cargo ?? null, d.activo === undefined ? null : (d.activo ? 1 : 0), entero(ctx.params.id), ctx.colegioId).run();
    if (!res.meta.changes) throw falla(404, 'No encontrado');
    return json({ ok: true });
  });
  // Fecha de cumpleaños de un usuario del colegio o de un apoderado
  r.put('/api/cumpleanos', async (ctx, env) => {
    const d = await cuerpo(ctx.request, 500);
    if (!fechaOk(d.fecha ?? '')) throw falla(400, 'Fecha inválida');
    const id = entero(d.id);
    if (d.tipo === 'usuario') {
      exigir(ctx, 'usuarios.gestionar');
      await env.DB.prepare("UPDATE usuarios SET fecha_nacimiento = ? WHERE id = ? AND colegio_id = ? AND rol != 'padre'").bind(d.fecha || null, id, ctx.colegioId).run();
    } else if (d.tipo === 'apoderado') {
      exigir(ctx, 'alumnos.editar');
      await env.DB.prepare('UPDATE apoderados SET fecha_nacimiento = ? WHERE id = ? AND colegio_id = ?').bind(d.fecha || null, id, ctx.colegioId).run();
    } else throw falla(400, 'Tipo inválido');
    return json({ ok: true });
  });

  // ---- Asistencia: toma de lista desde la web ----
  const seccionesDe = async (ctx, env) => {
    const al = alcanceAlumnos(ctx.usuario);
    const { results } = await env.DB.prepare(
      `SELECT a.grado, a.seccion, COUNT(*) alumnos FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${al.sql} GROUP BY a.grado, a.seccion ORDER BY a.grado, a.seccion`,
    ).bind(ctx.colegioId, ...al.params).all();
    return results;
  };
  r.get('/api/asistencia/secciones', async (ctx, env) => {
    exigir(ctx, 'asistencia.tomar');
    return json({ secciones: await seccionesDe(ctx, env), fecha: hoyLima() });
  });
  r.get('/api/asistencia/lista', async (ctx, env) => {
    exigir(ctx, 'asistencia.tomar');
    const grado = ctx.url.searchParams.get('grado');
    const seccion = ctx.url.searchParams.get('seccion');
    const fecha = ctx.url.searchParams.get('fecha') || hoyLima();
    if (!(await seccionesDe(ctx, env)).some((s) => s.grado === grado && s.seccion === seccion)) throw falla(403, 'Esa sección no es tuya');
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.nombres, a.apellidos, COALESCE(d.estado, 'presente') estado FROM alumnos a LEFT JOIN asistencia_diaria d ON d.alumno_id = a.id AND d.fecha = ?
        WHERE a.colegio_id = ? AND a.grado = ? AND a.seccion = ? AND a.estado = 'matriculado' ORDER BY a.apellidos, a.nombres`,
    ).bind(fecha, ctx.colegioId, grado, seccion).all();
    const hecha = await env.DB.prepare('SELECT 1 FROM asistencia_listas WHERE colegio_id = ? AND grado = ? AND seccion = ? AND fecha = ?').bind(ctx.colegioId, grado, seccion, fecha).first();
    return json({ alumnos: results, fecha, tomada: !!hecha });
  });
  r.post('/api/asistencia/lista', async (ctx, env) => {
    exigir(ctx, 'asistencia.tomar');
    const d = await cuerpo(ctx.request, 60000);
    const fecha = fechaOk(d.fecha) && d.fecha ? d.fecha : hoyLima();
    if (fecha > hoyLima()) throw falla(400, 'No se puede tomar lista de un día futuro');
    if (!(await seccionesDe(ctx, env)).some((s) => s.grado === d.grado && s.seccion === d.seccion)) throw falla(403, 'Esa sección no es tuya');
    const { results } = await env.DB.prepare("SELECT id FROM alumnos WHERE colegio_id = ? AND grado = ? AND seccion = ? AND estado = 'matriculado'").bind(ctx.colegioId, d.grado, d.seccion).all();
    const validos = new Set(results.map((x) => x.id));
    const estados = new Map((d.registros || []).map((x) => [Number(x.alumno_id), x.estado]));
    const registros = [...validos].map((id) => ({ alumnoId: id, estado: ['falta', 'tardanza'].includes(estados.get(id)) ? estados.get(id) : 'presente' }));
    await env.DB.batch([
      ...(await sentenciasAsistencia(env, ctx.colegioId, fecha, registros, ctx.usuario.id)),
      sentenciaLista(env, ctx.colegioId, d.grado, d.seccion, fecha, ctx.usuario.id),
      sentenciaAuditoria(env, ctx, 'tomar_lista', null, null, { grado: d.grado, seccion: d.seccion, fecha, faltas: registros.filter((x) => x.estado === 'falta').length }),
    ]);
    return json({ ok: true, presentes: registros.filter((x) => x.estado === 'presente').length });
  });
  r.get('/api/asistencia/dia', async (ctx, env) => {
    exigir(ctx, 'asistencia.ver');
    const fecha = ctx.url.searchParams.get('fecha') || hoyLima();
    return json({ ...(await resumenAsistenciaDia(env, ctx.colegioId, fecha)), examenes: await examenesDelDia(env, ctx.colegioId, fecha) });
  });

  // ---- Reportes ----
  r.get('/api/reportes/mes', async (ctx, env) => {
    exigir(ctx, 'reportes.ver');
    const mes = /^\d{4}-\d{2}$/.test(ctx.url.searchParams.get('mes') || '') ? ctx.url.searchParams.get('mes') : hoyLima().slice(0, 7);
    return json({ mes, nombre: nombreMes(mes), secciones: await construirReporte(env, await colegioDe(env, ctx.colegioId), mes) });
  });
  r.post('/api/reportes/enviar', async (ctx, env) => {
    exigir(ctx, 'reportes.ver');
    const d = await cuerpo(ctx.request, 300);
    const mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : hoyLima().slice(0, 7);
    await enviarReporteMensual(env, await colegioDe(env, ctx.colegioId), mes);
    ctx.waitUntil(procesarCola(env, 30, cargarConexion));
    return json({ ok: true });
  });
  r.get('/api/examenes', async (ctx, env) => {
    exigir(ctx, 'reportes.ver');
    const { results } = await env.DB.prepare(
      `SELECT d.id, d.tipo, d.titulo, d.grado, d.curso, d.fuente, d.creado_en, u.nombre profesor FROM documentos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.colegio_id = ? ORDER BY d.id DESC LIMIT 100`,
    ).bind(ctx.colegioId).all();
    return json({ documentos: results });
  });

  // ---- Reinscripción ----
  r.get('/api/reinscripcion', async (ctx, env) => {
    exigir(ctx, 'reinscripcion.gestionar');
    const c = await colegioDe(env, ctx.colegioId);
    const anio = c.anio_escolar + 1;
    const [res, pend] = await env.DB.batch([
      env.DB.prepare('SELECT estado, COUNT(*) n FROM reinscripciones WHERE colegio_id = ? AND anio = ? GROUP BY estado').bind(ctx.colegioId, anio),
      env.DB.prepare(`SELECT a.nombres, a.apellidos, a.grado, a.seccion, r.estado FROM reinscripciones r JOIN alumnos a ON a.id = r.alumno_id
        WHERE r.colegio_id = ? AND r.anio = ? AND r.estado != 'confirmada' ORDER BY r.estado, a.grado, a.apellidos LIMIT 100`).bind(ctx.colegioId, anio),
    ]);
    return json({ anio, resumen: Object.fromEntries(res.results.map((x) => [x.estado, x.n])), lista: pend.results });
  });
  r.post('/api/reinscripcion/iniciar', async (ctx, env) => {
    exigir(ctx, 'reinscripcion.gestionar');
    const res = await iniciarReinscripcion(env, await colegioDe(env, ctx.colegioId), ctx.usuario);
    ctx.waitUntil(procesarCola(env, 30, cargarConexion));
    return json(res);
  });

  // ---- Comprobantes (Nubefact) ----
  r.put('/api/nubefact', async (ctx, env) => {
    exigir(ctx, 'ajustes.editar');
    const d = await cuerpo(ctx.request, 2000);
    try { await guardarConfig(env, ctx.colegioId, d); } catch (e) { throw falla(400, e.message); }
    await sentenciaAuditoria(env, ctx, 'editar_nubefact', 'colegio', ctx.colegioId, { token: d.token ? 'actualizado' : 'sin cambios' }).run();
    return json({ ok: true });
  });
  r.post('/api/comprobantes', async (ctx, env) => {
    exigir(ctx, 'comprobantes.emitir');
    const d = await cuerpo(ctx.request, 1000);
    try {
      const c = await emitirPago(env, await colegioDe(env, ctx.colegioId), entero(d.pago_id), { tipo: d.tipo === 'factura' ? 'factura' : 'boleta', ruc: d.ruc, razon: d.razon, usuarioId: ctx.usuario.id });
      await sentenciaAuditoria(env, ctx, 'emitir_comprobante', 'alumno', c.alumno_id, { serie: c.serie, numero: c.numero }).run();
      return json({ ok: true, serie: c.serie, numero: c.numero, enlace_pdf: c.enlace_pdf }, 201);
    } catch (e) { throw falla(400, e.message); }
  });
}
