import { json, cuerpo, falla, entero, hoyLima, soles } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { cargarConexion, enviar } from '../whatsapp/envio.js';

const MEDIOS = ['efectivo', 'transferencia', 'yape', 'plin', 'tarjeta', 'deposito'];
const DIAS_ENTRE_RECORDATORIOS = 5;
const LOTE_ENVIO = 40; // por solicitud, para no pasar los límites del plan gratis

export function rutasPagos(r) {
  r.get('/api/pagos', async (ctx, env) => {
    exigir(ctx, 'pagos.ver');
    const p = ctx.url.searchParams;
    const hoy = hoyLima();
    const cond = ['p.colegio_id = ?', "p.estado != 'anulado'"];
    const params = [ctx.colegioId];
    const filtro = p.get('filtro') || 'vencidos';
    if (filtro === 'vencidos') { cond.push("p.estado = 'pendiente' AND p.vencimiento < ?"); params.push(hoy); }
    if (filtro === 'proximos') { cond.push("p.estado = 'pendiente' AND p.vencimiento BETWEEN ? AND ?"); params.push(hoy, hoyLima(15)); }
    if (filtro === 'pagados') cond.push("p.estado = 'pagado'");
    if (p.get('grado')) { cond.push('a.grado = ?'); params.push(p.get('grado')); }
    if (p.get('periodo')) { cond.push('p.periodo = ?'); params.push(p.get('periodo')); }
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.concepto, p.periodo, p.monto_centimos, p.vencimiento, p.estado, p.pagado_en, p.medio,
              a.id AS alumno_id, a.nombres, a.apellidos, a.grado, a.seccion,
              (SELECT MAX(creado_en) FROM recordatorios rc WHERE rc.pago_id = p.id) AS ultimo_recordatorio
         FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
        WHERE ${cond.join(' AND ')} ORDER BY ${filtro === 'pagados' ? 'p.pagado_en DESC' : 'p.vencimiento, a.apellidos'} LIMIT 300`,
    ).bind(...params).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_pagos', null, null, { filtro, filas: results.length }));
    return json({ pagos: results, hoy });
  });

  r.post('/api/pagos/:id/pagar', async (ctx, env) => {
    exigir(ctx, 'pagos.editar');
    const d = await cuerpo(ctx.request, 2000);
    const medio = MEDIOS.includes(d.medio) ? d.medio : 'efectivo';
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? d.fecha : hoyLima();
    const pago = await env.DB.prepare('SELECT id, alumno_id, estado FROM pagos WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!pago) throw falla(404, 'Cuota no encontrada');
    if (pago.estado === 'pagado') throw falla(409, 'Esta cuota ya estaba pagada');
    await env.DB.batch([
      env.DB.prepare("UPDATE pagos SET estado = 'pagado', pagado_en = ?, medio = ?, registrado_por = ? WHERE id = ?")
        .bind(fecha, medio, ctx.usuario.id, pago.id),
      sentenciaAuditoria(env, ctx, 'registrar_pago', 'alumno', pago.alumno_id, { pago_id: pago.id, medio }),
    ]);
    return json({ ok: true });
  });

  r.post('/api/pagos/:id/anular-pago', async (ctx, env) => {
    exigir(ctx, 'pagos.editar');
    const pago = await env.DB.prepare('SELECT id, alumno_id FROM pagos WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!pago) throw falla(404, 'Cuota no encontrada');
    await env.DB.batch([
      env.DB.prepare("UPDATE pagos SET estado = 'pendiente', pagado_en = NULL, medio = NULL WHERE id = ?").bind(pago.id),
      sentenciaAuditoria(env, ctx, 'revertir_pago', 'alumno', pago.alumno_id, { pago_id: pago.id }),
    ]);
    return json({ ok: true });
  });

  // Cuotas a recordar, con el apoderado responsable de pago y su consentimiento
  r.get('/api/recordatorios', async (ctx, env) => {
    exigir(ctx, 'recordatorios.enviar');
    const tipo = ctx.url.searchParams.get('tipo') === 'previo' ? 'previo' : 'vencido';
    const colegio = await env.DB.prepare('SELECT recordatorio_dias_antes, wa_modo, recordatorio_auto FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const filas = await cuotasParaRecordar(env, ctx.colegioId, tipo, colegio.recordatorio_dias_antes, 300);
    const { results: historial } = await env.DB.prepare(
      `SELECT r.tipo, r.origen, r.creado_en, m.canal, m.estado, a.nombres || ' ' || a.apellidos AS alumno, p.concepto
         FROM recordatorios r JOIN pagos p ON p.id = r.pago_id JOIN alumnos a ON a.id = p.alumno_id
         LEFT JOIN mensajes m ON m.id = r.mensaje_id
        WHERE r.colegio_id = ? ORDER BY r.id DESC LIMIT 30`,
    ).bind(ctx.colegioId).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_recordatorios', null, null, { tipo, filas: filas.length }));
    return json({ cuotas: filas, historial, ajustes: colegio, dias_entre: DIAS_ENTRE_RECORDATORIOS });
  });

  r.post('/api/recordatorios/enviar', async (ctx, env) => {
    exigir(ctx, 'recordatorios.enviar');
    const d = await cuerpo(ctx.request, 20_000);
    const ids = (Array.isArray(d.pago_ids) ? d.pago_ids : []).map((x) => entero(x)).filter(Boolean).slice(0, LOTE_ENVIO);
    if (!ids.length) throw falla(400, 'Elige al menos una cuota');
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const { results } = await env.DB.prepare(
      `${SQL_CUOTAS} AND p.id IN (${ids.map(() => '?').join(',')})`,
    ).bind(hoyLima(), ctx.colegioId, ...ids).all();
    const resultado = await enviarRecordatorios(env, colegio, results, 'manual', ctx.usuario.id);
    await auditar(env, ctx, 'enviar_recordatorios', null, null, resultado);
    return json(resultado);
  });
}

const haceDias = (n) => new Date(Date.now() - n * 86400_000).toISOString().replace('T', ' ').slice(0, 19);

const SQL_CUOTAS = `
  SELECT p.id AS pago_id, p.concepto, p.monto_centimos, p.vencimiento, a.id AS alumno_id,
         a.nombres AS alumno_nombres, a.apellidos AS alumno_apellidos, a.grado, a.seccion,
         ap.id AS apoderado_id, ap.nombres AS apoderado_nombres, ap.apellidos AS apoderado_apellidos, ap.telefono,
         CASE WHEN p.vencimiento < ? THEN 'vencido' ELSE 'previo' END AS tipo,
         (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = a.id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) AS consiente,
         (SELECT MAX(creado_en) FROM recordatorios rc WHERE rc.pago_id = p.id) AS ultimo_recordatorio
    FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
    JOIN alumno_apoderado aa ON aa.alumno_id = a.id AND aa.responsable_pago = 1
    JOIN apoderados ap ON ap.id = aa.apoderado_id
   WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND a.estado = 'matriculado'`;

// soloEnviables: descarta en SQL las cuotas que no se enviarían (sin consentimiento,
// sin teléfono o recordadas hace poco), para que el LIMIT del cron no se llene de ellas.
export async function cuotasParaRecordar(env, colegioId, tipo, diasAntes, limite, soloEnviables = false) {
  const hoy = hoyLima();
  const rango = tipo === 'previo'
    ? { sql: 'AND p.vencimiento BETWEEN ? AND ?', params: [hoy, hoyLima(diasAntes)] }
    : { sql: 'AND p.vencimiento < ?', params: [hoy] };
  if (soloEnviables) {
    rango.sql += ' AND ap.telefono IS NOT NULL AND consiente = 1 AND (ultimo_recordatorio IS NULL OR ultimo_recordatorio < ?)';
    rango.params.push(haceDias(DIAS_ENTRE_RECORDATORIOS));
  }
  const { results } = await env.DB.prepare(`${SQL_CUOTAS} ${rango.sql} ORDER BY p.vencimiento, a.apellidos LIMIT ?`)
    .bind(hoy, colegioId, ...rango.params, limite).all();
  return results;
}

export function textoRecordatorio(c) {
  const alumno = c.alumno_nombres;
  if (c.tipo === 'vencido') {
    return `Hola ${c.apoderado_nombres}, le recordamos que la cuota *${c.concepto}* de ${alumno} por ${soles(c.monto_centimos)} ` +
      `venció el ${c.vencimiento.split('-').reverse().join('/')}. Si ya pagó, ignore este mensaje. Escriba *MENÚ* para ver opciones.`;
  }
  return `Hola ${c.apoderado_nombres}, le recordamos que la cuota *${c.concepto}* de ${alumno} por ${soles(c.monto_centimos)} ` +
    `vence el ${c.vencimiento.split('-').reverse().join('/')}. Escriba *CÓMO PAGO* para ver las cuentas del colegio.`;
}

// Envía recordatorios respetando consentimiento y frecuencia. Lo usan el botón y el cron.
export async function enviarRecordatorios(env, colegio, cuotas, origen, usuarioId = null) {
  const conexion = await cargarConexion(env, colegio);
  const limiteFecha = haceDias(DIAS_ENTRE_RECORDATORIOS);
  const res = { enviados: 0, simulados: 0, errores: 0, sin_consentimiento: 0, sin_telefono: 0, recientes: 0 };
  for (const c of cuotas) {
    if (!c.telefono) { res.sin_telefono++; continue; }
    if (c.consiente !== 1) { res.sin_consentimiento++; continue; }
    if (c.ultimo_recordatorio && c.ultimo_recordatorio > limiteFecha) { res.recientes++; continue; }
    const texto = textoRecordatorio(c);
    const envio = await enviar(env, conexion, {
      telefono: c.telefono, apoderadoId: c.apoderado_id, texto, motivo: 'recordatorio', enviadoPor: usuarioId,
      plantilla: colegio.wa_plantilla_recordatorio ? {
        nombre: colegio.wa_plantilla_recordatorio,
        parametros: [c.apoderado_nombres, c.alumno_nombres, c.concepto, (c.monto_centimos / 100).toFixed(2),
          c.vencimiento.split('-').reverse().join('/')],
      } : null,
    });
    await env.DB.prepare('INSERT INTO recordatorios (colegio_id, pago_id, apoderado_id, mensaje_id, tipo, origen) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(colegio.id, c.pago_id, c.apoderado_id, envio.id, c.tipo, origen).run();
    if (envio.estado === 'error') res.errores++;
    else if (envio.canal === 'cloud') res.enviados++;
    else res.simulados++;
  }
  return res;
}

// Cron: recordatorios automáticos de los colegios que lo activaron. El plan gratis
// permite 50 llamadas externas por ejecución, así que cada corrida envía hasta 40 y el
// cron corre cada hora de 8 a. m. a 5 p. m. (Lima) hasta terminar la cola del día.
export const ENVIOS_POR_CORRIDA = 40;

export async function cronRecordatorios(env, presupuestoTotal = ENVIOS_POR_CORRIDA) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE recordatorio_auto = 1 ORDER BY RANDOM()').all();
  let presupuesto = presupuestoTotal;
  for (const colegio of colegios) {
    if (presupuesto <= 0) break;
    const previas = await cuotasParaRecordar(env, colegio.id, 'previo', colegio.recordatorio_dias_antes, presupuesto, true);
    const vencidas = await cuotasParaRecordar(env, colegio.id, 'vencido', 0, presupuesto - previas.length, true);
    const cuotas = [...previas, ...vencidas];
    if (!cuotas.length) continue;
    presupuesto -= cuotas.length;
    const res = await enviarRecordatorios(env, colegio, cuotas, 'automatico');
    await env.DB.prepare(
      "INSERT INTO auditoria (colegio_id, usuario_nombre, rol, accion, detalle) VALUES (?, 'Sistema', 'sistema', 'recordatorios_automaticos', ?)",
    ).bind(colegio.id, JSON.stringify(res)).run();
  }
}
